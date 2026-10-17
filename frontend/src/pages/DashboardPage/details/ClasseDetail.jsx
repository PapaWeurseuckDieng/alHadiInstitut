import { Fragment, useEffect, useState } from 'react'
import Avatar from '../../../components/Avatar'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { updateClasse } from '../../../services/dashboardService'
import { getClassStudents } from '../../../services/pedagogieService'
import { usePaymentFormat } from '../paiements/usePaymentFormat'
import DetailDialog, { DetailField, InfoList } from './DetailDialog'

/**
 * Fiche d'une classe (Admin) : informations, montants, élèves inscrits (un clic ouvre la fiche
 * de l'élève), modification (nom, niveau, oustaz, mensualité, frais d'inscription).
 * L'API ne prévoit pas d'archivage des classes.
 *
 * @param {{ classe: object, oustazs: object[], initialMode?: 'edit', onClose: () => void, onChanged: (message: string) => void,
 *           onOpenEleve?: (eleve: object) => void, onSessionExpired: () => void }} props
 *   classe : ligne de la liste (nom, niveau, oustaz, année, effectif, montants…) · oustazs : options { id, label }
 */
export default function ClasseDetail({ classe, oustazs, initialMode, onClose, onChanged, onOpenEleve, onSessionExpired }) {
  const { t, serverMessage } = useI18n()
  const { amount } = usePaymentFormat()
  const [info, setInfo] = useState(classe)
  const [eleves, setEleves] = useState(null)
  const [editing, setEditing] = useState(initialMode === 'edit' && !classe.is_archived)
  const [values, setValues] = useState(() => editValues(classe))
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    getClassStudents(classe.id)
      .then(list => { if (!cancelled) setEleves(list) })
      .catch(err => {
        if (cancelled) return
        if (err.status === 401) { onSessionExpired(); return }
        setMessage(serverMessage(err.message, err.status || 0))
      })
    return () => { cancelled = true }
  }, [classe.id, onSessionExpired, serverMessage])

  /** Valeurs du formulaire ; un montant vide = montant par défaut de l'institut. */
  function editValues(source) {
    return {
      nom: source.nom,
      niveau: source.niveau,
      oustaz_id: source.oustaz_id ?? '',
      mensualite: source.mensualite_propre ? String(source.mensualite) : '',
      frais_inscription: source.frais_inscription_propres ? String(source.frais_inscription) : '',
    }
  }

  function startEdit() {
    setEditing(true)
    setErrors({})
    setMessage('')
    setSuccess('')
    setValues(editValues(info))
  }

  const change = event => setValues(previous => ({ ...previous, [event.target.name]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage('')
    try {
      const body = {
        nom: values.nom.trim(),
        niveau: values.niveau.trim(),
        ...(values.oustaz_id ? { oustaz_id: Number(values.oustaz_id) } : {}),
        mensualite: values.mensualite === '' ? null : Number(values.mensualite),
        frais_inscription: values.frais_inscription === '' ? null : Number(values.frais_inscription),
      }
      const response = await updateClasse(classe.id, body)
      const oustaz = oustazs.find(o => String(o.id) === String(values.oustaz_id))
      setInfo(previous => ({ ...previous, ...response.data, oustaz: oustaz?.label ?? previous.oustaz }))
      const text = serverMessage(response.message, 200, { fallback: 'original' })
      setSuccess(text)
      onChanged(text)
      setEditing(false)
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      setErrors(Object.fromEntries(Object.entries(err.errors || {}).map(([key, messages]) => [key, serverMessage(messages[0], 422, { fallback: 'original' })])))
      setMessage(serverMessage(Object.values(err.errors || {})[0]?.[0] || err.message, err.status || 0, { fallback: 'original' }))
    } finally {
      setBusy(false)
    }
  }

  const currentOustaz = oustazs.find(o => o.id === info.oustaz_id)

  // Un fragment par mode (voir DetailDialog)
  const footer = editing ? (
    <Fragment key="edit">
      <button type="button" className="db-button db-button--secondary" disabled={busy} onClick={() => setEditing(false)}>{t('form.cancel')}</button>
      <button type="submit" form="classe-detail-form" className="db-button" disabled={busy} aria-busy={busy}>
        {busy ? t('form.saving') : t('details.classe.submit')}<Icon name="check" size={17} />
      </button>
    </Fragment>
  ) : (
    <Fragment key="view">
      <button type="button" className="db-button db-button--secondary" onClick={onClose}>{t('pay.form.close')}</button>
      {!info.is_archived && <button type="button" className="db-button" onClick={startEdit}><Icon name="pencil" size={16} />{t('details.edit')}</button>}
    </Fragment>
  )

  return (
    <DetailDialog icon="book" title={info.nom} subtitle={[info.niveau, info.annee_scolaire].filter(Boolean).join(' · ')} busy={busy} onClose={onClose} notice={success} footer={footer}>
      {message && <div className="db-alert db-alert--error" role="alert"><strong>{message}</strong></div>}

      {editing ? (
        <form id="classe-detail-form" onSubmit={submit} noValidate>
          <fieldset className="db-dialog-fields" disabled={busy}>
            <div className="db-form-grid">
              <DetailField id="classe-nom" label={t('form.fields.nomClasse')} required error={errors.nom}>
                <input id="classe-nom" name="nom" value={values.nom} onChange={change} maxLength={120} required aria-invalid={Boolean(errors.nom)} />
              </DetailField>
              <DetailField id="classe-niveau" label={t('form.fields.niveau')} required error={errors.niveau}>
                <input id="classe-niveau" name="niveau" value={values.niveau} onChange={change} maxLength={80} required aria-invalid={Boolean(errors.niveau)} />
              </DetailField>
              <DetailField id="classe-oustaz" label={t('form.fields.oustaz')} required error={errors.oustaz_id}>
                <select id="classe-oustaz" name="oustaz_id" value={values.oustaz_id} onChange={change}>
                  {!currentOustaz && <option value="">{t('form.options.selectOustaz')}</option>}
                  {oustazs.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </DetailField>
              <DetailField id="classe-mensualite" label={t('form.fields.mensualite')} error={errors.mensualite}>
                <input id="classe-mensualite" name="mensualite" type="number" min={0} step={500} inputMode="numeric" value={values.mensualite} onChange={change} placeholder={t('form.placeholders.defaultAmount')} />
              </DetailField>
              <DetailField id="classe-frais" label={t('form.fields.fraisInscription')} error={errors.frais_inscription}>
                <input id="classe-frais" name="frais_inscription" type="number" min={0} step={500} inputMode="numeric" value={values.frais_inscription} onChange={change} placeholder={t('form.placeholders.defaultAmount')} />
              </DetailField>
            </div>
            <p className="db-form-note">{t('details.classe.help')}</p>
            <p className="db-form-note">{t('details.classe.amountsHelp')}</p>
          </fieldset>
        </form>
      ) : (
        <>
          <InfoList items={[
            [t('form.fields.oustaz'), info.oustaz],
            [t('dash.table.schoolYear'), info.annee_scolaire],
            [t('dash.table.size'), t('ped.students', { count: eleves?.length ?? info.effectif ?? 0 })],
            [t('form.fields.mensualite'), info.mensualite != null ? amount(info.mensualite) : null],
            [t('form.fields.fraisInscription'), info.frais_inscription != null ? amount(info.frais_inscription) : null],
          ]} />
          <h3 className="db-form-section">{t('details.classe.students')}</h3>
          {onOpenEleve && eleves?.length > 0 && <p className="db-form-note">{t('details.classe.openHint')}</p>}
          {!eleves && !message && <div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loading')}</div>}
          {eleves && (
            <ul className="detail-list">
              {eleves.length === 0 && <li className="db-muted-text">{t('ped.appel.noStudentText')}</li>}
              {eleves.map(eleve => {
                const content = <><Avatar person={eleve} /><span>{eleve.prenom} {eleve.nom}<small><bdi>{eleve.matricule}</bdi></small></span></>
                return (
                  <li key={eleve.id}>
                    {onOpenEleve ? (
                      // Un clic ouvre la fiche de l'élève ; « Fermer » y revient à cette classe
                      <button type="button" className="db-person db-person-link detail-student-link" onClick={() => onOpenEleve(eleve)} aria-label={t('details.openFor', { name: `${eleve.prenom} ${eleve.nom}` })}>
                        {content}
                        <span className="db-flip-rtl detail-student-arrow"><Icon name="chevronRight" size={16} /></span>
                      </button>
                    ) : <span className="db-person">{content}</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </DetailDialog>
  )
}
