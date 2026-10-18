import { Fragment, useEffect, useState } from 'react'
import Avatar from '../../../components/Avatar'
import { useDialogs } from '../../../components/Dialogs/dialogsContext'
import Icon from '../../../components/Icon'
import TuteurPicker from '../../../components/TuteurPicker/TuteurPicker'
import { useI18n } from '../../../i18n/useI18n'
import { archiveEleve, attachTuteur, changerClasse, detachTuteur, encaisserFrais, getEleve, reinscrire, updateEleve, updateTuteurLink } from '../../../services/dashboardService'
import { MENTIONS_DIPLOME, TYPES_DIPLOME, createDiplome } from '../../../services/diplomesService'
import { champsModifies } from '../../../utils/formulaire'
import { usePaymentFormat } from '../paiements/usePaymentFormat'
import DetailDialog, { DetailField, InfoList } from './DetailDialog'

/** Erreurs de validation Laravel → { champ: message traduit }. */
const fieldErrors = (err, serverMessage) => Object.fromEntries(Object.entries(err.errors || {}).map(([key, messages]) => [key, serverMessage(messages[0], 422, { fallback: 'original' })]))

/**
 * Fiche d'un élève (Admin) : informations, inscriptions et frais d'inscription, tuteurs, diplômes ;
 * modification, réinscription, changement de classe, encaissement des frais (reçu), rattachement
 * (recherche par nom ou téléphone) / retrait d'un tuteur, désignation du payeur, diplôme, archivage.
 * @param {{ id: number, year: string, classes: object[], modes: string[], onClose: () => void, onChanged: (message: string) => void, onSessionExpired: () => void }} props
 *   year : année scolaire courante · classes : classes actives de l'année · modes : modes de paiement
 */
export default function EleveDetail({ id, year, classes, modes = ['especes'], onClose, onChanged, onSessionExpired }) {
  const { t, formatDate, serverMessage } = useI18n()
  const { confirm } = useDialogs()
  const { amount } = usePaymentFormat()
  const [eleve, setEleve] = useState(null)
  // Mode : consultation, modification, réinscription ou archivage
  const [mode, setMode] = useState('view')
  const [values, setValues] = useState({})
  // Valeurs à l'ouverture de la modification : seuls les champs changés sont envoyés
  const [initial, setInitial] = useState({})
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  // Confirmation affichée dans la fenêtre après une modification ; reçu à imprimer après un encaissement
  const [success, setSuccess] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    getEleve(id)
      .then(data => { if (!cancelled) setEleve(data) })
      .catch(err => {
        if (cancelled) return
        if (err.status === 401) { onSessionExpired(); return }
        setMessage(serverMessage(err.message, err.status || 0))
      })
    return () => { cancelled = true }
  }, [id, reload, onSessionExpired, serverMessage])

  function start(next, inscription) {
    setMode(next)
    setErrors({})
    setMessage('')
    setSuccess('')
    setReceipt(null)
    if (next === 'edit') {
      const current = { prenom: eleve.prenom, nom: eleve.nom, date_naissance: eleve.date_naissance ?? '', sexe: eleve.sexe ?? '', adresse: eleve.adresse ?? '' }
      setValues(current)
      setInitial(current)
    }
    if (next === 'reinscrire') setValues({ classe_id: classes[0]?.id ?? '' })
    if (next === 'archive') setValues({ motif: '' })
    if (next === 'tuteur') {
      setValues({
        mode: 'existant', tuteur: null,
        nom: '', prenom: '', telephone: '', sexe: '', adresse: '', lien_parente: '', est_responsable_legal: false, est_payeur: false,
      })
    }
    if (next === 'transfert') setValues({ inscription_id: inscription.id, classe_id: classes.find(c => c.id !== inscription.classe_id)?.id ?? '', motif: '' })
    if (next === 'frais') setValues({ inscription, mode_paiement: modes[0] ?? 'especes' })
    if (next === 'diplome') setValues({ type: 'hifz_partiel', intitule: '', mention: '', date_obtention: new Date().toISOString().slice(0, 10), observations: '' })
  }

  const change = event => {
    const { name, type, checked, value } = event.target
    setValues(previous => ({ ...previous, [name]: type === 'checkbox' ? checked : value }))
  }

  /** Action immédiate (désigner le payeur, retirer un tuteur) : confirmation affichée dans la fenêtre. */
  async function quickAction(request) {
    setBusy(true)
    setMessage('')
    setSuccess('')
    try {
      const response = await request()
      const text = serverMessage(response.message, 200, { fallback: 'original' })
      setSuccess(text)
      onChanged(text)
      setReload(r => r + 1)
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      setMessage(serverMessage(Object.values(err.errors || {})[0]?.[0] || err.message, err.status || 0, { fallback: 'original' }))
    } finally {
      setBusy(false)
    }
  }

  async function removeTuteur(tuteur) {
    const name = `${tuteur.prenom} ${tuteur.nom}`
    const ok = await confirm({
      title: t('details.eleve.removeTitle', { name }),
      message: t('details.eleve.removeConfirm', { name }),
      confirmLabel: t('details.eleve.remove'),
      tone: 'danger',
    })
    if (ok) quickAction(() => detachTuteur(id, tuteur.id))
  }

  /** Corps de « rattacher un tuteur » selon le choix : compte existant ou nouveau compte. */
  function tuteurBody() {
    const link = { lien_parente: values.lien_parente.trim() || null, est_responsable_legal: values.est_responsable_legal, est_payeur: values.est_payeur }
    if (values.mode === 'existant') return { mode: 'existant', tuteur_id: values.tuteur?.id ?? null, ...link }
    return { mode: 'creer', compte: { nom: values.nom, prenom: values.prenom, telephone: values.telephone, sexe: values.sexe, adresse: values.adresse || null }, ...link }
  }

  /** Envoie l'action du mode courant, puis revient en consultation. */
  async function submit(event) {
    event.preventDefault()
    const changes = champsModifies(values, initial)
    // Rien de modifié : retour à la consultation sans requête
    if (mode === 'edit' && Object.keys(changes).length === 0) { setMode('view'); return }
    setBusy(true)
    setErrors({})
    setMessage('')
    try {
      let response
      if (mode === 'edit') response = await updateEleve(id, changes)
      if (mode === 'reinscrire') response = await reinscrire(id, Number(values.classe_id))
      if (mode === 'archive') response = await archiveEleve(id, values.motif.trim())
      if (mode === 'tuteur') response = await attachTuteur(id, tuteurBody())
      if (mode === 'transfert') response = await changerClasse(values.inscription_id, Number(values.classe_id), values.motif.trim())
      if (mode === 'frais') response = await encaisserFrais(values.inscription.id, values.mode_paiement)
      if (mode === 'diplome') {
        response = await createDiplome(id, {
          type: values.type, intitule: values.intitule.trim() || null, mention: values.mention || null,
          date_obtention: values.date_obtention, observations: values.observations.trim() || null,
        })
      }
      const text = serverMessage(response.message, 200, { fallback: 'original' })
      // Reçu ou diplôme à imprimer depuis la confirmation
      if (mode === 'frais') setReceipt({ href: `/recus/inscription/${response.data.id}`, label: t('details.eleve.printFeesReceipt', { numero: response.data.numero_recu }) })
      if (mode === 'diplome') setReceipt({ href: `/diplomes/${response.data.id}`, label: t('dip.printNumber', { numero: response.data.numero }) })
      setSuccess(text)
      onChanged(text)
      setMode('view')
      setReload(r => r + 1)
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      setErrors(fieldErrors(err, serverMessage))
      setMessage(serverMessage(Object.values(err.errors || {})[0]?.[0] || err.message, err.status || 0, { fallback: 'original' }))
    } finally {
      setBusy(false)
    }
  }

  const enrolledThisYear = eleve?.inscriptions.some(i => i.annee_scolaire === year && i.statut === 'active')
  const formId = 'eleve-detail-form'

  let footer
  if (!eleve) footer = <button type="button" className="db-button db-button--secondary" onClick={onClose}>{t('pay.form.close')}</button>
  else if (mode === 'view') {
    footer = (
      <Fragment key="view">
        <button type="button" className="db-button db-button--secondary" onClick={onClose}>{t('pay.form.close')}</button>
        {!eleve.is_archived && (
          <>
            <button type="button" className="db-button db-button--secondary detail-danger" onClick={() => start('archive')}><Icon name="close" size={16} />{t('details.archive')}</button>
            {!enrolledThisYear && classes.length > 0 && <button type="button" className="db-button db-button--secondary" onClick={() => start('reinscrire')}><Icon name="plus" size={16} />{t('details.eleve.reenroll')}</button>}
            <button type="button" className="db-button" onClick={() => start('edit')}><Icon name="pencil" size={16} />{t('details.edit')}</button>
          </>
        )}
      </Fragment>
    )
  } else {
    footer = (
      <Fragment key={mode}>
        <button type="button" className="db-button db-button--secondary" disabled={busy} onClick={() => start('view')}>{t('form.cancel')}</button>
        <button type="submit" form={formId} className={`db-button ${mode === 'archive' ? 'detail-danger-solid' : ''}`} disabled={busy} aria-busy={busy}>
          {busy ? t('form.saving') : t(`details.eleve.submit.${mode}`)}<Icon name="check" size={17} />
        </button>
      </Fragment>
    )
  }

  return (
    <DetailDialog
      icon="users"
      title={eleve ? `${eleve.prenom} ${eleve.nom}` : t('dash.loading')}
      subtitle={eleve && <><bdi>{eleve.matricule}</bdi>{eleve.is_archived && <> · <span className="db-badge db-badge--neutral"><span className="db-badge-dot" />{t('details.archived')}</span></>}</>}
      busy={busy}
      onClose={onClose}
      notice={success}
      footer={footer}
    >
      {receipt && mode === 'view' && (
        <a className="db-button db-button--secondary detail-receipt-link" href={receipt.href} target="_blank" rel="noopener noreferrer">
          <Icon name="printer" size={16} />{receipt.label}
        </a>
      )}
      {message && <div className="db-alert db-alert--error" role="alert"><strong>{message}</strong></div>}
      {!eleve && !message && <div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loading')}</div>}

      {eleve && mode === 'view' && (
        <>
          <div className="detail-identity">
            <Avatar person={eleve} className="detail-avatar" />
            <InfoList items={[
              [t('form.fields.dateNaissance'), eleve.date_naissance && formatDate(`${eleve.date_naissance}T12:00:00`, { dateStyle: 'long' })],
              [t('form.fields.sexe'), eleve.sexe && t(eleve.sexe === 'M' ? 'details.male' : 'details.female')],
              [t('form.fields.adresse'), eleve.adresse],
              [t('dash.table.status'), eleve.is_archived ? t('details.archivedOn', { date: formatDate(eleve.archived_at, { dateStyle: 'medium' }) }) : t('dash.table.active')],
            ]} />
          </div>

          <h3 className="db-form-section">{t('details.eleve.enrollments')}</h3>
          <ul className="detail-list">
            {eleve.inscriptions.length === 0 && <li className="db-muted-text">{t('dash.table.noEnrollment')}</li>}
            {eleve.inscriptions.map(i => (
              <li key={i.id}>
                <span className="detail-stack">
                  <span><strong>{i.annee_scolaire}</strong> · {i.classe || t('dash.table.noClass')}</span>
                  {/* Frais d'inscription : réglés (reçu imprimable) ou à encaisser au montant de la classe */}
                  {i.frais_payes ? (
                    <small className="detail-fees detail-fees--paid">
                      <Icon name="check" size={14} />{t('details.eleve.feesPaid', { amount: amount(i.montant_inscription) })}
                      <a href={`/recus/inscription/${i.id}`} target="_blank" rel="noopener noreferrer">{t('details.eleve.receiptNumber', { numero: i.numero_recu_inscription })}</a>
                    </small>
                  ) : i.frais_inscription > 0 && i.statut === 'active' ? (
                    <small className="detail-fees">{t('details.eleve.feesDue', { amount: amount(i.frais_inscription) })}</small>
                  ) : null}
                </span>
                <span>
                  {!eleve.is_archived && !i.frais_payes && i.frais_inscription > 0 && i.statut === 'active' && (
                    <button type="button" className="db-button db-button--small" disabled={busy} onClick={() => start('frais', i)}>
                      <Icon name="wallet" size={15} />{t('details.eleve.collectFees')}
                    </button>
                  )}
                  <span className={`db-badge ${i.statut === 'active' ? 'db-badge--success' : 'db-badge--neutral'}`}><span className="db-badge-dot" />{i.statut === 'active' ? t('dash.table.activeEnrollment') : i.statut}</span>
                  {/* Transfert dans une autre classe de l'année (ou affectation si sans classe) */}
                  {!eleve.is_archived && i.statut === 'active' && i.annee_scolaire === year && classes.some(c => c.id !== i.classe_id) && (
                    <button type="button" className="db-button db-button--secondary db-button--small" disabled={busy} onClick={() => start('transfert', i)}>
                      <Icon name="arrow" size={15} />{i.classe_id ? t('details.eleve.changeClass') : t('details.eleve.assignClass')}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <h3 className="db-form-section">{t('dash.table.tutors')}</h3>
          <ul className="detail-list">
            {eleve.tuteurs.length === 0 && <li className="db-muted-text">{t('dash.table.noTutor')}</li>}
            {eleve.tuteurs.map(tuteur => {
              const name = `${tuteur.prenom} ${tuteur.nom}`
              return (
                <li key={tuteur.id}>
                  <span>
                    <span>{name}{tuteur.lien_parente ? ` · ${tuteur.lien_parente}` : ''}<small><bdi dir="ltr">{tuteur.telephone}</bdi></small></span>
                    {tuteur.est_payeur && <span className="db-badge db-badge--success"><span className="db-badge-dot" />{t('form.fields.payeur')}</span>}
                    {tuteur.est_responsable_legal && <span className="db-badge db-badge--neutral"><span className="db-badge-dot" />{t('form.fields.responsable')}</span>}
                  </span>
                  {!eleve.is_archived && (
                    <span className="db-row-actions">
                      {/* Le payeur reçoit les rappels de mensualités */}
                      {!tuteur.est_payeur && (
                        <button type="button" className="db-button db-button--secondary db-button--small" disabled={busy} onClick={() => quickAction(() => updateTuteurLink(id, tuteur.id, { est_payeur: true }))} aria-label={t('details.eleve.setPayerFor', { name })}>
                          <Icon name="wallet" size={15} />{t('details.eleve.setPayer')}
                        </button>
                      )}
                      {eleve.tuteurs.length > 1 && (
                        <button type="button" className="db-button db-button--secondary db-button--small detail-danger" disabled={busy} onClick={() => removeTuteur(tuteur)} aria-label={t('details.eleve.removeFor', { name })}>
                          <Icon name="close" size={15} />{t('details.eleve.remove')}
                        </button>
                      )}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          {!eleve.is_archived && (
            <button type="button" className="db-button db-button--secondary detail-add" disabled={busy} onClick={() => start('tuteur')}>
              <Icon name="plus" size={16} />{t('details.eleve.addTutor')}
            </button>
          )}

          <h3 className="db-form-section">{t('dip.title')}</h3>
          <ul className="detail-list">
            {eleve.diplomes.length === 0 && <li className="db-muted-text">{t('dip.none')}</li>}
            {eleve.diplomes.map(diplome => (
              <li key={diplome.id} className={diplome.annule ? 'detail-cancelled' : ''}>
                <span className="detail-stack">
                  <span><Icon name="award" size={15} /> <strong>{diplome.intitule}</strong></span>
                  <small>
                    <bdi>{diplome.numero}</bdi> · {formatDate(`${diplome.date_obtention}T12:00:00`, { dateStyle: 'medium' })}
                    {diplome.mention ? ` · ${t(`dip.mentions.${diplome.mention}`)}` : ''}
                  </small>
                </span>
                <span>
                  {diplome.annule
                    ? <span className="db-badge db-badge--neutral"><span className="db-badge-dot" />{t('dip.cancelled')}</span>
                    : <a className="db-button db-button--secondary db-button--small" href={`/diplomes/${diplome.id}`} target="_blank" rel="noopener noreferrer"><Icon name="printer" size={15} />{t('dip.print')}</a>}
                </span>
              </li>
            ))}
          </ul>
          {!eleve.is_archived && (
            <button type="button" className="db-button db-button--secondary detail-add" disabled={busy} onClick={() => start('diplome')}>
              <Icon name="award" size={16} />{t('dip.deliver')}
            </button>
          )}
        </>
      )}

      {eleve && mode !== 'view' && (
        <form id={formId} onSubmit={submit} noValidate>
          <fieldset className="db-dialog-fields" disabled={busy}>
            {mode === 'edit' && (
              <div className="db-form-grid">
                <DetailField id="eleve-prenom" label={t('form.fields.prenom')} required error={errors.prenom}>
                  <input id="eleve-prenom" name="prenom" value={values.prenom} onChange={change} maxLength={120} required aria-invalid={Boolean(errors.prenom)} />
                </DetailField>
                <DetailField id="eleve-nom" label={t('form.fields.nom')} required error={errors.nom}>
                  <input id="eleve-nom" name="nom" value={values.nom} onChange={change} maxLength={120} required aria-invalid={Boolean(errors.nom)} />
                </DetailField>
                <DetailField id="eleve-date" label={t('form.fields.dateNaissance')} error={errors.date_naissance}>
                  <input id="eleve-date" name="date_naissance" type="date" value={values.date_naissance} onChange={change} aria-invalid={Boolean(errors.date_naissance)} />
                </DetailField>
                <DetailField id="eleve-sexe" label={t('form.fields.sexe')} required error={errors.sexe}>
                  <select id="eleve-sexe" name="sexe" value={values.sexe} onChange={change} required>
                    <option value="">{t('form.options.select')}</option>
                    <option value="M">{t('form.options.male')}</option>
                    <option value="F">{t('form.options.female')}</option>
                  </select>
                </DetailField>
                <DetailField id="eleve-adresse" label={t('form.fields.adresse')} error={errors.adresse}>
                  <input id="eleve-adresse" name="adresse" value={values.adresse} onChange={change} maxLength={255} />
                </DetailField>
              </div>
            )}

            {mode === 'reinscrire' && (
              <>
                <p className="db-form-note">{t('details.eleve.reenrollHelp', { year })}</p>
                <DetailField id="eleve-classe" label={t('form.fields.classe')} required error={errors.classe_id || errors.eleve_id}>
                  <select id="eleve-classe" name="classe_id" value={values.classe_id} onChange={change} required>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.nom} · {c.niveau}</option>)}
                  </select>
                </DetailField>
              </>
            )}

            {mode === 'tuteur' && (
              <>
                <DetailField id="tuteur-mode" label={t('form.fields.compteTuteur')}>
                  <select id="tuteur-mode" name="mode" value={values.mode} onChange={change}>
                    <option value="existant">{t('form.options.existingAccount')}</option>
                    <option value="creer">{t('form.options.createAccount')}</option>
                  </select>
                </DetailField>
                {values.mode === 'existant' ? (
                  // Les tuteurs déjà rattachés à l'élève ne sont pas proposés
                  <TuteurPicker
                    id="tuteur-id"
                    label={<>{t('form.fields.tuteurActif')}<span className="db-required" aria-hidden="true"> *</span></>}
                    value={values.tuteur}
                    onChange={tuteur => setValues(previous => ({ ...previous, tuteur }))}
                    error={errors.tuteur_id}
                    excludeEleveId={id}
                    onSessionExpired={onSessionExpired}
                    disabled={busy}
                  />
                ) : (
                  <>
                    <div className="db-form-grid">
                      {['prenom', 'nom', 'telephone', 'adresse'].map(name => (
                        <DetailField key={name} id={`tuteur-${name}`} label={t(`form.fields.${name}`)} required={name !== 'adresse'} error={errors[`compte.${name}`]}>
                          <input id={`tuteur-${name}`} name={name} type={name === 'telephone' ? 'tel' : 'text'} dir={name === 'telephone' ? 'ltr' : undefined} value={values[name]} onChange={change} maxLength={name === 'adresse' ? 255 : 120} />
                        </DetailField>
                      ))}
                      <DetailField id="tuteur-sexe" label={t('form.fields.sexe')} required error={errors['compte.sexe']}>
                        <select id="tuteur-sexe" name="sexe" value={values.sexe} onChange={change}>
                          <option value="">{t('form.options.select')}</option>
                          <option value="M">{t('form.options.male')}</option>
                          <option value="F">{t('form.options.female')}</option>
                        </select>
                      </DetailField>
                    </div>
                    <p className="db-form-note">{t('form.notes.tempPasswordShort')} <strong>passer</strong>.</p>
                  </>
                )}
                <DetailField id="tuteur-lien" label={t('form.fields.lienParente')} error={errors.lien_parente}>
                  <input id="tuteur-lien" name="lien_parente" value={values.lien_parente} onChange={change} maxLength={40} placeholder={t('form.placeholders.lien')} />
                </DetailField>
                <div className="db-checkbox-row">
                  {[['est_responsable_legal', 'responsable'], ['est_payeur', 'payeur']].map(([name, labelKey]) => (
                    <label key={name}><input type="checkbox" name={name} checked={values[name]} onChange={change} />{t(`form.fields.${labelKey}`)}</label>
                  ))}
                </div>
              </>
            )}

            {mode === 'transfert' && (
              <>
                <p className="db-form-note">{t('details.eleve.changeClassHelp')}</p>
                <DetailField id="transfert-classe" label={t('details.eleve.newClass')} required error={errors.classe_id || errors.inscription}>
                  <select id="transfert-classe" name="classe_id" value={values.classe_id} onChange={change}>
                    {classes.filter(c => c.id !== eleve.inscriptions.find(i => i.id === values.inscription_id)?.classe_id).map(c => (
                      <option key={c.id} value={c.id}>{c.nom} · {c.niveau}</option>
                    ))}
                  </select>
                </DetailField>
                <DetailField id="transfert-motif" label={t('details.reason')} error={errors.motif}>
                  <textarea id="transfert-motif" name="motif" rows={2} maxLength={255} value={values.motif} onChange={change} placeholder={t('details.eleve.changeClassPlaceholder')} />
                </DetailField>
              </>
            )}

            {mode === 'frais' && (
              <>
                {/* Montant fixé pour la classe : affiché, jamais saisi */}
                <div className="detail-fees-box">
                  <span>{t('details.eleve.feesFor', { year: values.inscription.annee_scolaire, classe: values.inscription.classe })}</span>
                  <strong>{amount(values.inscription.frais_inscription)}</strong>
                </div>
                <DetailField id="frais-mode" label={t('pay.form.mode')} required error={errors.mode_paiement || errors.frais_inscription}>
                  <select id="frais-mode" name="mode_paiement" value={values.mode_paiement} onChange={change}>
                    {modes.map(value => <option key={value} value={value}>{t(`pay.modes.${value}`)}</option>)}
                  </select>
                </DetailField>
                <p className="db-form-note">{t('details.eleve.feesHelp')}</p>
              </>
            )}

            {mode === 'diplome' && (
              <div className="db-form-grid">
                <DetailField id="dip-type" label={t('dip.fields.type')} required error={errors.type}>
                  <select id="dip-type" name="type" value={values.type} onChange={change}>
                    {TYPES_DIPLOME.map(type => <option key={type} value={type}>{t(`dip.types.${type}`)}</option>)}
                  </select>
                </DetailField>
                <DetailField id="dip-mention" label={t('dip.fields.mention')} error={errors.mention}>
                  <select id="dip-mention" name="mention" value={values.mention} onChange={change}>
                    <option value="">{t('dip.noMention')}</option>
                    {MENTIONS_DIPLOME.map(mention => <option key={mention} value={mention}>{t(`dip.mentions.${mention}`)}</option>)}
                  </select>
                </DetailField>
                <DetailField id="dip-intitule" label={t('dip.fields.intitule')} error={errors.intitule}>
                  <input id="dip-intitule" name="intitule" value={values.intitule} onChange={change} maxLength={160} placeholder={t(`dip.defaultTitles.${values.type}`)} />
                </DetailField>
                <DetailField id="dip-date" label={t('dip.fields.date')} required error={errors.date_obtention}>
                  <input id="dip-date" name="date_obtention" type="date" value={values.date_obtention} max={new Date().toISOString().slice(0, 10)} onChange={change} />
                </DetailField>
                <DetailField id="dip-observations" label={t('dip.fields.observations')} error={errors.observations}>
                  <textarea id="dip-observations" name="observations" rows={2} maxLength={1000} value={values.observations} onChange={change} />
                </DetailField>
              </div>
            )}

            {mode === 'archive' && (
              <>
                <div className="db-callout detail-warning"><Icon name="shield" /><span>{t('details.eleve.archiveHelp')}</span></div>
                <DetailField id="eleve-motif" label={t('details.reason')} error={errors.motif}>
                  <textarea id="eleve-motif" name="motif" rows={3} maxLength={255} value={values.motif} onChange={change} placeholder={t('details.reasonPlaceholder')} />
                </DetailField>
              </>
            )}
          </fieldset>
        </form>
      )}
    </DetailDialog>
  )
}
