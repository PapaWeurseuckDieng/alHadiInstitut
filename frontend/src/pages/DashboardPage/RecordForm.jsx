import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import PasswordInput from '../../components/PasswordInput/PasswordInput'
import { useI18n } from '../../i18n/useI18n'
import { changePassword } from '../../services/authService'
import { createRecord } from '../../services/dashboardService'

/* ==========================================================================
   Formulaires en fenêtre modale : élève, classe, compte, mot de passe.
   Textes : src/i18n/fr.js et ar.js (clés « form.… »).
   Attention : les libellés français des champs et des boutons sont utilisés
   par les tests e2e (tests/e2e/dashboard.spec.js). Les modifier avec prudence.
   ========================================================================== */

// Icône de l'en-tête selon le formulaire
const ICONS = { eleve: 'users', classe: 'book', user: 'shield', password: 'shield' }

/** Tuteur vide, ajouté par « Ajouter un tuteur ». */
const newGuardian = () => ({ mode: 'creer', nom: '', prenom: '', telephone: '', sexe: '', adresse: '', lien_parente: '', est_responsable_legal: true, est_payeur: false, tuteur_id: '' })

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
  const { t, lang, serverMessage } = useI18n()
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
        if (kind === 'user') body = { nom: values.nom, prenom: values.prenom, telephone: values.telephone, sexe: values.sexe, adresse: values.adresse || null, role: values.role }
        if (kind === 'classe') body = { nom: values.nom, niveau: values.niveau, oustaz_id: Number(values.oustaz_id), inscription_ids: values.inscription_ids }
        if (kind === 'eleve') body = {
          classe_id: Number(values.classe_id),
          eleve: { nom: values.nom, prenom: values.prenom, date_naissance: values.date_naissance || null, sexe: values.sexe, adresse: values.adresse || null },
          tuteurs: guardians.map(g => ({
            mode: g.mode, lien_parente: g.lien_parente || null, est_responsable_legal: g.est_responsable_legal, est_payeur: g.est_payeur,
            ...(g.mode === 'existant' ? { tuteur_id: Number(g.tuteur_id) } : { compte: { nom: g.nom, prenom: g.prenom, telephone: g.telephone, sexe: g.sexe, adresse: g.adresse || null } }),
          })),
        }
        const response = await createRecord(kind, body)
        const temporary = kind === 'user' || (kind === 'eleve' && guardians.some(g => g.mode === 'creer'))
        // Message du serveur (traduit en arabe si connu) + matricule + rappel du mot de passe temporaire
        onSaved(
          serverMessage(response.message, 201, { fallback: 'original' })
          + (kind === 'eleve' ? t('form.saved.matricule', { matricule: response.data.eleve.matricule }) : '')
          + (temporary ? t('form.saved.tempPassword') : ''),
        )
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
  // Marque « gauche à droite » devant un numéro en arabe : « +221… » ne doit pas être inversé dans une liste
  const ltrMark = lang === 'ar' ? '‎' : ''

  return (
    <dialog
      ref={dialog}
      className="db-dialog"
      aria-labelledby="form-title"
      // Échap ferme la fenêtre, sauf pendant l'envoi et pour le changement de mot de passe obligatoire
      onCancel={event => { event.preventDefault(); if (!busy && kind !== 'password') onClose() }}
    >
      {/* ---------- En-tête ---------- */}
      <div className="db-dialog-heading">
        <span className="db-dialog-icon"><Icon name={ICONS[kind]} /></span>
        <div>
          <h2 id="form-title">{t(`form.${kind}.title`)}</h2>
          <p>{t(`form.${kind}.text`)}</p>
        </div>
        {kind !== 'password' && (
          <button type="button" className="db-icon-button" aria-label={t('form.close')} disabled={busy} onClick={onClose}>
            <Icon name="close" />
          </button>
        )}
      </div>

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
                          <SelectField id={`field-tuteurs.${index}.tuteur_id`} label={requiredLabel(t('form.fields.tuteurActif'))} required value={g.tuteur_id} onChange={e => changeGuardian(index, 'tuteur_id', e.target.value)} error={fieldError(`tuteurs.${index}.tuteur_id`)}>
                            <option value="">{t('form.options.selectTutor')}</option>
                            {options?.tuteurs.map(tuteur => <option key={tuteur.id} value={tuteur.id}>{tuteur.label} · {ltrMark}{tuteur.telephone}</option>)}
                          </SelectField>
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
    </dialog>
  )
}
