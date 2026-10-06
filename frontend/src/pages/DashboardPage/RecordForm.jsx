import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import PasswordInput from '../../components/PasswordInput/PasswordInput'
import { changePassword } from '../../services/authService'
import { createRecord } from '../../services/dashboardService'

const titles = { eleve: 'Inscrire un élève', classe: 'Créer une classe', user: 'Créer un compte', password: 'Sécurisez votre compte' }
const newGuardian = () => ({ mode: 'creer', nom: '', prenom: '', telephone: '', adresse: '', lien_parente: '', est_responsable_legal: true, est_payeur: false, tuteur_id: '' })

function Field({ label, name, value, onChange, error, type = 'text', required = false, ...props }) {
  const id = `field-${name}`
  const Input = type === 'password' ? PasswordInput : 'input'
  return <label className="db-field" htmlFor={id}><span>{label}{required && <span aria-hidden="true"> *</span>}</span><Input id={id} name={name} type={type} value={value ?? ''} onChange={onChange} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...props} />{error && <small className="db-field-error" id={`${id}-error`}>{error}</small>}</label>
}

export default function RecordForm({ kind, options, year, onClose, onSaved, onSessionExpired }) {
  const dialog = useRef(null)
  const errorBox = useRef(null)
  const sending = useRef(false)
  const [values, setValues] = useState({ role: 'tuteur', annee_scolaire: year || '', date_inscription: new Date().toISOString().slice(0, 10), inscription_ids: [] })
  const [guardians, setGuardians] = useState([newGuardian()])
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')

  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => node.close()
  }, [])
  function change(event) {
    const { name, value } = event.target
    setValues(previous => ({ ...previous, [name]: value, ...(name === 'annee_scolaire' ? { inscription_ids: [] } : {}) }))
    setErrors(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== name)))
  }
  const field = (label, name, props = {}) => <Field label={label} name={name} value={values[name]} onChange={change} error={errors[name]?.[0] || errors[`eleve.${name}`]?.[0] || errors[`inscription.${name}`]?.[0]} {...props} />
  function changeGuardian(index, name, value) {
    setGuardians(previous => previous.map((guardian, i) => i === index ? { ...guardian, [name]: value } : guardian))
  }

  async function submit(event) {
    event.preventDefault()
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setMessage('')
    setErrors({})
    try {
      if (kind === 'password') {
        await changePassword({ new_password: values.new_password, new_password_confirmation: values.new_password_confirmation })
        onSaved('Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.')
      } else {
        let body
        if (kind === 'user') body = { nom: values.nom, prenom: values.prenom, telephone: values.telephone, adresse: values.adresse || null, role: values.role }
        if (kind === 'classe') body = { nom: values.nom, niveau: values.niveau, annee_scolaire: values.annee_scolaire, oustaz_id: Number(values.oustaz_id), inscription_ids: values.inscription_ids }
        if (kind === 'eleve') body = {
          eleve: { nom: values.nom, prenom: values.prenom, date_naissance: values.date_naissance || null, sexe: values.sexe || null, adresse: values.adresse || null },
          inscription: { annee_scolaire: values.annee_scolaire, date_inscription: values.date_inscription },
          tuteurs: guardians.map(g => ({
            mode: g.mode, lien_parente: g.lien_parente || null, est_responsable_legal: g.est_responsable_legal, est_payeur: g.est_payeur,
            ...(g.mode === 'existant' ? { tuteur_id: Number(g.tuteur_id) } : { compte: { nom: g.nom, prenom: g.prenom, telephone: g.telephone, adresse: g.adresse || null } }),
          })),
        }
        const response = await createRecord(kind, body)
        const temporary = kind === 'user' || (kind === 'eleve' && guardians.some(g => g.mode === 'creer'))
        onSaved(`${response.message}${kind === 'eleve' ? ` Matricule : ${response.data.eleve.matricule}.` : ''}${temporary ? ' Mot de passe temporaire des nouveaux comptes : passer. Il devra être changé à la première connexion.' : ''}`)
      }
    } catch (error) {
      if (error.status === 401) { onSessionExpired(); return }
      setErrors(error.errors || {})
      setMessage(error.message)
      requestAnimationFrame(() => errorBox.current?.focus())
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const eligible = (options?.inscriptions || []).filter(i => i.annee_scolaire === values.annee_scolaire)
  return <dialog ref={dialog} className="db-dialog" aria-labelledby="form-title" onCancel={event => { event.preventDefault(); if (!busy && kind !== 'password') onClose() }}>
    <div className="db-dialog-heading"><div><p className="db-eyebrow">Institut Al-Hadi</p><h2 id="form-title">{titles[kind]}</h2></div>{kind !== 'password' && <button className="db-icon-button" aria-label="Fermer le formulaire" disabled={busy} onClick={onClose}><Icon name="close" /></button>}</div>
    <form onSubmit={submit}>
      <fieldset className="db-dialog-body" disabled={busy}>
        {message && <div ref={errorBox} tabIndex={-1} className="db-alert db-alert--error" role="alert"><strong>{message}</strong>{Object.keys(errors).length > 0 && <ul>{Object.entries(errors).filter(([, messages]) => messages?.length).map(([key, messages]) => <li key={key}>{messages[0]}</li>)}</ul>}</div>}
        {kind === 'password' ? <><p className="db-form-note">Avant d’accéder à votre espace, remplacez le mot de passe temporaire. Choisissez au moins 12 caractères avec une majuscule, une minuscule, un chiffre et un symbole.</p>{field('Nouveau mot de passe', 'new_password', { type: 'password', required: true, minLength: 12, autoComplete: 'new-password' })}{field('Confirmer le mot de passe', 'new_password_confirmation', { type: 'password', required: true, minLength: 12, autoComplete: 'new-password' })}<p className="db-form-note">Vous vous reconnecterez après ce changement.</p></> : <>
          <p className="db-form-note">Les champs marqués d’un astérisque sont obligatoires.</p>
          <h3>{kind === 'user' ? 'Identité du compte' : kind === 'eleve' ? 'Dossier de l’élève' : 'Informations de la classe'}</h3>
          <div className="db-form-grid">{kind === 'classe' ? <>{field('Nom de la classe', 'nom', { required: true, maxLength: 120, placeholder: 'Ex. Halaqa Al-Falah' })}{field('Niveau', 'niveau', { required: true, maxLength: 80, placeholder: 'Ex. Intermédiaire' })}</> : <>{field('Prénom', 'prenom', { required: true, maxLength: 120, autoComplete: 'given-name' })}{field('Nom', 'nom', { required: true, maxLength: 120, autoComplete: 'family-name' })}</>}</div>
          {kind === 'user' && <><div className="db-form-grid">{field('Téléphone', 'telephone', { required: true, type: 'tel', maxLength: 24, placeholder: '77 123 45 67' })}<label className="db-field"><span>Rôle *</span><select required name="role" value={values.role} onChange={change}><option value="tuteur">Tuteur</option><option value="oustaz">Oustaz</option><option value="admin">Administrateur</option></select></label></div>{field('Adresse', 'adresse', { maxLength: 255 })}<div className="db-callout"><Icon name="shield" /><span>Le compte recevra le mot de passe temporaire <strong>passer</strong>, à changer lors de sa première connexion.</span></div></>}
          {kind === 'eleve' && <><div className="db-form-grid">{field('Date de naissance', 'date_naissance', { type: 'date', max: new Date().toISOString().slice(0, 10) })}{field('Sexe', 'sexe', { maxLength: 16 })}</div>{field('Adresse', 'adresse', { maxLength: 255 })}</>}
          {kind !== 'user' && <div className="db-form-grid">{field('Année scolaire', 'annee_scolaire', { required: true, pattern: '[0-9]{4}-[0-9]{4}', placeholder: '2026-2027', maxLength: 9 })}{kind === 'eleve' ? field('Date d’inscription', 'date_inscription', { type: 'date', required: true }) : <label className="db-field"><span>Oustaz responsable *</span><select name="oustaz_id" value={values.oustaz_id || ''} onChange={change} required><option value="">Sélectionner un oustaz</option>{options?.oustazs.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>}</div>}
          {kind === 'classe' && <><h3>Élèves à affecter <span className="db-count">{values.inscription_ids.length}</span></h3><p className="db-form-note">Seules les inscriptions actives, sans classe et de l’année saisie sont proposées.</p><div className="db-choice-list">{eligible.length === 0 ? <p className="db-form-note">{values.annee_scolaire ? 'Aucune inscription disponible pour cette année. Vous pouvez créer la classe sans élève.' : 'Saisissez l’année scolaire pour afficher les inscriptions disponibles.'}</p> : eligible.map(i => <label key={i.id}><input type="checkbox" checked={values.inscription_ids.includes(i.id)} onChange={event => setValues(v => ({ ...v, inscription_ids: event.target.checked ? [...v.inscription_ids, i.id] : v.inscription_ids.filter(id => id !== i.id) }))} /><span>{i.label}<small>{i.matricule}</small></span></label>)}</div>{!options?.oustazs.length && <p className="db-field-error">Créez d’abord un compte Oustaz pour pouvoir créer une classe.</p>}</>}
          {kind === 'eleve' && <><h3>Tuteurs rattachés</h3><p className="db-form-note">Un élève doit être lié à au moins un tuteur. Il ne reçoit pas de compte de connexion.</p>{guardians.map((g, index) => <fieldset className="db-guardian" key={index}><legend>Tuteur {index + 1}</legend><div className="db-guardian-heading"><label className="db-field"><span>Compte du tuteur</span><select value={g.mode} onChange={event => changeGuardian(index, 'mode', event.target.value)}><option value="creer">Créer un nouveau compte</option><option value="existant">Utiliser un compte existant</option></select></label>{guardians.length > 1 && <button type="button" className="db-text-button" onClick={() => setGuardians(gs => gs.filter((_, i) => i !== index))}>Retirer</button>}</div>{g.mode === 'existant' ? <label className="db-field"><span>Tuteur actif *</span><select required value={g.tuteur_id} onChange={e => changeGuardian(index, 'tuteur_id', e.target.value)}><option value="">Sélectionner un tuteur</option>{options?.tuteurs.map(t => <option key={t.id} value={t.id}>{t.label} · {t.telephone}</option>)}</select></label> : <><div className="db-form-grid">{['prenom', 'nom', 'telephone', 'adresse'].map(name => <Field key={name} label={{ prenom: 'Prénom', nom: 'Nom', telephone: 'Téléphone', adresse: 'Adresse' }[name]} name={`tuteurs.${index}.compte.${name}`} type={name === 'telephone' ? 'tel' : 'text'} value={g[name]} maxLength={name === 'telephone' ? 24 : name === 'adresse' ? 255 : 120} required={name !== 'adresse'} onChange={e => changeGuardian(index, name, e.target.value)} error={errors[`tuteurs.${index}.compte.${name}`]?.[0]} />)}</div><p className="db-form-note">Mot de passe temporaire : <strong>passer</strong>.</p></>}<Field label="Lien de parenté" name={`tuteurs.${index}.lien_parente`} value={g.lien_parente} maxLength={40} placeholder="Ex. mère, père…" onChange={e => changeGuardian(index, 'lien_parente', e.target.value)} /><div className="db-checkbox-row">{[['est_responsable_legal', 'Responsable légal'], ['est_payeur', 'Payeur']].map(([name, label]) => <label key={name}><input type="checkbox" checked={g[name]} onChange={e => changeGuardian(index, name, e.target.checked)} />{label}</label>)}</div></fieldset>)}<button type="button" className="db-button db-button--secondary" onClick={() => setGuardians(gs => [...gs, { ...newGuardian(), est_responsable_legal: false }])}><Icon name="plus" size={16} />Ajouter un tuteur</button></>}
        </>}
      </fieldset>
      <div className="db-dialog-footer"><button type="button" className="db-button db-button--secondary" disabled={busy} onClick={onClose}>{kind === 'password' ? 'Se déconnecter' : 'Annuler'}</button><button className="db-button" disabled={busy || (kind === 'classe' && !options?.oustazs.length)} aria-busy={busy}>{busy ? 'Enregistrement…' : kind === 'password' ? 'Changer le mot de passe' : 'Enregistrer'}<Icon name="check" size={17} /></button></div>
    </form>
  </dialog>
}
