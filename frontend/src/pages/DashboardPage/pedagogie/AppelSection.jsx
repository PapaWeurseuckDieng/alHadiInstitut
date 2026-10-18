import { useEffect, useState } from 'react'
import Avatar from '../../../components/Avatar'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { getPlanning, getPresences, savePresences } from '../../../services/pedagogieService'
import { aujourdhui, jourDeCours } from '../../../utils/semaine'

const STATUTS = ['present', 'absent', 'retard', 'excuse']

/**
 * Appel d'une séance : date (aujourd'hui par défaut), séance du jour, statut de chaque élève.
 * Les statuts déjà enregistrés sont rechargés : refaire l'appel les met à jour.
 *
 * @param {{ classe: object, onNotice: (message: string) => void, onSessionExpired: () => void }} props
 */
export default function AppelSection({ classe, onNotice, onSessionExpired }) {
  const { t, formatDate, serverMessage } = useI18n()
  const [date, setDate] = useState(aujourdhui)
  const [planning, setPlanning] = useState(null)
  const [seanceId, setSeanceId] = useState('')
  const [appel, setAppel] = useState(null)
  // Statut choisi par élève : { [eleve_id]: 'present' | … }
  const [statuts, setStatuts] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const jour = jourDeCours(date)
  const seances = jour && planning ? planning[jour] : []

  /** Erreur commune : session expirée → connexion, sinon message affiché. */
  function fail(err) {
    if (err.status === 401) { onSessionExpired(); return }
    setError({ message: err.errors?.date_cours?.[0] || err.message, status: err.status })
  }

  // 1. Planning de la classe (séances de la semaine)
  useEffect(() => {
    let cancelled = false
    getPlanning(classe.id).then(semaine => { if (!cancelled) setPlanning(semaine) }).catch(err => { if (!cancelled) fail(err) })
    return () => { cancelled = true }
    // fail ne dépend que de props stables
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classe.id])

  // 2. Séance choisie : la première du jour, sauf si l'utilisateur en a choisi une autre ce jour-là
  const seance = seances.find(s => String(s.id) === String(seanceId)) ?? seances[0] ?? null

  // 3. Élèves et statuts déjà saisis pour cette séance et cette date
  useEffect(() => {
    if (!seance) return undefined
    let cancelled = false
    getPresences(seance.id, date)
      .then(data => {
        if (cancelled) return
        setAppel(data)
        setStatuts(Object.fromEntries(data.eleves.filter(e => e.statut).map(e => [e.eleve_id, e.statut])))
        setError(null)
        setLoading(false)
      })
      .catch(err => { if (!cancelled) { fail(err); setLoading(false) } })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seance?.id, date])

  function changeDate(value) {
    setDate(value)
    setSeanceId('')
    setAppel(null)
    setError(null)
    if (value && jourDeCours(value)) setLoading(true)
  }

  function allPresent() {
    setStatuts(previous => Object.fromEntries(appel.eleves.map(e => [e.eleve_id, previous[e.eleve_id] ?? 'present'])))
  }

  async function save() {
    const presences = appel.eleves.filter(e => statuts[e.eleve_id]).map(e => ({ eleve_id: e.eleve_id, statut: statuts[e.eleve_id] }))
    if (!presences.length) return
    setSaving(true)
    setError(null)
    try {
      const response = await savePresences(seance.id, date, presences)
      onNotice(serverMessage(response.message, 200, { fallback: 'original' }))
    } catch (err) {
      fail(err)
    } finally {
      setSaving(false)
    }
  }

  // Appel affiché seulement s'il correspond à la date et à la séance choisies (pas de données périmées)
  const eleves = appel?.date_cours === date && appel?.planning_id === seance?.id ? appel.eleves : []
  const missing = eleves.filter(e => !statuts[e.eleve_id]).length
  const counts = Object.fromEntries(STATUTS.map(s => [s, eleves.filter(e => statuts[e.eleve_id] === s).length]))
  const dateLabel = date ? formatDate(`${date}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long' }) : ''

  let body
  if (!date) body = null
  else if (!jour) body = <Empty icon="calendar" title={t('ped.appel.noCourseDay')} text={t('ped.appel.noCourseDayText')} />
  else if (!planning) body = <div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loadingData')}</div>
  else if (!seance) body = <Empty icon="calendar" title={t('ped.appel.noSession', { day: t(`ped.days.${jour}`) })} text={t('ped.appel.noSessionText')} />
  else if (loading || !appel || appel.date_cours !== date || appel.planning_id !== seance.id) body =<div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loadingData')}</div>
  else if (!eleves.length) body = <Empty icon="users" title={t('ped.appel.noStudent')} text={t('ped.appel.noStudentText')} />
  else {
    body = (
      <>
        <ul className="ped-roll">
          {eleves.map(eleve => (
            <li key={eleve.eleve_id} className={statuts[eleve.eleve_id] ? `ped-roll--${statuts[eleve.eleve_id]}` : ''}>
              <span className="db-person">
                <Avatar person={eleve} />
                <span><strong>{eleve.prenom} {eleve.nom}</strong><small><bdi>{eleve.matricule}</bdi></small></span>
              </span>
              {/* Groupe de boutons radio : un seul statut par élève */}
              <fieldset className="ped-segmented">
                <legend className="db-sr-only">{t('ped.appel.statusOf', { name: `${eleve.prenom} ${eleve.nom}` })}</legend>
                {STATUTS.map(statut => (
                  <label key={statut} className={`ped-segment ped-segment--${statut}`}>
                    <input
                      type="radio"
                      name={`statut-${eleve.eleve_id}`}
                      value={statut}
                      checked={statuts[eleve.eleve_id] === statut}
                      onChange={() => setStatuts(previous => ({ ...previous, [eleve.eleve_id]: statut }))}
                    />
                    <span>{t(`ped.appel.status.${statut}`)}</span>
                  </label>
                ))}
              </fieldset>
            </li>
          ))}
        </ul>

        <div className="ped-footer">
          <p className="ped-counts">
            {STATUTS.map(s => <span key={s} className={`ped-count ped-count--${s}`}>{t(`ped.appel.status.${s}`)} : {counts[s]}</span>)}
            {missing > 0 && <span className="ped-missing">{t('ped.appel.missing', { count: missing })}</span>}
          </p>
          <button type="button" className="db-button" onClick={save} disabled={saving || missing === eleves.length}>
            <Icon name="check" size={17} />{saving ? t('form.saving') : t('ped.appel.save')}
          </button>
        </div>
      </>
    )
  }

  return (
    <section className="db-panel" aria-labelledby="ped-appel-title">
      <div className="db-panel-heading">
        <div>
          <h2 id="ped-appel-title">{t('ped.appel.title')}</h2>
          <p>{dateLabel}{seance ? ` · ${seance.activite} (${seance.heure_debut} – ${seance.heure_fin})` : ''}</p>
        </div>
      </div>

      <div className="ped-toolbar">
        <div className="db-field">
          <label htmlFor="ped-appel-date">{t('ped.appel.date')}</label>
          <input id="ped-appel-date" type="date" value={date} onChange={event => changeDate(event.target.value)} />
        </div>
        {date !== aujourdhui() && (
          <button type="button" className="db-button db-button--secondary" onClick={() => changeDate(aujourdhui())}>{t('ped.today')}</button>
        )}
        {seances.length > 1 && (
          <div className="db-field">
            <label htmlFor="ped-appel-seance">{t('ped.appel.session')}</label>
            <select id="ped-appel-seance" value={seance?.id ?? ''} onChange={event => { setSeanceId(event.target.value); setLoading(true) }}>
              {seances.map(s => <option key={s.id} value={s.id}>{s.heure_debut} – {s.heure_fin} · {s.activite}</option>)}
            </select>
          </div>
        )}
        {eleves.length > 0 && (
          <button type="button" className="db-button db-button--secondary ped-toolbar-end" onClick={allPresent}>
            <Icon name="check" size={16} />{t('ped.appel.allPresent')}
          </button>
        )}
      </div>

      {error && (
        <div className="db-alert db-alert--error" role="alert">
          <span>{error.status ? serverMessage(error.message, error.status, { fallback: 'original' }) : error.message}</span>
        </div>
      )}

      {body}
    </section>
  )
}

/** Message d'état vide (pas de cours, pas de séance, pas d'élève). */
export function Empty({ icon, title, text }) {
  return (
    <div className="db-empty">
      <span className="db-empty-icon"><Icon name={icon} size={24} /></span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  )
}
