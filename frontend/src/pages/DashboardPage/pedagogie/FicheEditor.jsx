import { useEffect, useRef, useState } from 'react'
import { useDialogs } from '../../../components/Dialogs/dialogsContext'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { autoriserModification, createFiche, demanderModification, getFiche, saveFicheDay, updateFiche, validateFiche } from '../../../services/pedagogieService'
import { rangeError } from '../../../utils/coran'
import { JOURS, ajouterJours, dateDuJour } from '../../../utils/semaine'
import SourateRange from './SourateRange'

const REPERES = ['D', 'J', 'M']
const NOTES = [0, 1, 2, 3, 4]

/** Objectif d'une fiche au format attendu par SourateRange / l'API. */
const objectiveOf = fiche => ({
  sourate_debut_id: fiche.sourate_debut_id,
  verset_debut: fiche.verset_debut,
  sourate_fin_id: fiche.sourate_fin_id,
  verset_fin: fiche.verset_fin,
})

/** Premier message d'erreur renvoyé par l'API (validation), sinon le message général. */
function apiMessage(err, serverMessage) {
  const first = Object.values(err.errors || {})[0]?.[0]
  return serverMessage(first || err.message, err.status || 0, { fallback: 'original' })
}

/**
 * Pastille de statut d'une fiche : brouillon (gris), validée (vert),
 * validée avec une demande de modification en attente (or).
 */
export function FicheStatus({ fiche }) {
  const { t } = useI18n()
  if (fiche.statut === 'validee' && fiche.modification_demandee_at) {
    return <span className="db-badge db-badge--attention"><span className="db-badge-dot" />{t('ped.fiche.status.demande')}</span>
  }
  const classes = { brouillon: 'db-badge--neutral', validee: 'db-badge--success' }
  return <span className={`db-badge ${classes[fiche.statut] ?? 'db-badge--neutral'}`}><span className="db-badge-dot" />{t(`ped.fiche.status.${fiche.statut}`)}</span>
}

/* ==========================================================================
   Création d'une fiche : objectif de la semaine
   ========================================================================== */

/**
 * @param {{ eleve: object, samedi: string, sourates: object[], onClose: () => void,
 *           onSaved: (message: string, fiche: object) => void, onSessionExpired: () => void }} props
 */
export function FicheObjectiveDialog({ eleve, samedi, sourates, onClose, onSaved, onSessionExpired }) {
  const { t, formatDate, serverMessage } = useI18n()
  const dialog = useRef(null)
  const [range, setRange] = useState({ sourate_debut_id: '', verset_debut: 1, sourate_fin_id: '', verset_fin: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => node.close()
  }, [])

  // Choisir la sourate de début propose la même sourate pour la fin
  function changeRange(next) {
    setError('')
    setRange(previous => (next.sourate_debut_id && !previous.sourate_fin_id ? { ...next, sourate_fin_id: next.sourate_debut_id } : next))
  }

  async function submit(event) {
    event.preventDefault()
    const local = rangeError(range, sourates)
    if (local) { setError(t(local)); return }
    setBusy(true)
    try {
      const response = await createFiche({ eleve_id: eleve.id, date_debut: samedi, date_fin: ajouterJours(samedi, 4), ...range })
      onSaved(serverMessage(response.message, 201, { fallback: 'original' }), response.data)
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      setError(apiMessage(err, serverMessage))
    } finally {
      setBusy(false)
    }
  }

  const day = value => formatDate(`${value}T12:00:00`, { day: 'numeric', month: 'long' })

  return (
    <dialog ref={dialog} className="db-dialog pay-dialog" aria-labelledby="fiche-new-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
      <div className="db-dialog-heading">
        <span className="db-dialog-icon"><Icon name="book" /></span>
        <div>
          <h2 id="fiche-new-title">{t('ped.fiche.newTitle')}</h2>
          <p>{eleve.prenom} {eleve.nom} · {t('ped.suivi.weekLabel', { from: day(samedi), to: day(ajouterJours(samedi, 4)) })}</p>
        </div>
        <button type="button" className="db-icon-button" aria-label={t('form.close')} disabled={busy} onClick={onClose}><Icon name="close" /></button>
      </div>
      <form onSubmit={submit} noValidate>
        <div className="db-dialog-body">
          <fieldset className="db-dialog-fields" disabled={busy}>
            <p className="db-form-note">{t('ped.fiche.objectiveHelp')}</p>
            <SourateRange id="fiche-new" value={range} onChange={changeRange} sourates={sourates} error={error} />
          </fieldset>
        </div>
        <div className="db-dialog-footer">
          <button type="button" className="db-button db-button--secondary" disabled={busy} onClick={onClose}>{t('form.cancel')}</button>
          <button className="db-button" disabled={busy} aria-busy={busy}>{busy ? t('form.saving') : t('ped.fiche.createSubmit')}<Icon name="check" size={17} /></button>
        </div>
      </form>
    </dialog>
  )
}

/* ==========================================================================
   Fiche ouverte : objectif, saisie des 5 jours, validation (Oustaz),
   demande de modification (Oustaz) et réouverture (Admin)
   ========================================================================== */

/** État d'édition d'un jour à partir de la note enregistrée. */
function dayState(note) {
  return {
    reperes: Object.fromEntries(REPERES.map(key => [key, note?.reperes?.[key] ?? null])),
    qualite: note?.qualite_recitation ?? null,
    dirty: false,
    saving: false,
    error: '',
    saved: Boolean(note),
  }
}

/**
 * @param {{ ficheId: number, admin: boolean, sourates: object[], onClose: () => void,
 *           onNotice: (message: string) => void, onSessionExpired: () => void }} props
 */
export default function FicheEditor({ ficheId, admin, sourates, onClose, onNotice, onSessionExpired }) {
  const { t, formatDate, serverMessage } = useI18n()
  const { confirm } = useDialogs()
  const dialog = useRef(null)
  const [fiche, setFiche] = useState(null)
  const [days, setDays] = useState({})
  const [objective, setObjective] = useState(null) // en cours de modification, sinon null
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => node.close()
  }, [])

  useEffect(() => {
    let cancelled = false
    getFiche(ficheId)
      .then(data => {
        if (cancelled) return
        setFiche(data)
        setDays(Object.fromEntries(JOURS.map(jour => [jour, dayState(data.notes.find(n => n.jour === jour))])))
      })
      .catch(err => {
        if (cancelled) return
        if (err.status === 401) { onSessionExpired(); return }
        setError(apiMessage(err, serverMessage))
      })
    return () => { cancelled = true }
  }, [ficheId, onSessionExpired, serverMessage])

  // Seul l'oustaz remplit une fiche, tant qu'elle est en brouillon ; l'administration consulte
  const editable = !admin && fiche?.statut === 'brouillon'
  const unsaved = JOURS.filter(jour => days[jour]?.dirty)
  const updateDay = (jour, patch) => setDays(previous => ({ ...previous, [jour]: { ...previous[jour], ...patch } }))

  /** Active ou retire un repère ; D est prérempli avec l'objectif de la semaine. */
  function toggleRepere(jour, key, enabled) {
    const empty = { sourate_debut_id: '', verset_debut: '', sourate_fin_id: '', verset_fin: '' }
    const value = enabled ? (key === 'D' ? objectiveOf(fiche) : empty) : null
    updateDay(jour, { reperes: { ...days[jour].reperes, [key]: value }, dirty: true, error: '' })
  }

  async function saveDay(jour) {
    const state = days[jour]
    for (const key of REPERES) {
      const problem = state.reperes[key] && rangeError(state.reperes[key], sourates)
      if (problem) { updateDay(jour, { error: `${key} : ${t(problem)}` }); return }
    }
    updateDay(jour, { saving: true, error: '' })
    try {
      await saveFicheDay(fiche.id, jour, { reperes: state.reperes, qualite_recitation: state.qualite })
      updateDay(jour, { saving: false, dirty: false, saved: true })
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      updateDay(jour, { saving: false, error: apiMessage(err, serverMessage) })
    }
  }

  async function saveObjective() {
    const problem = rangeError(objective, sourates)
    if (problem) { setError(t(problem)); return }
    setBusy(true)
    setError('')
    try {
      const response = await updateFiche(fiche.id, objective)
      setFiche(current => ({ ...current, ...response.data, eleve: current.eleve }))
      setObjective(null)
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      setError(apiMessage(err, serverMessage))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Validation (Oustaz), demande de modification d'une fiche validée (Oustaz, motif facultatif)
   * ou réouverture (Admin) : chaque action passe par une fenêtre de confirmation.
   */
  async function changeStatus(action) {
    const name = `${fiche.eleve?.prenom ?? ''} ${fiche.eleve?.nom ?? ''}`.trim()
    const answer = await confirm({
      validate: { title: t('ped.fiche.validateTitle', { name }), message: t('ped.fiche.validateConfirm'), confirmLabel: t('ped.fiche.validate'), tone: 'warning' },
      request: { title: t('ped.fiche.requestTitle'), message: t('ped.fiche.requestConfirm'), confirmLabel: t('ped.fiche.request'), input: { label: t('ped.fiche.requestReason'), multiline: true, placeholder: t('ped.fiche.requestPlaceholder') } },
      allow: { title: t('ped.fiche.allowTitle', { name }), message: t('ped.fiche.allowConfirm'), confirmLabel: t('ped.fiche.allow'), tone: 'warning' },
    }[action])
    if (answer === false) return
    setBusy(true)
    setError('')
    try {
      const request = { validate: () => validateFiche(fiche.id), request: () => demanderModification(fiche.id, answer), allow: () => autoriserModification(fiche.id) }[action]
      const response = await request()
      setFiche(current => ({ ...current, ...response.data, eleve: current.eleve, notes: current.notes }))
      onNotice(serverMessage(response.message, 200, { fallback: 'original' }))
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      setError(apiMessage(err, serverMessage))
    } finally {
      setBusy(false)
    }
  }

  async function close() {
    if (unsaved.length && !(await confirm({ title: t('ped.fiche.unsavedTitle'), message: t('ped.fiche.unsavedConfirm'), confirmLabel: t('ped.fiche.closeAnyway'), tone: 'warning' }))) return
    onClose()
  }

  const day = value => formatDate(`${value}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <dialog ref={dialog} className="db-dialog ped-fiche-dialog" aria-labelledby="fiche-title" onCancel={event => { event.preventDefault(); if (!busy) close() }}>
      <div className="db-dialog-heading">
        <span className="db-dialog-icon"><Icon name="book" /></span>
        <div>
          <h2 id="fiche-title">{fiche?.eleve ? t('ped.fiche.title', { name: `${fiche.eleve.prenom} ${fiche.eleve.nom}` }) : t('dash.loading')}</h2>
          {fiche && <p>{t('ped.suivi.weekLabel', { from: day(fiche.date_debut), to: day(fiche.date_fin) })} · <FicheStatus fiche={fiche} /></p>}
        </div>
        <button type="button" className="db-icon-button" aria-label={t('form.close')} disabled={busy} onClick={close}><Icon name="close" /></button>
      </div>

      <div className="db-dialog-body">
        {error && <div className="db-alert db-alert--error" role="alert"><strong>{error}</strong></div>}
        {!fiche && !error && <div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loading')}</div>}

        {fiche && (
          <>
            {/* ---------- Objectif de la semaine ---------- */}
            <div className="ped-objective">
              <span className="ped-objective-label">{t('ped.suivi.objective')}</span>
              {objective ? (
                <>
                  <SourateRange id="fiche-objective" value={objective} onChange={setObjective} sourates={sourates} disabled={busy} />
                  <div className="db-row-actions">
                    <button type="button" className="db-button db-button--small" disabled={busy} onClick={saveObjective}>{t('form.save')}</button>
                    <button type="button" className="db-button db-button--secondary db-button--small" disabled={busy} onClick={() => setObjective(null)}>{t('form.cancel')}</button>
                  </div>
                </>
              ) : (
                <>
                  <strong>{fiche.sourate_debut} {fiche.verset_debut} → {fiche.sourate_fin} {fiche.verset_fin}</strong>
                  {editable && <button type="button" className="db-text-button" onClick={() => setObjective(objectiveOf(fiche))}><Icon name="pencil" size={14} />{t('ped.fiche.editObjective')}</button>}
                </>
              )}
            </div>
            {/* Historique : qui a validé, rouvert, demande en attente */}
            <ul className="ped-fiche-history">
              {fiche.enseignant && <li><Icon name="users" size={14} />{t('ped.fiche.filledBy', { name: fiche.enseignant })}</li>}
              {fiche.valide_at && <li><Icon name="check" size={14} />{t('ped.fiche.validatedOn', { date: formatDate(fiche.valide_at, { dateStyle: 'medium', timeStyle: 'short' }), name: fiche.valide_par ?? '—' })}</li>}
              {fiche.modification_autorisee_at && <li><Icon name="unlock" size={14} />{t('ped.fiche.reopenedOn', { date: formatDate(fiche.modification_autorisee_at, { dateStyle: 'medium' }), name: fiche.modification_autorisee_par ?? '—' })}</li>}
            </ul>
            {fiche.statut === 'validee' && fiche.modification_demandee_at && (
              <div className="db-callout ped-request">
                <Icon name="lock" />
                <span>
                  <strong>{t('ped.fiche.requestPending', { date: formatDate(fiche.modification_demandee_at, { dateStyle: 'medium' }) })}</strong>
                  {fiche.motif_demande_modification && <> « {fiche.motif_demande_modification} »</>}
                </span>
              </div>
            )}
            {!editable && (
              <p className="db-form-note">
                {admin
                  ? t(fiche.statut === 'brouillon' ? 'ped.fiche.adminDraft' : 'ped.fiche.adminValidated')
                  : t('ped.fiche.readOnlyValidated')}
              </p>
            )}

            {/* ---------- Les 5 jours de cours ---------- */}
            <div className="ped-days">
              {JOURS.map(jour => {
                const state = days[jour]
                if (!state) return null
                return (
                  <section key={jour} className={`ped-fiche-day ${state.dirty ? 'ped-fiche-day--dirty' : ''}`} aria-labelledby={`fiche-day-${jour}`}>
                    <header>
                      <h3 id={`fiche-day-${jour}`}>{day(dateDuJour(fiche.date_debut, jour))}</h3>
                      {state.saved && !state.dirty && <span className="ped-saved"><Icon name="check" size={14} />{t('ped.fiche.daySaved')}</span>}
                    </header>

                    {REPERES.map(key => (
                      <div key={key} className="ped-repere">
                        <label className="ped-repere-toggle">
                          <input type="checkbox" checked={state.reperes[key] !== null} disabled={!editable} onChange={event => toggleRepere(jour, key, event.target.checked)} />
                          <span><strong>{key}</strong> · {t(`ped.fiche.repere.${key}`)}</span>
                        </label>
                        {state.reperes[key] && (
                          <SourateRange
                            id={`fiche-${jour}-${key}`}
                            value={state.reperes[key]}
                            onChange={value => updateDay(jour, { reperes: { ...state.reperes, [key]: value }, dirty: true, error: '' })}
                            sourates={sourates}
                            disabled={!editable}
                          />
                        )}
                      </div>
                    ))}

                    {/* Note de récitation : 0 (à reprendre) à 4 (excellent) */}
                    <fieldset className="ped-segmented ped-grade">
                      <legend>{t('ped.fiche.recitation')}</legend>
                      {NOTES.map(note => (
                        <label key={note} className="ped-segment" title={t(`ped.fiche.grades.${note}`)}>
                          <input type="radio" name={`note-${jour}`} checked={state.qualite === note} disabled={!editable} onChange={() => updateDay(jour, { qualite: note, dirty: true })} />
                          <span>{note}</span>
                        </label>
                      ))}
                    </fieldset>
                    {state.qualite !== null && <small className="ped-grade-hint">{t(`ped.fiche.grades.${state.qualite}`)}</small>}

                    {state.error && <p className="db-field-error" role="alert">{state.error}</p>}
                    {editable && (
                      <button type="button" className="db-button db-button--small" disabled={!state.dirty || state.saving} onClick={() => saveDay(jour)}>
                        <Icon name="check" size={15} />{state.saving ? t('form.saving') : t('ped.fiche.saveDay', { day: t(`ped.days.${jour}`) })}
                      </button>
                    )}
                  </section>
                )
              })}
            </div>
          </>
        )}
      </div>

      <div className="db-dialog-footer">
        <button type="button" className="db-button db-button--secondary" disabled={busy} onClick={close}>{t('pay.form.close')}</button>
        {editable && (
          <button type="button" className="db-button" disabled={busy || unsaved.length > 0} onClick={() => changeStatus('validate')} title={unsaved.length ? t('ped.fiche.saveDaysFirst') : undefined}>
            <Icon name="check" size={17} />{t('ped.fiche.validate')}
          </button>
        )}
        {!admin && fiche?.statut === 'validee' && !fiche.modification_demandee_at && (
          <button type="button" className="db-button db-button--secondary" disabled={busy} onClick={() => changeStatus('request')}>
            <Icon name="unlock" size={17} />{t('ped.fiche.request')}
          </button>
        )}
        {admin && fiche?.statut === 'validee' && (
          <button type="button" className="db-button" disabled={busy} onClick={() => changeStatus('allow')}>
            <Icon name="unlock" size={17} />{t('ped.fiche.allow')}
          </button>
        )}
      </div>
    </dialog>
  )
}
