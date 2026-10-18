import { useEffect, useState } from 'react'
import { useI18n } from '../../../i18n/useI18n'
import { getSynthese } from '../../../services/dashboardService'
import { getSourates } from '../../../services/pedagogieService'
import { sourateLabel } from '../../../utils/coran'
import { JOURS } from '../../../utils/semaine'
import DetailDialog from './DetailDialog'

const CRITERES = ['assiduite_ponctualite', 'discipline_comportement', 'proprete_hygiene', 'camaraderie_respect', 'prieres_devotion']
const PRESENCES = ['present', 'absent', 'retard', 'excuse']

/**
 * Synthèse de progression d'un enfant pour son tuteur : récitation, présences,
 * comportement du mois et dernières fiches hebdomadaires (année scolaire courante).
 *
 * @param {{ eleve: { id: number, prenom: string, nom: string }, onClose: () => void, onSessionExpired: () => void }} props
 */
export default function SyntheseDialog({ eleve, onClose, onSessionExpired }) {
  const { t, lang, formatDate, serverMessage } = useI18n()
  const [data, setData] = useState(null)
  const [sourates, setSourates] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([getSynthese(eleve.id), getSourates()])
      .then(([synthese, refs]) => { if (!cancelled) { setData(synthese); setSourates(refs) } })
      .catch(err => {
        if (cancelled) return
        if (err.status === 401) { onSessionExpired(); return }
        setError(serverMessage(err.message, err.status || 0))
      })
    return () => { cancelled = true }
  }, [eleve.id, onSessionExpired, serverMessage])

  const date = (value, options = { day: 'numeric', month: 'short' }) => formatDate(`${value.slice(0, 10)}T12:00:00`, options)
  const surah = id => {
    const s = sourates.find(item => item.numero === id)
    return s ? sourateLabel(s, lang).replace(/^\d+\.\s*/, '') : `#${id}`
  }
  const passage = r => (r.sourate_debut_id === r.sourate_fin_id
    ? `${surah(r.sourate_debut_id)} ${r.verset_debut} → ${r.verset_fin}`
    : `${surah(r.sourate_debut_id)} ${r.verset_debut} → ${surah(r.sourate_fin_id)} ${r.verset_fin}`)

  const totals = data?.presences.totaux
  const totalSessions = totals ? PRESENCES.reduce((sum, key) => sum + totals[key], 0) : 0
  const attendance = totalSessions ? Math.round(((totals.present + totals.retard) / totalSessions) * 100) : null

  return (
    <DetailDialog
      icon="book"
      title={t('synth.title', { name: `${eleve.prenom} ${eleve.nom}` })}
      subtitle={data && (data.classe ? t('synth.classYear', { classe: data.classe.nom, year: data.annee_scolaire }) : t('synth.noClass', { year: data.annee_scolaire }))}
      onClose={onClose}
      footer={<button type="button" className="db-button db-button--secondary" onClick={onClose}>{t('pay.form.close')}</button>}
    >
      {error && <div className="db-alert db-alert--error" role="alert"><strong>{error}</strong></div>}
      {!data && !error && <div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loading')}</div>}

      {data && (
        <>
          <div className="synth-grid">
            {/* Récitation : moyenne sur 20 des dernières notes */}
            <section className="synth-card" aria-labelledby="synth-recitation">
              <h3 id="synth-recitation">{t('synth.recitation')}</h3>
              {data.progression.moyenne_periode === null ? (
                <p className="db-muted-text">{t('synth.notEvaluated')}</p>
              ) : (
                <>
                  <span className="synth-big">{data.progression.moyenne_periode} / 20</span>
                  <small className="db-muted-text">{t('synth.recitationHint')}</small>
                  <div className="synth-chips">
                    {data.progression.dernieres_evaluations.map((note, index) => (
                      <span key={index} className="ped-count">{date(note.date)} · {note.note}/{note.sur}</span>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* Présences de l'année */}
            <section className="synth-card" aria-labelledby="synth-presences">
              <h3 id="synth-presences">{t('synth.attendance')}</h3>
              {totalSessions === 0 ? (
                <p className="db-muted-text">{t('synth.noAttendance')}</p>
              ) : (
                <>
                  <span className="synth-big">{attendance} %</span>
                  <small className="db-muted-text">{t('synth.attendanceHint', { count: totalSessions })}</small>
                  <div className="synth-chips">
                    {PRESENCES.map(key => <span key={key} className={`ped-count ped-count--${key}`}>{t(`ped.appel.status.${key}`)} : {totals[key]}</span>)}
                  </div>
                </>
              )}
            </section>

            {/* Comportement du mois : 5 critères sur 4 */}
            <section className="synth-card" aria-labelledby="synth-behavior">
              <h3 id="synth-behavior">{t('synth.behavior')}</h3>
              {!data.comportement ? (
                <p className="db-muted-text">{t('synth.noBehavior')}</p>
              ) : (
                <ul className="synth-bars">
                  {CRITERES.map(c => (
                    <li key={c}>
                      <span>{t(`ped.exemplarite.criteria.${c}`)}</span>
                      <span className="synth-bar" aria-hidden="true"><span style={{ width: `${(data.comportement[c] / 4) * 100}%` }} /></span>
                      <strong>{data.comportement[c]}/4</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Dernières fiches hebdomadaires */}
          <h3 className="db-form-section">{t('synth.weeks')}</h3>
          {data.activite_hebdomadaire.length === 0 && <p className="db-muted-text">{t('synth.noWeek')}</p>}
          <div className="ped-days">
            {data.activite_hebdomadaire.map(fiche => (
              <article key={fiche.date_debut} className="synth-week">
                <header>
                  <strong>{t('ped.suivi.weekLabel', { from: date(fiche.date_debut), to: date(fiche.date_fin) })}</strong>
                  <span className={`db-badge ${fiche.statut === 'validee' ? 'db-badge--success' : 'db-badge--attention'}`}><span className="db-badge-dot" />{t(`ped.fiche.status.${fiche.statut}`)}</span>
                </header>
                <p className="db-form-note">{t('ped.suivi.objective')} : {fiche.sourate_debut} {fiche.verset_debut} → {fiche.sourate_fin} {fiche.verset_fin}</p>
                <ul className="synth-days">
                  {[...fiche.notes].sort((a, b) => JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour)).map(note => (
                    <li key={note.jour}>
                      <strong>{t(`ped.days.${note.jour}`)}</strong>
                      {['D', 'J', 'M'].filter(key => note.reperes[key]).map(key => (
                        <span key={key}> · {key} {passage(note.reperes[key])}</span>
                      ))}
                      {note.qualite_recitation !== null && <span> · {t('synth.grade', { grade: note.qualite_recitation })}</span>}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className="db-form-note">{t('synth.legend')}</p>
        </>
      )}
    </DetailDialog>
  )
}
