import { useEffect, useState } from 'react'
import Avatar from '../../../components/Avatar'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { getEleveDuMois } from '../../../services/pedagogieService'
import { decalerMois, moisCourant } from '../../../utils/semaine'
import { usePaymentFormat } from '../paiements/usePaymentFormat'
import { Empty } from './AppelSection'
import ScoreBar from './ScoreBar'
import '../details/Details.css'
import './Pedagogie.css'

const COMPOSANTES = [['exemplarite_sur_100', 'exemplarite', '50'], ['objectifs_sur_100', 'objectifs', '30'], ['recitation_sur_100', 'recitation', '20']]

/** Les trois composantes du score d'un élève, en barres. */
function Components({ row }) {
  const { t } = useI18n()
  return (
    <dl className="edm-components">
      {COMPOSANTES.map(([key, label, weight]) => (
        <div key={key}>
          <dt>{t(`edm.${label}`)} <small>{weight} %</small></dt>
          <dd><ScoreBar value={row[key]} label={t(`edm.${label}`)} /></dd>
        </div>
      ))}
    </dl>
  )
}

/** Nom d'élève cliquable : ouvre sa fiche. */
function StudentButton({ eleve, onOpen, secondary }) {
  const { t } = useI18n()
  const content = (
    <>
      <Avatar person={eleve} />
      <span><strong>{eleve.prenom} {eleve.nom}</strong><small>{secondary ?? <bdi>{eleve.matricule}</bdi>}</small></span>
    </>
  )
  if (!onOpen) return <div className="db-person">{content}</div>
  return <button type="button" className="db-person db-person-link" onClick={() => onOpen(eleve)} aria-label={t('details.openFor', { name: `${eleve.prenom} ${eleve.nom}` })}>{content}</button>
}

/** Classement d'un groupe d'élèves (une classe ou toutes) : rang, élève, composantes, score. */
function RankingTable({ rows, rankKey, caption, showClass, onOpenEleve }) {
  const { t } = useI18n()
  return (
    <div className="db-table-scroll">
      <table className="edm-table">
        <caption className="db-sr-only">{caption}</caption>
        <thead>
          <tr>
            <th>{t('edm.rank')}</th>
            <th>{t('dash.table.student')}</th>
            <th>{t('edm.exemplarite')} <small>50 %</small></th>
            <th>{t('edm.objectifs')} <small>30 %</small></th>
            <th>{t('edm.recitation')} <small>20 %</small></th>
            <th>{t('edm.total')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.eleve.id} className={row[rankKey] === 1 ? 'edm-row--first' : ''}>
              <td data-label={t('edm.rank')}><span className={`edm-rank ${row[rankKey] <= 3 ? `edm-rank--${row[rankKey]}` : ''}`}>{row[rankKey]}</span></td>
              <td data-label={t('dash.table.student')}><StudentButton eleve={row.eleve} onOpen={onOpenEleve} secondary={showClass ? row.eleve.classe : undefined} /></td>
              <td data-label={t('edm.exemplarite')}><ScoreBar value={row.exemplarite_sur_100} label={t('edm.exemplarite')} /></td>
              <td data-label={t('edm.objectifs')}><ScoreBar value={row.objectifs_sur_100} label={t('edm.objectifs')} /></td>
              <td data-label={t('edm.recitation')}><ScoreBar value={row.recitation_sur_100} label={t('edm.recitation')} /></td>
              <td data-label={t('edm.total')}><strong className="edm-total">{row.score_total}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Élève du mois (Admin) :
 *  - le meilleur des meilleurs (premier de toutes les classes) et la classe exemplaire (meilleure moyenne) ;
 *  - par classe : moyennes des scores, premier de la classe et classement interne ;
 *  - classement général et élèves évalués mais pas encore classables.
 * Score = 50 % exemplarité + 30 % objectifs (fiches validées) + 20 % récitation.
 *
 * @param {{ refreshKey: number, onSessionExpired: () => void, onOpenEleve?: (eleve: object) => void,
 *           onOpenClasse?: (classe: object) => void }} props
 */
export default function EleveDuMoisSection({ refreshKey, onSessionExpired, onOpenEleve, onOpenClasse }) {
  const { t, serverMessage } = useI18n()
  const { monthLabel } = usePaymentFormat()
  const [mois, setMois] = useState(moisCourant)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  // Affichage : par classe (défaut) ou classement général
  const [view, setView] = useState('classes')

  useEffect(() => {
    let cancelled = false
    getEleveDuMois(mois)
      .then(response => { if (!cancelled) { setData(response); setError(null) } })
      .catch(err => {
        if (cancelled) return
        if (err.status === 401) { onSessionExpired(); return }
        setError({ message: err.message, status: err.status })
      })
    return () => { cancelled = true }
  }, [mois, reload, refreshKey, onSessionExpired])

  function goTo(offset) {
    setData(null)
    setMois(current => decalerMois(current, offset))
  }

  const winner = data?.gagnant
  const best = data?.classe_exemplaire
  const loaded = data?.mois === mois
  const classes = (data?.classes ?? []).filter(group => group.classe)

  return (
    <div className="ped">
      <div className="pay-month ped-week-nav" role="group" aria-label={t('pay.month')}>
        <button type="button" className="db-icon-button" aria-label={t('pay.previousMonth')} onClick={() => goTo(-1)}>
          <span className="db-flip-rtl"><Icon name="chevronLeft" /></span>
        </button>
        <strong className="ped-month-label">{monthLabel(mois)}</strong>
        <button type="button" className="db-icon-button" aria-label={t('pay.nextMonth')} onClick={() => goTo(1)} disabled={mois >= moisCourant()}>
          <span className="db-flip-rtl"><Icon name="chevronRight" /></span>
        </button>
      </div>

      {error && (
        <div className="db-alert db-alert--error" role="alert">
          <span>{error.status ? serverMessage(error.message, error.status) : error.message}</span>
          <button type="button" className="db-button db-button--secondary" onClick={() => setReload(r => r + 1)}>{t('dash.retry')}</button>
        </div>
      )}

      {!loaded && !error && <div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loadingData')}</div>}

      {loaded && (winner || best) && (
        <div className="edm-highlights">
          {/* ---------- Meilleur des meilleurs ---------- */}
          {winner && (
            <section className="edm-winner" aria-labelledby="edm-winner-title">
              <div className="edm-winner-head">
                <span className="edm-ribbon"><Icon name="trophy" size={16} />{t('edm.bestOfBest')}</span>
                <span className="edm-score"><strong>{winner.score_total}</strong><span>{t('edm.outOf100')}</span></span>
              </div>
              <div className="edm-winner-person">
                <Avatar person={winner.eleve} className="db-avatar--large" />
                <div>
                  <p>{t('edm.winnerOf', { month: monthLabel(mois) })}</p>
                  <h2 id="edm-winner-title">{winner.eleve.prenom} {winner.eleve.nom}</h2>
                  <p>{winner.eleve.classe ?? ''}</p>
                </div>
              </div>
              <Components row={winner} />
              {onOpenEleve && (
                <button type="button" className="db-button db-button--secondary db-button--small" onClick={() => onOpenEleve(winner.eleve)}>
                  <Icon name="eye" size={15} />{t('edm.openStudent')}
                </button>
              )}
            </section>
          )}

          {/* ---------- Classe exemplaire ---------- */}
          {best && (
            <section className="edm-best-class" aria-labelledby="edm-best-class-title">
              <div className="edm-winner-head">
                <span className="edm-ribbon edm-ribbon--green"><Icon name="star" size={16} />{t('edm.bestClass')}</span>
                <span className="edm-score"><strong>{best.moyenne_score}</strong><span>{t('edm.average')}</span></span>
              </div>
              <h2 id="edm-best-class-title">{best.classe.nom}</h2>
              <p>{[best.classe.niveau, best.classe.oustaz].filter(Boolean).join(' · ')}</p>
              <p className="edm-best-meta">{t('edm.rankedCount', { ranked: best.classes, evaluated: best.evalues })}</p>
              <Components row={{ exemplarite_sur_100: best.moyenne_exemplarite, objectifs_sur_100: best.moyenne_objectifs, recitation_sur_100: best.moyenne_recitation }} />
              {onOpenClasse && (
                <button type="button" className="db-button db-button--small" onClick={() => onOpenClasse(best.classe)}>
                  <Icon name="book" size={15} />{t('edm.openClass')}
                </button>
              )}
            </section>
          )}
        </div>
      )}

      {loaded && (
        <section className="db-panel" aria-labelledby="edm-ranking-title">
          <div className="db-panel-heading">
            <div>
              <h2 id="edm-ranking-title">{t('edm.ranking')}</h2>
              <p>{t('edm.formula')}</p>
            </div>
            <div className="db-segmented" role="tablist" aria-label={t('edm.viewLabel')}>
              {['classes', 'general'].map(key => (
                <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? 'is-active' : ''} onClick={() => setView(key)}>
                  {t(`edm.views.${key}`)}
                </button>
              ))}
            </div>
          </div>

          {data.classement.length === 0 ? (
            <Empty icon="shield" title={t('edm.emptyTitle')} text={t('edm.emptyText')} />
          ) : view === 'general' ? (
            <RankingTable rows={data.classement} rankKey="rang" caption={t('edm.ranking')} showClass onOpenEleve={onOpenEleve} />
          ) : (
            <div className="edm-classes">
              {classes.map(group => (
                <article key={group.classe.id} className={`edm-class ${group.rang === 1 ? 'edm-class--best' : ''}`} aria-labelledby={`edm-class-${group.classe.id}`}>
                  <header>
                    <span className={`edm-rank ${group.rang && group.rang <= 3 ? `edm-rank--${group.rang}` : ''}`} title={t('edm.classRank')}>{group.rang ?? '—'}</span>
                    <div>
                      <h3 id={`edm-class-${group.classe.id}`}>{group.classe.nom}</h3>
                      <p>{[group.classe.niveau, group.classe.oustaz].filter(Boolean).join(' · ')} · {t('edm.rankedCount', { ranked: group.classes, evaluated: group.evalues })}</p>
                    </div>
                    <div className="edm-class-average">
                      <span>{t('edm.average')}</span>
                      <ScoreBar value={group.moyenne_score} label={t('edm.average')} size="large" showLevel />
                    </div>
                    {onOpenClasse && (
                      <button type="button" className="db-button db-button--secondary db-button--small" onClick={() => onOpenClasse(group.classe)} aria-label={t('edm.openClassFor', { name: group.classe.nom })}>
                        <Icon name="eye" size={15} />{t('edm.openClass')}
                      </button>
                    )}
                  </header>
                  {group.meilleur ? (
                    <>
                      <p className="edm-class-best">
                        <Icon name="star" size={15} />{t('edm.classWinner')} <strong>{group.meilleur.eleve.prenom} {group.meilleur.eleve.nom}</strong> · {group.meilleur.score_total}
                      </p>
                      <RankingTable rows={group.classement} rankKey="rang_classe" caption={t('edm.classRanking', { name: group.classe.nom })} onOpenEleve={onOpenEleve} />
                    </>
                  ) : (
                    <p className="db-form-note">{t('edm.classNoRanked')}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Évalués mais pas encore classables : on dit ce qui manque */}
      {loaded && data.non_classes.length > 0 && (
        <section className="db-panel" aria-labelledby="edm-unranked-title">
          <div className="db-panel-heading">
            <div>
              <h2 id="edm-unranked-title">{t('edm.unranked')}</h2>
              <p>{t('edm.unrankedText')}</p>
            </div>
          </div>
          <ul className="detail-list">
            {data.non_classes.map(row => (
              <li key={row.eleve.id}>
                <StudentButton eleve={row.eleve} onOpen={onOpenEleve} secondary={row.eleve.classe ?? ''} />
                <span>{row.manque.map(key => <span key={key} className="db-badge db-badge--attention"><span className="db-badge-dot" />{t(`edm.missing.${key}`)}</span>)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
