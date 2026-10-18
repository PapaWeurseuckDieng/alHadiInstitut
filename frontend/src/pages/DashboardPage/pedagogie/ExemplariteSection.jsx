import { useEffect, useState } from 'react'
import Avatar from '../../../components/Avatar'
import { useDialogs } from '../../../components/Dialogs/dialogsContext'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { getExemplarite, saveExemplarite } from '../../../services/pedagogieService'
import { decalerMois, moisCourant } from '../../../utils/semaine'
import { usePaymentFormat } from '../paiements/usePaymentFormat'
import { Empty } from './AppelSection'
import ScoreBar from './ScoreBar'

const NOTES = [0, 1, 2, 3, 4]

/**
 * Exemplarité mensuelle d'une classe : 5 critères notés de 0 à 4 pour chaque élève.
 * Les évaluations déjà saisies pour le mois sont rechargées ; seules les lignes modifiées sont envoyées.
 * Lecture facilitée : notes colorées (0 rouge → 4 vert), total sur 20 et barre sur 100,
 * score du mois de l'élève et moyenne de la classe pour chaque critère.
 *
 * @param {{ classe: object, onNotice: (message: string) => void, onSessionExpired: () => void }} props
 */
export default function ExemplariteSection({ classe, onNotice, onSessionExpired }) {
  const { t, serverMessage } = useI18n()
  const { confirm } = useDialogs()
  const { monthLabel } = usePaymentFormat()
  const [mois, setMois] = useState(moisCourant)
  const [data, setData] = useState(null)
  // Notes saisies : { [eleve_id]: { critere: note } } et lignes modifiées
  const [notes, setNotes] = useState({})
  const [dirty, setDirty] = useState([])
  const [rowErrors, setRowErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    getExemplarite(classe.id, mois)
      .then(response => {
        if (cancelled) return
        setData(response)
        setNotes(Object.fromEntries(response.eleves.map(e => [e.eleve_id, e.evaluation ?? {}])))
        setDirty([])
        setRowErrors({})
        setError(null)
      })
      .catch(err => {
        if (cancelled) return
        if (err.status === 401) { onSessionExpired(); return }
        setError({ message: err.message, status: err.status })
      })
    return () => { cancelled = true }
  }, [classe.id, mois, reload, onSessionExpired])

  async function changeMonth(offset) {
    if (dirty.length && !(await confirm({ title: t('ped.exemplarite.unsavedTitle'), message: t('ped.exemplarite.unsavedConfirm'), confirmLabel: t('ped.exemplarite.leave'), tone: 'warning' }))) return
    setData(null)
    setMois(current => decalerMois(current, offset))
  }

  function setNote(eleveId, critere, value) {
    setNotes(previous => ({ ...previous, [eleveId]: { ...previous[eleveId], [critere]: value === '' ? undefined : Number(value) } }))
    setDirty(previous => (previous.includes(eleveId) ? previous : [...previous, eleveId]))
    setRowErrors(previous => ({ ...previous, [eleveId]: undefined }))
  }

  /** Envoie les lignes modifiées, une par une ; les lignes incomplètes sont signalées. */
  async function save() {
    const criteres = data.criteres
    const incomplete = dirty.filter(id => criteres.some(c => notes[id]?.[c] === undefined))
    if (incomplete.length) {
      setRowErrors(Object.fromEntries(incomplete.map(id => [id, t('ped.exemplarite.incomplete')])))
      return
    }
    setSaving(true)
    setError(null)
    const failed = {}
    for (const eleveId of dirty) {
      try {
        await saveExemplarite(eleveId, { mois, ...notes[eleveId] })
      } catch (err) {
        if (err.status === 401) { onSessionExpired(); return }
        failed[eleveId] = serverMessage(Object.values(err.errors || {})[0]?.[0] || err.message, err.status || 0, { fallback: 'original' })
      }
    }
    setSaving(false)
    const saved = dirty.length - Object.keys(failed).length
    if (saved) onNotice(t('ped.exemplarite.saved', { count: saved, month: monthLabel(mois) }))
    if (Object.keys(failed).length) { setRowErrors(failed); setDirty(Object.keys(failed).map(Number)) }
    else setReload(r => r + 1) // recharge les scores recalculés
  }

  const total = id => data.criteres.reduce((sum, c) => sum + (notes[id]?.[c] ?? 0), 0)
  const complete = id => data.criteres.every(c => notes[id]?.[c] !== undefined)
  // Moyenne de la classe (élèves complètement notés) : par critère sur 4, et exemplarité sur 100
  const noted = data ? data.eleves.filter(e => complete(e.eleve_id)) : []
  const average = critere => (noted.length ? (noted.reduce((sum, e) => sum + notes[e.eleve_id][critere], 0) / noted.length).toFixed(1) : '—')
  const averageScore = noted.length ? noted.reduce((sum, e) => sum + total(e.eleve_id), 0) / noted.length / 20 * 100 : null

  let body
  if (!data) body = error ? null : <div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loadingData')}</div>
  else if (!data.eleves.length) body = <Empty icon="users" title={t('ped.appel.noStudent')} text={t('ped.appel.noStudentText')} />
  else {
    body = (
      <>
        {/* Échelle des notes, avec la même couleur que dans le tableau */}
        <ul className="ped-scale" aria-label={t('ped.exemplarite.scale')}>
          {NOTES.map(n => <li key={n} data-note={n}>{t(`ped.fiche.grades.${n}`)}</li>)}
        </ul>
        <div className="db-table-scroll">
          <table className="ped-exemplarite">
            <caption className="db-sr-only">{t('ped.exemplarite.caption', { month: monthLabel(mois) })}</caption>
            <thead>
              <tr>
                <th>{t('dash.table.student')}</th>
                {data.criteres.map(c => <th key={c}>{t(`ped.exemplarite.criteria.${c}`)}</th>)}
                <th>{t('ped.exemplarite.score')}</th>
              </tr>
            </thead>
            <tbody>
              {data.eleves.map(eleve => (
                <tr key={eleve.eleve_id} className={dirty.includes(eleve.eleve_id) ? 'ped-row--dirty' : ''}>
                  <td data-label={t('dash.table.student')}>
                    <div className="db-person">
                      <Avatar person={eleve} />
                      <span>
                        <strong>{eleve.prenom} {eleve.nom}</strong>
                        {rowErrors[eleve.eleve_id] && <small className="db-field-error">{rowErrors[eleve.eleve_id]}</small>}
                      </span>
                    </div>
                  </td>
                  {data.criteres.map(c => (
                    <td key={c} data-label={t(`ped.exemplarite.criteria.${c}`)}>
                      <select
                        className="ped-note-select"
                        data-note={notes[eleve.eleve_id]?.[c] ?? ''}
                        aria-label={t('ped.exemplarite.noteFor', { criterion: t(`ped.exemplarite.criteria.${c}`), name: `${eleve.prenom} ${eleve.nom}` })}
                        value={notes[eleve.eleve_id]?.[c] ?? ''}
                        onChange={event => setNote(eleve.eleve_id, c, event.target.value)}
                      >
                        <option value="">—</option>
                        {NOTES.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                  ))}
                  <td data-label={t('ped.exemplarite.score')}>
                    {complete(eleve.eleve_id) ? (
                      <span className="ped-score-cell">
                        <ScoreBar value={(total(eleve.eleve_id) / 20) * 100} label={t('ped.exemplarite.score')} showLevel />
                        <small>{t('ped.exemplarite.outOf20', { total: total(eleve.eleve_id) })}</small>
                        {eleve.score?.score_total !== null && eleve.score?.score_total !== undefined && !dirty.includes(eleve.eleve_id) && (
                          <small className="ped-score-total">{t('ped.exemplarite.monthScore', { score: eleve.score.score_total })}</small>
                        )}
                      </span>
                    ) : <span className="db-muted-text">{t('ped.exemplarite.notRated')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            {noted.length > 0 && (
              <tfoot>
                <tr>
                  <td data-label={t('dash.table.student')}>{t('ped.exemplarite.classAverage', { count: noted.length })}</td>
                  {data.criteres.map(c => <td key={c} data-label={t(`ped.exemplarite.criteria.${c}`)}>{average(c)} / 4</td>)}
                  <td data-label={t('ped.exemplarite.score')}><ScoreBar value={averageScore} label={t('ped.exemplarite.classAverage', { count: noted.length })} /></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="ped-footer">
          <p className="db-form-note">{t('ped.exemplarite.legend')}</p>
          <button type="button" className="db-button" onClick={save} disabled={saving || !dirty.length}>
            <Icon name="check" size={17} />{saving ? t('form.saving') : t('ped.exemplarite.save', { count: dirty.length })}
          </button>
        </div>
      </>
    )
  }

  return (
    <section className="db-panel" aria-labelledby="ped-exemplarite-title">
      <div className="db-panel-heading">
        <div>
          <h2 id="ped-exemplarite-title">{t('ped.exemplarite.title')}</h2>
          <p>{t('ped.exemplarite.text')}</p>
        </div>
      </div>

      <div className="pay-month ped-week-nav" role="group" aria-label={t('pay.month')}>
        <button type="button" className="db-icon-button" aria-label={t('pay.previousMonth')} onClick={() => changeMonth(-1)}>
          <span className="db-flip-rtl"><Icon name="chevronLeft" /></span>
        </button>
        <strong className="ped-month-label">{monthLabel(mois)}</strong>
        <button type="button" className="db-icon-button" aria-label={t('pay.nextMonth')} onClick={() => changeMonth(1)} disabled={mois >= moisCourant()}>
          <span className="db-flip-rtl"><Icon name="chevronRight" /></span>
        </button>
      </div>

      {error && (
        <div className="db-alert db-alert--error" role="alert">
          <span>{error.status ? serverMessage(error.message, error.status) : error.message}</span>
          <button type="button" className="db-button db-button--secondary" onClick={() => setReload(r => r + 1)}>{t('dash.retry')}</button>
        </div>
      )}

      {body}
    </section>
  )
}
