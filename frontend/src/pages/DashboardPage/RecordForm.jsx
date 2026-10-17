import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import PasswordInput from '../../components/PasswordInput/PasswordInput'
import PhotoField from '../../components/PhotoField/PhotoField'
import TuteurPicker from '../../components/TuteurPicker/TuteurPicker'
import { useI18n } from '../../i18n/useI18n'
import { changePassword } from '../../services/authService'
import { createRecord } from '../../services/dashboardService'
import { usePaymentFormat } from './paiements/usePaymentFormat'

/* ==========================================================================
   Formulaires en fenêtre modale : élève, classe, compte, mot de passe.
   Textes : src/i18n/fr.js et ar.js (clés « form.… »).
   Attention : les libellés français des champs et des boutons sont utilisés
   par les tests e2e (tests/e2e/dashboard.spec.js). Les modifier avec prudence.
   ========================================================================== */

// Icône de l'en-tête selon le formulaire
const ICONS = { eleve: 'users', classe: 'book', user: 'shield', password: 'shield' }

/** Tuteur vide, ajouté par « Ajouter un tuteur ». « tuteur » : compte existant choisi par la recherche. */
const newGuardian = () => ({ mode: 'creer', nom: '', prenom: '', telephone: '', sexe: '', adresse: '', lien_parente: '', est_responsable_legal: true, est_payeur: false, tuteur: null })

/**
 * Champ texte (ou mot de passe) avec libellé, astérisque si obligatoire et message d'erreur.
 * Le message d'erreur est placé hors du libellé pour ne pas allonger le nom lu par les lecteurs d'écran.
 */
function Field({ label, name, value, onChange, error, type = 'text', required = false, ...props }) {
  const id = `field-${name}`
  const Input = type === 'password' ? PasswordInput : 'input'
  return (
    <div className="db-field">
      <label htmlFor={id}>
        {label}{required && <span className="db-required" aria-hidden="true"> *</span>}
      </label>
      <Input
        id={id}
        name={name}
        type={type}
        value={value ?? ''}
        onChange={onChange}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && <small className="db-field-error" id={`${id}-error`}>{error}</small>}
    </div>
  )
}

/**
 * Libellé de liste déroulante obligatoire : « Texte » + astérisque rouge.
 * L'astérisque reste lu (nom accessible « Classe * », « Sexe * »...), comme attendu par les tests e2e.
 */
const requiredLabel = text => <>{text}<span className="db-required"> *</span></>

/** Liste déroulante générique avec libellé et message d'erreur. */
function SelectField({ id, label, error, children, ...props }) {
  return (
    <div className="db-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...props}>
        {children}
      </select>
      {error && <small className="db-field-error" id={`${id}-error`}>{error}</small>}
    </div>
  )
}

/** Choix du sexe : valeurs « M » / « F » envoyées à l'API, libellés traduits. */
function SexField({ name, value, onChange, error }) {
  const { t } = useI18n()
  return (
    <SelectField id={`field-${name}`} label={requiredLabel(t('form.fields.sexe'))} name={name} value={value} onChange={onChange} required error={error}>
      <option value="">{t('form.options.select')}</option>
      <option value="M">{t('form.options.male')}</option>
      <option value="F">{t('form.options.female')}</option>
    </SelectField>
  )
}

/** Titre de section à l'intérieur du formulaire. */
function SectionTitle({ children }) {
  return <h3 className="db-form-section">{children}</h3>
}

export default function RecordForm({ kind, options, year, onClose, onSaved, onSessionExpired }) {
  const { t, serverMessage } = useI18n()
  const dialog = useRef(null)
  const errorBox = useRef(null)
  // Verrou synchrone contre le double envoi
  const sending = useRef(false)
  const [values, setValues] = useState({ role: 'tuteur', sexe: '', annee_scolaire: year || '', classe_id: '', inscription_ids: [] })
  const [guardians, setGuardians] = useState([newGuardian()])
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  // Erreur générale : message + code HTTP (traduit au moment de l'affichage)
  const [message, setMessage] = useState(null)
  // Photo (élève, compte) : fichier prêt à l'envoi, ou null
  const [photo, setPhoto] = useState(null)
  // Paiement saisi pendant l'inscription : frais d'inscription (montant de la classe, cochés par défaut)
  // et mensualites = { 'AAAA-MM': 'montant' } des mois cochés
  const [payment, setPayment] = useState({ frais: true, mode_paiement: 'especes', mensualites: {} })
  // Inscription réussie avec paiement : étape « reçus à imprimer »
  const [success, setSuccess] = useState(null)
  const { amount, monthLabel } = usePaymentFormat()

  // Ouvre la fenêtre modale native au montage, la referme au démontage
  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => node.close()
  }, [])

  /** Met à jour un champ et efface son erreur. Changer d'année vide la sélection d'élèves. */
  function change(event) {
    const { name, value } = event.target
    setValues(previous => ({ ...previous, [name]: value, ...(name === 'annee_scolaire' ? { inscription_ids: [] } : {}) }))
    setErrors(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== name)))
    // Changement de classe : les mois déjà cochés reprennent le tarif de la nouvelle classe
    if (name === 'classe_id') {
      const fee = options?.classes?.find(classe => String(classe.id) === String(value))?.mensualite
      if (fee) setPayment(previous => ({ ...previous, mensualites: Object.fromEntries(Object.keys(previous.mensualites).map(mois => [mois, String(fee)])) }))
    }
  }

  /** Erreur d'un champ renvoyée par Laravel, traduite si possible (sinon texte d'origine). */
  const fieldError = key => (errors[key]?.[0] ? serverMessage(errors[key][0], 422, { fallback: 'original' }) : undefined)

  // Raccourcis : champ lié à `values` (les erreurs Laravel peuvent être préfixées par eleve. ou inscription.)
  const field = (labelKey, name, props = {}) => (
    <Field
      label={t(`form.fields.${labelKey}`)}
      name={name}
      value={values[name]}
      onChange={change}
      error={fieldError(name) || fieldError(`eleve.${name}`) || fieldError(`inscription.${name}`)}
      {...props}
    />
  )
  const sexField = (name, value, onChange, error) => <SexField name={name} value={value} onChange={onChange} error={error} />

  /** Modifie un champ d'un tuteur. */
  function changeGuardian(index, name, value) {
    setGuardians(previous => previous.map((guardian, i) => i === index ? { ...guardian, [name]: value } : guardian))
  }

  // Montants de la classe choisie (fixés par l'administration dans « Tarifs ») : jamais saisis ici
  const selectedClass = options?.classes?.find(classe => String(classe.id) === String(values.classe_id))
  const monthlyFee = selectedClass?.mensualite ?? null
  const enrollmentFee = selectedClass?.frais_inscription ?? 0
  const feesPaid = payment.frais && enrollmentFee > 0
  // Mois cochés, dans l'ordre chronologique (même ordre que les lignes envoyées à l'API)
  const paidMonths = Object.keys(payment.mensualites).sort()
  const paymentTotal = (feesPaid ? enrollmentFee : 0) + paidMonths.reduce((sum, mois) => sum + (Number(payment.mensualites[mois]) || 0), 0)

  /** Coche ou décoche un mois ; un mois coché reçoit le montant de la mensualité. */
  function toggleMonth(mois, checked) {
    setPayment(previous => {
      const mensualites = { ...previous.mensualites }
      if (checked) mensualites[mois] = monthlyFee ? String(monthlyFee) : ''
      else delete mensualites[mois]
      return { ...previous, mensualites }
    })
  }

  /** Bloc « paiement » envoyé avec l'inscription (undefined si rien n'est encaissé). */
  function paymentBody() {
    if (!feesPaid && !paidMonths.length) return undefined
    return {
      mode_paiement: payment.mode_paiement,
      frais_inscription: feesPaid,
      mensualites: paidMonths.map(mois => ({ mois, montant: Number(payment.mensualites[mois]) })),
    }
  }

  /** Envoie le formulaire à l'API et remonte le message de succès à la page. */
  async function submit(event) {
    event.preventDefault()
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setMessage(null)
    setErrors({})
    try {
      if (kind === 'password') {
        await changePassword({ new_password: values.new_password, new_password_confirmation: values.new_password_confirmation })
        onSaved(t('login.passwordChanged'), 'login.passwordChanged')
      } else {
        let body
        if (kind === 'user') body = { nom: values.nom, prenom: values.prenom, telephone: values.telephone, sexe: values.sexe, adresse: values.adresse || null, role: values.role, photo }
        if (kind === 'classe') {
          body = {
            nom: values.nom, niveau: values.niveau, oustaz_id: Number(values.oustaz_id), inscription_ids: values.inscription_ids,
            // Montants propres à la classe ; vides = montants par défaut
            mensualite: values.mensualite ? Number(values.mensualite) : null,
            frais_inscription: values.frais_inscription ? Number(values.frais_inscription) : null,
          }
        }
        if (kind === 'eleve') body = {
          classe_id: Number(values.classe_id),
          eleve: { nom: values.nom, prenom: values.prenom, date_naissance: values.date_naissance || null, sexe: values.sexe, adresse: values.adresse || null },
          tuteurs: guardians.map(g => ({
            mode: g.mode, lien_parente: g.lien_parente || null, est_responsable_legal: g.est_responsable_legal, est_payeur: g.est_payeur,
            ...(g.mode === 'existant' ? { tuteur_id: g.tuteur?.id ?? null } : { compte: { nom: g.nom, prenom: g.prenom, telephone: g.telephone, sexe: g.sexe, adresse: g.adresse || null } }),
          })),
          paiement: paymentBody(),
          photo,
        }
        const response = await createRecord(kind, body)
        const temporary = kind === 'user' || (kind === 'eleve' && guardians.some(g => g.mode === 'creer'))
        // Message du serveur (traduit en arabe si connu) + matricule + rappel du mot de passe temporaire
        const savedMessage = serverMessage(response.message, 201, { fallback: 'original' })
          + (kind === 'eleve' ? t('form.saved.matricule', { matricule: response.data.eleve.matricule }) : '')
          + (temporary ? t('form.saved.tempPassword') : '')
        // Paiement encaissé : la fenêtre reste ouverte sur les reçus à imprimer
        const recus = response.data?.recus ?? []
        const recuFrais = response.data?.recu_inscription ?? null
        if (kind === 'eleve' && (recus.length || recuFrais)) setSuccess({ message: savedMessage, recus, recuFrais, eleve: response.data.eleve })
        else onSaved(savedMessage)
      }
    } catch (error) {
      if (error.status === 401) { onSessionExpired(); return }
      setErrors(error.errors || {})
      setMessage({ text: error.message, status: error.status })
      // Place le focus sur le message d'erreur pour qu'il soit lu immédiatement
      requestAnimationFrame(() => errorBox.current?.focus())
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  // Inscriptions sans classe de l'année courante, proposées à l'affectation
  const eligible = (options?.inscriptions || []).filter(i => i.annee_scolaire === values.annee_scolaire)
  const errorList = Object.entries(errors).filter(([, messages]) => messages?.length)
  // Fermeture : après une inscription réussie, la liste doit être rechargée (onSaved)
  const close = () => (success ? onSaved(success.message) : onClose())

  return (
    <dialog
      ref={dialog}
      className="db-dialog"
      aria-labelledby="form-title"
      // Échap ferme la fenêtre, sauf pendant l'envoi et pour le changement de mot de passe obligatoire
      onCancel={event => { event.preventDefault(); if (!busy && kind !== 'password') close() }}
    >
      {/* ---------- En-tête ---------- */}
      <div className="db-dialog-heading">
        <span className="db-dialog-icon"><Icon name={success ? 'check' : ICONS[kind]} /></span>
        <div>
          <h2 id="form-title">{success ? t('form.payment.successTitle') : t(`form.${kind}.title`)}</h2>
          <p>{success ? success.message : t(`form.${kind}.text`)}</p>
        </div>
        {kind !== 'password' && (
          <button type="button" className="db-icon-button" aria-label={t('form.close')} disabled={busy} onClick={close}>
            <Icon name="close" />
          </button>
        )}
      </div>

      {success ? (
        /* ---------- Inscription enregistrée avec paiement : reçus à imprimer ---------- */
        <>
          <div className="db-dialog-body">
            <div className="pay-success">
              <span className="pay-success-icon" aria-hidden="true"><Icon name="check" size={28} /></span>
              <p className="pay-success-amount">{amount((success.recuFrais?.montant || 0) + success.recus.reduce((sum, recu) => sum + recu.montant, 0))}</p>
              <p>{success.eleve.prenom} {success.eleve.nom} · <bdi>{success.eleve.matricule}</bdi></p>
            </div>
            <ul className="enroll-receipts">
              {success.recuFrais && (
                <li>
                  <span>{t('form.payment.fees')}<small>{t('pay.form.successText', { numero: success.recuFrais.numero_recu, amount: amount(success.recuFrais.montant) })}</small></span>
                  <a className="db-button db-button--secondary" href={`/recus/inscription/${success.recuFrais.id}`} target="_blank" rel="noopener noreferrer">
                    <Icon name="printer" size={16} />{t('form.payment.printFeesReceipt')}
                  </a>
                </li>
              )}
              {success.recus.map(recu => (
                <li key={recu.id}>
                  <span>{t('form.payment.monthly', { month: monthLabel(recu.mois) })}<small>{t('pay.form.successText', { numero: recu.numero_recu, amount: amount(recu.montant) })}</small></span>
                  {/* Clic de l'utilisateur : le nouvel onglet n'est pas bloqué par le navigateur */}
                  <a className="db-button db-button--secondary" href={`/recus/${recu.id}`} target="_blank" rel="noopener noreferrer">
                    <Icon name="printer" size={16} />{t('form.payment.printReceipt', { month: monthLabel(recu.mois) })}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="db-dialog-footer">
            <button type="button" className="db-button" onClick={close}>{t('form.payment.done')}<Icon name="check" size={17} /></button>
          </div>
        </>
      ) : (
      <form onSubmit={submit}>
        {/*
          Zone qui défile : un <div>, car Chrome et Edge ne font pas défiler un <fieldset>.
          Le <fieldset> à l'intérieur sert seulement à désactiver tous les champs pendant l'envoi.
        */}
        <div className="db-dialog-body">
          <fieldset className="db-dialog-fields" disabled={busy}>
            {/* Erreur générale + détail des erreurs de validation */}
            {message && (
              <div ref={errorBox} tabIndex={-1} className="db-alert db-alert--error" role="alert">
                <strong>{message.status ? serverMessage(message.text, message.status) : message.text}</strong>
                {errorList.length > 0 && (
                  <ul>{errorList.map(([key, messages]) => <li key={key}>{serverMessage(messages[0], 422, { fallback: 'original' })}</li>)}</ul>
                )}
              </div>
            )}

            {kind === 'password' ? (
              /* ---------- Changement du mot de passe temporaire ---------- */
              <>
                <div className="db-callout">
                  <Icon name="shield" />
                  <span>{t('form.notes.passwordIntro')}</span>
                </div>
                {field('newPassword', 'new_password', { type: 'password', required: true, minLength: 6, autoComplete: 'new-password' })}
                {field('confirmPassword', 'new_password_confirmation', { type: 'password', required: true, minLength: 6, autoComplete: 'new-password' })}
              </>
            ) : (
              <>
                <p className="db-form-note">
                  {t('form.requiredStart')} (<span className="db-required">*</span>) {t('form.requiredEnd')}
                </p>

                {/* ---------- Identité (élève, compte) ou informations de la classe ---------- */}
                <SectionTitle>{t(`form.sections.${kind === 'user' ? 'identity' : kind}`)}</SectionTitle>
                <div className="db-form-grid">
                  {kind === 'classe' ? (
                    <>
                      {field('nomClasse', 'nom', { required: true, maxLength: 120, placeholder: t('form.placeholders.classe') })}
                      {field('niveau', 'niveau', { required: true, maxLength: 80, placeholder: t('form.placeholders.niveau') })}
                      {/* Montants de la classe : vides = montants par défaut de l'institut */}
                      {field('mensualite', 'mensualite', { type: 'number', min: 0, step: 500, inputMode: 'numeric', placeholder: t('form.placeholders.defaultAmount') })}
                      {field('fraisInscription', 'frais_inscription', { type: 'number', min: 0, step: 500, inputMode: 'numeric', placeholder: t('form.placeholders.defaultAmount') })}
                    </>
                  ) : (
                    <>
                      {field('prenom', 'prenom', { required: true, maxLength: 120, autoComplete: 'given-name' })}
                      {field('nom', 'nom', { required: true, maxLength: 120, autoComplete: 'family-name' })}
                    </>
                  )}
                </div>

                {/* ---------- Compte : téléphone, sexe, rôle, adresse ---------- */}
                {kind === 'user' && (
                  <>
                    <div className="db-form-grid">
                      {/* dir="ltr" : un numéro se lit de gauche à droite, même en arabe */}
                      {field('telephone', 'telephone', { required: true, type: 'tel', dir: 'ltr', maxLength: 24, placeholder: t('form.placeholders.phone') })}
                      {sexField('sexe', values.sexe, change, fieldError('sexe'))}
                    </div>
                    <div className="db-form-grid">
                      <SelectField id="field-role" label={requiredLabel(t('form.fields.role'))} required name="role" value={values.role} onChange={change} error={fieldError('role')}>
                        <option value="tuteur">{t('dash.roleLabels.tuteur')}</option>
                        <option value="oustaz">{t('dash.roleLabels.oustaz')}</option>
                        <option value="admin">{t('dash.roleLabels.admin')}</option>
                      </SelectField>
                      {field('adresse', 'adresse', { maxLength: 255 })}
                    </div>
                    <PhotoField label={t('photo.accountLabel')} value={photo} onChange={setPhoto} error={fieldError('photo')} disabled={busy} />
                    <div className="db-callout">
                      <Icon name="shield" />
                      <span>{t('form.notes.tempPasswordStart')} <strong>passer</strong>{t('form.notes.tempPasswordEnd')}</span>
                    </div>
                  </>
                )}

                {/* ---------- Élève : naissance, sexe, adresse ---------- */}
                {kind === 'eleve' && (
                  <>
                    <div className="db-form-grid">
                      {field('dateNaissance', 'date_naissance', { type: 'date', max: new Date().toISOString().slice(0, 10) })}
                      {sexField('sexe', values.sexe, change, fieldError('eleve.sexe'))}
                    </div>
                    {field('adresse', 'adresse', { maxLength: 255 })}
                    <PhotoField label={t('photo.studentLabel')} value={photo} onChange={setPhoto} error={fieldError('photo')} disabled={busy} />
                  </>
                )}

                {/* ---------- Année scolaire + classe (élève) ou oustaz (classe) ---------- */}
                {kind !== 'user' && (
                  <>
                    <SectionTitle>{t(kind === 'eleve' ? 'form.sections.enrollment' : 'form.sections.supervision')}</SectionTitle>
                    <div className="db-form-grid">
                      <div className="db-field">
                        <label htmlFor="field-annee">{t('form.fields.anneeCourante')}</label>
                        <input id="field-annee" value={year || values.annee_scolaire} readOnly />
                      </div>
                      {kind === 'eleve' ? (
                        <SelectField id="field-classe_id" label={requiredLabel(t('form.fields.classe'))} name="classe_id" value={values.classe_id} onChange={change} required error={fieldError('classe_id')}>
                          <option value="">{t('form.options.selectClass')}</option>
                          {options?.classes?.map(classe => <option key={classe.id} value={classe.id}>{classe.nom} · {classe.niveau}</option>)}
                        </SelectField>
                      ) : (
                        <SelectField id="field-oustaz_id" label={requiredLabel(t('form.fields.oustaz'))} name="oustaz_id" value={values.oustaz_id || ''} onChange={change} required error={fieldError('oustaz_id')}>
                          <option value="">{t('form.options.selectOustaz')}</option>
                          {options?.oustazs.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </SelectField>
                      )}
                    </div>
                    {kind === 'eleve' && !options?.classes?.length && (
                      <p className="db-field-error">{t('form.notes.noActiveClass')}</p>
                    )}
                  </>
                )}

                {/* ---------- Classe : élèves à affecter ---------- */}
                {kind === 'classe' && (
                  <>
                    <SectionTitle>{t('form.sections.toAssign')} <span className="db-count">{values.inscription_ids.length}</span></SectionTitle>
                    <p className="db-form-note">{t('form.notes.eligibleOnly')}</p>
                    <div className="db-choice-list">
                      {eligible.length === 0 ? (
                        <p className="db-form-note">{t('form.notes.noEligible')}</p>
                      ) : eligible.map(i => (
                        <label key={i.id}>
                          <input
                            type="checkbox"
                            checked={values.inscription_ids.includes(i.id)}
                            onChange={event => setValues(v => ({ ...v, inscription_ids: event.target.checked ? [...v.inscription_ids, i.id] : v.inscription_ids.filter(id => id !== i.id) }))}
                          />
                          <span>{i.label}<small><bdi>{i.matricule}</bdi></small></span>
                        </label>
                      ))}
                    </div>
                    {!options?.oustazs.length && <p className="db-field-error">{t('form.notes.needOustaz')}</p>}
                  </>
                )}

                {/* ---------- Élève : tuteurs rattachés ---------- */}
                {kind === 'eleve' && (
                  <>
                    <SectionTitle>{t('form.sections.tutors')}</SectionTitle>
                    <p className="db-form-note">{t('form.notes.tutorRequired')}</p>

                    {guardians.map((g, index) => (
                      // La légende « Tuteur N » donne son nom au groupe (tests e2e)
                      <fieldset className="db-guardian" key={index}>
                        <legend>{t('form.tutorLegend', { n: index + 1 })}</legend>

                        <div className="db-guardian-heading">
                          <SelectField id={`field-tuteurs.${index}.mode`} label={t('form.fields.compteTuteur')} value={g.mode} onChange={event => changeGuardian(index, 'mode', event.target.value)}>
                            <option value="creer">{t('form.options.createAccount')}</option>
                            <option value="existant">{t('form.options.existingAccount')}</option>
                          </SelectField>
                          {guardians.length > 1 && (
                            <button type="button" className="db-text-button" onClick={() => setGuardians(gs => gs.filter((_, i) => i !== index))}>{t('form.remove')}</button>
                          )}
                        </div>

                        {g.mode === 'existant' ? (
                          // Recherche par prénom, nom ou téléphone ; les homonymes se distinguent par le numéro
                          <TuteurPicker
                            id={`field-tuteurs.${index}.tuteur_id`}
                            label={requiredLabel(t('form.fields.tuteurActif'))}
                            value={g.tuteur}
                            onChange={tuteur => changeGuardian(index, 'tuteur', tuteur)}
                            error={fieldError(`tuteurs.${index}.tuteur_id`)}
                            onSessionExpired={onSessionExpired}
                            disabled={busy}
                          />
                        ) : (
                          <>
                            <div className="db-form-grid">
                              {['prenom', 'nom', 'telephone', 'adresse'].map(name => (
                                <Field
                                  key={name}
                                  label={t(`form.fields.${name}`)}
                                  name={`tuteurs.${index}.compte.${name}`}
                                  type={name === 'telephone' ? 'tel' : 'text'}
                                  dir={name === 'telephone' ? 'ltr' : undefined}
                                  value={g[name]}
                                  maxLength={name === 'telephone' ? 24 : name === 'adresse' ? 255 : 120}
                                  required={name !== 'adresse'}
                                  onChange={e => changeGuardian(index, name, e.target.value)}
                                  error={fieldError(`tuteurs.${index}.compte.${name}`)}
                                />
                              ))}
                              {sexField(`tuteurs.${index}.compte.sexe`, g.sexe, event => changeGuardian(index, 'sexe', event.target.value), fieldError(`tuteurs.${index}.compte.sexe`))}
                            </div>
                            <p className="db-form-note">{t('form.notes.tempPasswordShort')} <strong>passer</strong>.</p>
                          </>
                        )}

                        <Field
                          label={t('form.fields.lienParente')}
                          name={`tuteurs.${index}.lien_parente`}
                          value={g.lien_parente}
                          maxLength={40}
                          placeholder={t('form.placeholders.lien')}
                          onChange={e => changeGuardian(index, 'lien_parente', e.target.value)}
                          error={fieldError(`tuteurs.${index}.lien_parente`)}
                        />
                        <div className="db-checkbox-row">
                          {[['est_responsable_legal', 'responsable'], ['est_payeur', 'payeur']].map(([name, labelKey]) => (
                            <label key={name}>
                              <input type="checkbox" checked={g[name]} onChange={e => changeGuardian(index, name, e.target.checked)} />
                              {t(`form.fields.${labelKey}`)}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}

                    <button type="button" className="db-button db-button--secondary" onClick={() => setGuardians(gs => [...gs, { ...newGuardian(), est_responsable_legal: false }])}>
                      <Icon name="plus" size={16} />{t('form.addTutor')}
                    </button>

                    {/* ---------- Élève : frais d'inscription (montant de la classe) et mensualités payées ---------- */}
                    <SectionTitle>{t('form.sections.payment')}</SectionTitle>
                    {fieldError('paiement') && <p className="db-field-error">{fieldError('paiement')}</p>}

                    <div className="enroll-payment">
                      {!selectedClass ? (
                        <p className="db-form-note">{t('form.payment.chooseClassFirst')}</p>
                      ) : enrollmentFee > 0 ? (
                        // Montant affiché, non modifiable : il est fixé pour la classe dans « Tarifs »
                        <label className={`enroll-fees ${payment.frais ? 'enroll-fees--checked' : ''}`}>
                          <input type="checkbox" checked={payment.frais} onChange={event => setPayment(p => ({ ...p, frais: event.target.checked }))} />
                          <span>
                            <strong>{t('form.payment.feesPaid')}</strong>
                            <small>{t('form.payment.feesFixed', { classe: selectedClass.nom })}</small>
                          </span>
                          <output className="enroll-fees-amount" aria-label={t('form.payment.fees')}>{amount(enrollmentFee)}</output>
                        </label>
                      ) : (
                        <p className="db-form-note">{t('form.payment.noFees')}</p>
                      )}
                      {fieldError('paiement.frais_inscription') && <p className="db-field-error">{fieldError('paiement.frais_inscription')}</p>}

                      <p className="db-form-note">
                        {monthlyFee ? t('form.payment.monthlyFee', { amount: amount(monthlyFee) }) : null}
                      </p>
                      {/* Mois encore dus cette année : chaque mois coché produit un reçu */}
                      <div className="enroll-months" role="group" aria-label={t('form.payment.monthsLabel')}>
                        {(options?.paiement?.mois ?? []).length === 0 && <p className="db-form-note">{t('form.payment.noMonth')}</p>}
                        {(options?.paiement?.mois ?? []).map(mois => {
                          const checked = mois in payment.mensualites
                          const index = paidMonths.indexOf(mois)
                          const error = index >= 0 ? (fieldError(`paiement.mensualites.${index}.mois`) || fieldError(`paiement.mensualites.${index}.montant`)) : undefined
                          return (
                            <div key={mois} className={`enroll-month ${checked ? 'enroll-month--checked' : ''}`}>
                              <label>
                                <input type="checkbox" checked={checked} onChange={event => toggleMonth(mois, event.target.checked)} />
                                {monthLabel(mois)}
                              </label>
                              {checked && (
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min="1"
                                  step="1"
                                  required
                                  aria-label={t('form.payment.amountFor', { month: monthLabel(mois) })}
                                  aria-invalid={Boolean(error)}
                                  value={payment.mensualites[mois]}
                                  onChange={event => setPayment(p => ({ ...p, mensualites: { ...p.mensualites, [mois]: event.target.value } }))}
                                />
                              )}
                              {error && <small className="db-field-error">{error}</small>}
                            </div>
                          )
                        })}
                      </div>
                      {/* Mode de paiement : seulement si quelque chose est encaissé */}
                      {(feesPaid || paidMonths.length > 0) && (
                        <div className="db-form-grid">
                          <SelectField id="field-paiement.mode_paiement" label={requiredLabel(t('pay.form.mode'))} required value={payment.mode_paiement} onChange={event => setPayment(p => ({ ...p, mode_paiement: event.target.value }))} error={fieldError('paiement.mode_paiement')}>
                            {(options?.paiement?.modes ?? ['especes']).map(mode => <option key={mode} value={mode}>{t(`pay.modes.${mode}`)}</option>)}
                          </SelectField>
                        </div>
                      )}
                      <p className="enroll-total">{t('form.payment.total')} <strong>{amount(paymentTotal)}</strong></p>
                    </div>
                  </>
                )}
              </>
            )}
          </fieldset>
        </div>

        {/* ---------- Boutons (toujours visibles en bas de la fenêtre) ---------- */}
        <div className="db-dialog-footer">
          <button type="button" className="db-button db-button--secondary" disabled={busy} onClick={onClose}>
            {kind === 'password' ? t('form.logout') : t('form.cancel')}
          </button>
          <button
            className="db-button"
            disabled={busy || (kind === 'classe' && !options?.oustazs.length) || (kind === 'eleve' && !options?.classes?.length)}
            aria-busy={busy}
          >
            {busy ? t('form.saving') : kind === 'password' ? t('form.changePassword') : t('form.save')}
            <Icon name="check" size={17} />
          </button>
        </div>
      </form>
      )}
    </dialog>
  )
}
