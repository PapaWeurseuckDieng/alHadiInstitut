import { useEffect, useState } from 'react'
import ActionMenu from '../../../components/ActionMenu/ActionMenu'
import Avatar from '../../../components/Avatar'
import { useDialogs } from '../../../components/Dialogs/dialogsContext'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { annulerDiplome, getDiplomes } from '../../../services/diplomesService'
import DiplomeDialog from './DiplomeDialog'
import '../paiements/Paiements.css'
import './Diplomes.css'

const STATUS_TABS = ['', 'delivre', 'annule']

/**
 * Rubrique « Diplômes » (Admin, onglet de Pédagogie) : indicateurs, liste filtrable,
 * délivrance (recherche de l'élève), correction, annulation motivée et impression.
 *
 * @param {{ refreshKey: number, onNotice: (message: string) => void, onSessionExpired: () => void,
 *           onOpenEleve?: (eleve: object) => void }} props
 */
export default function DiplomesSection({ refreshKey, onNotice, onSessionExpired, onOpenEleve }) {
  const { t, formatDate, serverMessage } = useI18n()
  const { confirm, alert } = useDialogs()
  const [statut, setStatut] = useState('')
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Fenêtre : délivrance ({}) ou correction (diplôme)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    let cancelled = false
    getDiplomes({ q: search, statut, page })
      .then(response => { if (!cancelled) { setData(response); setError(null); setLoading(false) } })
      .catch(err => {
        if (cancelled) return
        if (err.status === 401) { onSessionExpired(); return }
        setError({ message: err.message, status: err.status })
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [search, statut, page, reload, refreshKey, onSessionExpired])

  function filter(setter, value) { setter(value); if (setter !== setPage) setPage(1); setLoading(true) }
  function refresh() { setLoading(true); setReload(r => r + 1) }

  /** Annulation d'un diplôme : fenêtre de confirmation avec motif obligatoire. */
  async function cancel(diplome) {
    const motif = await confirm({
      title: t('dip.cancelTitle', { numero: diplome.numero }),
      message: t('dip.cancelText', { name: `${diplome.eleve.prenom} ${diplome.eleve.nom}` }),
      confirmLabel: t('dip.cancel'),
      tone: 'danger',
      input: { label: t('dip.cancelReason'), required: true, minLength: 3, placeholder: t('dip.cancelPlaceholder') },
    })
    if (motif === false) return
    try {
      const response = await annulerDiplome(diplome.id, motif)
      onNotice(serverMessage(response.message, 200, { fallback: 'original' }))
      refresh()
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      await alert({ title: t('dialogs.failed'), message: serverMessage(Object.values(err.errors || {})[0]?.[0] || err.message, err.status || 0, { fallback: 'original' }), tone: 'danger' })
    }
  }

  const stats = data?.stats
  const date = value => formatDate(`${value}T12:00:00`, { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="pay dip-section">
      <div className="pay-toolbar">
        <p className="db-form-note">{t('dip.intro')}</p>
        <div className="pay-actions">
          <button type="button" className="db-button" onClick={() => setEditing({})}>
            <Icon name="award" size={17} />{t('dip.deliver')}
          </button>
        </div>
      </div>

      {error && (
        <div className="db-alert db-alert--error" role="alert">
          <span>{error.status ? serverMessage(error.message, error.status) : error.message}</span>
          <button type="button" className="db-button db-button--secondary" onClick={refresh}>{t('dash.retry')}</button>
        </div>
      )}

      <section className="pay-stats" aria-label={t('dip.stats.aria')}>
        {stats ? (
          <>
            <div className="pay-stat pay-stat--green">
              <span className="pay-stat-label">{t('dip.stats.delivered')}</span>
              <strong>{stats.delivres}</strong>
              <span className="pay-stat-hint">{t('dip.stats.deliveredHint')}</span>
            </div>
            <div className="pay-stat">
              <span className="pay-stat-label">{t('dip.stats.thisYear')}</span>
              <strong>{stats.annee_courante}</strong>
              <span className="pay-stat-hint">{t('dip.stats.thisYearHint')}</span>
            </div>
            <div className="pay-stat">
              <span className="pay-stat-label">{t('dip.stats.cancelled')}</span>
              <strong>{stats.annules}</strong>
              <span className="pay-stat-hint">{t('dip.stats.cancelledHint')}</span>
            </div>
          </>
        ) : Array.from({ length: 3 }, (_, i) => <div key={i} className="pay-stat db-skeleton" />)}
      </section>

      <section className="db-panel db-records" aria-busy={loading}>
        <div className="pay-filters">
          <div className="pay-tabs" role="group" aria-label={t('dash.table.status')}>
            {STATUS_TABS.map(value => (
              <button key={value || 'tous'} type="button" className={`pay-tab ${statut === value ? 'pay-tab--active' : ''}`} aria-pressed={statut === value} onClick={() => filter(setStatut, value)}>
                {value ? t(`dip.status.${value}`) : t('dep.filters.all')}
              </button>
            ))}
          </div>
          <form className="db-search" role="search" onSubmit={event => { event.preventDefault(); filter(setSearch, draft.trim()) }}>
            <Icon name="search" size={18} />
            <input aria-label={t('dip.searchLabel')} placeholder={t('dip.searchPlaceholder')} maxLength={120} value={draft} onChange={event => setDraft(event.target.value)} />
            {search && (
              <button type="button" className="db-search-clear" aria-label={t('dash.search.clear')} onClick={() => { setDraft(''); filter(setSearch, '') }}>
                <Icon name="close" size={16} />
              </button>
            )}
            <button type="submit" className="db-search-submit">{t('dash.search.submit')}</button>
          </form>
        </div>

        {loading && !data ? (
          <div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loadingData')}</div>
        ) : data?.items.length ? (
          <>
            <div className={`db-table-scroll ${loading ? 'pay-dimmed' : ''}`}>
              <table>
                <caption className="db-sr-only">{t('dip.title')}</caption>
                <thead>
                  <tr>
                    <th>{t('dash.table.student')}</th>
                    <th>{t('dip.fields.intitule')}</th>
                    <th>{t('dip.fields.date')}</th>
                    <th>{t('dip.fields.mention')}</th>
                    <th>{t('dash.table.status')}</th>
                    <th>{t('dash.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(diplome => {
                    const name = `${diplome.eleve.prenom} ${diplome.eleve.nom}`
                    return (
                      <tr key={diplome.id} className={diplome.annule ? 'dip-row--cancelled' : ''}>
                        <td data-label={t('dash.table.student')}>
                          <button type="button" className="db-person db-person-link" onClick={() => onOpenEleve?.(diplome.eleve)} aria-label={t('details.openFor', { name })}>
                            <Avatar person={diplome.eleve} />
                            <span><strong>{name}</strong><small><bdi>{diplome.eleve.matricule}</bdi></small></span>
                          </button>
                        </td>
                        <td data-label={t('dip.fields.intitule')}>
                          <div>
                            <span className="db-strong">{diplome.intitule}</span>
                            <small className="dep-description"><bdi>{diplome.numero}</bdi>{diplome.classe ? ` · ${diplome.classe}` : ''}</small>
                          </div>
                        </td>
                        <td data-label={t('dip.fields.date')} className="db-nowrap">{date(diplome.date_obtention)}</td>
                        <td data-label={t('dip.fields.mention')}>{diplome.mention ? <span className="dip-mention">{t(`dip.mentions.${diplome.mention}`)}</span> : <span className="db-muted-text">—</span>}</td>
                        <td data-label={t('dash.table.status')}>
                          <span className={`db-badge ${diplome.annule ? 'db-badge--neutral' : 'db-badge--success'}`}><span className="db-badge-dot" />{t(`dip.status.${diplome.annule ? 'annule' : 'delivre'}`)}</span>
                        </td>
                        <td data-label={t('dash.table.actions')}>
                          <ActionMenu
                            label={t('actions.for', { name: `${diplome.numero} · ${name}` })}
                            items={[
                              { key: 'print', label: t('dip.print'), icon: 'printer', onSelect: () => window.open(`/diplomes/${diplome.id}`, '_blank', 'noopener') },
                              { key: 'student', label: t('actions.openStudent'), icon: 'eye', hidden: !onOpenEleve, onSelect: () => onOpenEleve(diplome.eleve) },
                              { key: 'edit', label: t('details.edit'), icon: 'pencil', hidden: diplome.annule, onSelect: () => setEditing(diplome) },
                              { key: 'cancel', label: t('dip.cancel'), icon: 'close', danger: true, hidden: diplome.annule, onSelect: () => cancel(diplome) },
                            ]}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="db-pagination">
              <span>{t('dip.count', { total: data.pagination.total, page: data.pagination.page, last: data.pagination.last_page })}</span>
              <div>
                <button type="button" className="db-button db-button--secondary" disabled={page <= 1 || loading} onClick={() => filter(setPage, page - 1)}>{t('dash.pagination.previous')}</button>
                <button type="button" className="db-button db-button--secondary" disabled={page >= data.pagination.last_page || loading} onClick={() => filter(setPage, page + 1)}>{t('dash.pagination.next')}</button>
              </div>
            </div>
          </>
        ) : (
          <div className="db-empty">
            <span className="db-empty-icon"><Icon name="award" size={24} /></span>
            <h3>{t('dip.emptyTitle')}</h3>
            <p>{statut || search ? t('dip.emptyFiltered') : t('dip.emptyText')}</p>
          </div>
        )}
      </section>

      {editing && (
        <DiplomeDialog
          diplome={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={message => { setEditing(null); onNotice(message); refresh() }}
          onSessionExpired={onSessionExpired}
        />
      )}
    </div>
  )
}
