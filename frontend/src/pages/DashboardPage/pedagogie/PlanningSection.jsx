import { useEffect, useRef, useState } from 'react'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { createSeance, getPlanning, updateSeance } from '../../../services/pedagogieService'
import { JOURS } from '../../../utils/semaine'

/**
 * Planning hebdomadaire d'une classe : séances récurrentes du samedi au mercredi.
 * @param {{ classe: object, onNotice: (message: string) => void, onSessionExpired: () => void }} props
 */
export default function PlanningSection({ classe, onNotice, onSessionExpired }) {
  const { t, serverMessage } = useI18n()
  const [semaine, setSemaine] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  // Fenêtre : null = fermée, { jour } = nouvelle séance, séance = modification
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    let cancelled = false
    getPlanning(classe.id)
      .then(data => { if (!cancelled) { setSemaine(data); setError(null) } })
      .catch(err => {
        if (cancelled) return
        if (err.status === 401) { onSessionExpired(); return }
        setError({ message: err.message, status: err.status })
      })
    return () => { cancelled = true }
  }, [classe.id, reload, onSessionExpired])

  return (
    <section className="db-panel" aria-labelledby="ped-planning-title">
      <div className="db-panel-heading">
        <div>
          <h2 id="ped-planning-title">{t('ped.planning.title')}</h2>
          <p>{t('ped.planning.text')}</p>
        </div>
        <button type="button" className="db-button" onClick={() => setEditing({ jour: 'samedi' })} disabled={!semaine}>
          <Icon name="plus" size={17} />{t('ped.planning.add')}
        </button>
      </div>

      {error && (
        <div className="db-alert db-alert--error" role="alert">
          <span>{error.status ? serverMessage(error.message, error.status) : error.message}</span>
          <button type="button" className="db-button db-button--secondary" onClick={() => setReload(r => r + 1)}>{t('dash.retry')}</button>
        </div>
      )}

      {!semaine && !error && <div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loadingData')}</div>}

      {semaine && (
        <div className="ped-week">
          {JOURS.map(jour => (
            <div key={jour} className="ped-day" role="group" aria-label={t(`ped.days.${jour}`)}>
              <h3>{t(`ped.days.${jour}`)}</h3>
              {semaine[jour].length === 0 && <p className="ped-day-empty">{t('ped.planning.noSession')}</p>}
              {semaine[jour].map(seance => (
                <button key={seance.id} type="button" className="ped-session" onClick={() => setEditing(seance)} aria-label={t('ped.planning.editSession', { activity: seance.activite, day: t(`ped.days.${jour}`) })}>
                  <span className="ped-session-time">{seance.heure_debut} – {seance.heure_fin}</span>
                  <strong>{seance.activite}</strong>
                  <Icon name="pencil" size={14} />
                </button>
              ))}
              <button type="button" className="db-text-button ped-day-add" onClick={() => setEditing({ jour })}>
                <Icon name="plus" size={14} />{t('ped.planning.addShort')}
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <SeanceDialog
          classeId={classe.id}
          seance={editing.id ? editing : null}
          jour={editing.jour}
          onClose={() => setEditing(null)}
          onSaved={message => { setEditing(null); onNotice(message); setReload(r => r + 1) }}
          onSessionExpired={onSessionExpired}
        />
      )}
    </section>
  )
}

/** Fenêtre « Ajouter / Modifier une séance ». */
function SeanceDialog({ classeId, seance, jour, onClose, onSaved, onSessionExpired }) {
  const { t, serverMessage } = useI18n()
  const dialog = useRef(null)
  const [values, setValues] = useState({
    jour: seance?.jour ?? jour,
    heure_debut: seance?.heure_debut ?? '08:00',
    heure_fin: seance?.heure_fin ?? '10:00',
    activite: seance?.activite ?? '',
  })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => node.close()
  }, [])

  function change(event) {
    const { name, value } = event.target
    setValues(previous => ({ ...previous, [name]: value }))
    setErrors(previous => ({ ...previous, [name]: undefined }))
  }

  async function submit(event) {
    event.preventDefault()
    const local = {}
    if (!values.activite.trim()) local.activite = t('ped.planning.activityRequired')
    if (values.heure_fin <= values.heure_debut) local.heure_fin = t('ped.planning.endAfterStart')
    if (Object.keys(local).length) { setErrors(local); return }

    setBusy(true)
    setMessage('')
    const body = { ...values, activite: values.activite.trim() }
    try {
      const response = seance ? await updateSeance(seance.id, body) : await createSeance(classeId, body)
      onSaved(serverMessage(response.message, seance ? 200 : 201, { fallback: 'original' }))
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      setErrors(Object.fromEntries(Object.entries(err.errors || {}).map(([key, messages]) => [key, serverMessage(messages[0], 422, { fallback: 'original' })])))
      setMessage(err.status ? serverMessage(err.message, err.status) : err.message)
    } finally {
      setBusy(false)
    }
  }

  const fieldError = name => errors[name] && <small className="db-field-error" id={`seance-${name}-error`}>{errors[name]}</small>
  const invalid = name => ({ 'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? `seance-${name}-error` : undefined })

  return (
    <dialog ref={dialog} className="db-dialog pay-dialog" aria-labelledby="seance-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
      <div className="db-dialog-heading">
        <span className="db-dialog-icon"><Icon name="calendar" /></span>
        <div>
          <h2 id="seance-title">{seance ? t('ped.planning.editTitle') : t('ped.planning.addTitle')}</h2>
          <p>{t('ped.planning.dialogText')}</p>
        </div>
        <button type="button" className="db-icon-button" aria-label={t('form.close')} disabled={busy} onClick={onClose}><Icon name="close" /></button>
      </div>
      <form onSubmit={submit} noValidate>
        <div className="db-dialog-body">
          <fieldset className="db-dialog-fields" disabled={busy}>
            {message && <div className="db-alert db-alert--error" role="alert"><strong>{message}</strong></div>}
            <div className="db-form-grid">
              <div className="db-field">
                <label htmlFor="seance-jour">{t('ped.planning.day')}</label>
                <select id="seance-jour" name="jour" value={values.jour} onChange={change}>
                  {JOURS.map(j => <option key={j} value={j}>{t(`ped.days.${j}`)}</option>)}
                </select>
              </div>
              <div className="db-field">
                <label htmlFor="seance-activite">{t('ped.planning.activity')}<span className="db-required" aria-hidden="true"> *</span></label>
                <input id="seance-activite" name="activite" maxLength={120} value={values.activite} onChange={change} placeholder={t('ped.planning.activityPlaceholder')} {...invalid('activite')} />
                {fieldError('activite')}
              </div>
              <div className="db-field">
                <label htmlFor="seance-heure_debut">{t('ped.planning.start')}</label>
                <input id="seance-heure_debut" name="heure_debut" type="time" value={values.heure_debut} onChange={change} {...invalid('heure_debut')} />
                {fieldError('heure_debut')}
              </div>
              <div className="db-field">
                <label htmlFor="seance-heure_fin">{t('ped.planning.end')}</label>
                <input id="seance-heure_fin" name="heure_fin" type="time" value={values.heure_fin} onChange={change} {...invalid('heure_fin')} />
                {fieldError('heure_fin')}
              </div>
            </div>
          </fieldset>
        </div>
        <div className="db-dialog-footer">
          <button type="button" className="db-button db-button--secondary" disabled={busy} onClick={onClose}>{t('form.cancel')}</button>
          <button className="db-button" disabled={busy} aria-busy={busy}>{busy ? t('form.saving') : t('ped.planning.save')}<Icon name="check" size={17} /></button>
        </div>
      </form>
    </dialog>
  )
}
