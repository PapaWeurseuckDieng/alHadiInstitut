import { useCallback, useEffect, useState } from 'react'
import ActionMenu from '../../../components/ActionMenu/ActionMenu'
import { useDialogs } from '../../../components/Dialogs/dialogsContext'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { getDepenses, validerDepense } from '../../../services/depensesService'
import { usePaymentFormat } from '../paiements/usePaymentFormat'
import DepenseForm from './DepenseForm'
import RejectDialog from './RejectDialog'
import '../paiements/Paiements.css'
import './Depenses.css'

// Onglets de statut (vide = toutes)
const STATUS_TABS = ['', 'en_attente', 'validee', 'rejetee']

/** Année scolaire d'un mois : « 2027-03 » → « 2026-2027 » (bascule au 1er octobre). */
function anneeDuMois(mois) {
  const annee = Number(mois.slice(0, 4))
  return Number(mois.slice(5, 7)) >= 10 ? `${annee}-${annee + 1}` : `${annee - 1}-${annee}`
}

/** Les 12 mois d'une année scolaire « 2026-2027 » : octobre 2026 → septembre 2027. */
function moisDeLAnnee(annee) {
  const debut = Number(annee.slice(0, 4))
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(debut, 9 + index, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })
}

/**
 * Rubrique « Dépenses » (administrateur) : période (mois ou année scolaire), recettes, dépenses
 * validées, solde, répartition par catégorie, liste filtrable, saisie, correction, validation et rejet.
 *
 * @param {{ refreshKey: number, onNotice: (message: string) => void, onSessionExpired: () => void }} props
 */
export default function DepensesSection({ refreshKey, onNotice, onSessionExpired }) {
  const { t, formatDate, serverMessage } = useI18n()
  const { confirm } = useDialogs()
  const { amount, monthLabel } = usePaymentFormat()

  // Filtres : mois vide = toute l'année scolaire courante
  const [mois, setMois] = useState('')
  const [statut, setStatut] = useState('')
  const [categorie, setCategorie] = useState('')
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Fenêtres : saisie/correction (null = fermée, {} = nouvelle dépense), rejet
  const [editing, setEditing] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [validatingId, setValidatingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    getDepenses({ mois, statut, categorie, q: search, page })
      .then(response => {
        if (cancelled) return
        setData(response)
        setError(null)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        if (err.status === 401) { onSessionExpired(); return }
        setError({ message: err.message, status: err.status })
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [mois, statut, categorie, search, page, reload, refreshKey, onSessionExpired])

  const refresh = useCallback(() => { setLoading(true); setReload(r => r + 1) }, [])

  /** Change un filtre et revient à la première page. */
  function filter(setter, value) { setter(value); setPage(1); setLoading(true) }

  async function validate(depense) {
    const ok = await confirm({
      title: t('dep.validate.confirmTitle'),
      message: t('dep.validate.confirm', { amount: amount(depense.montant), category: t(`dep.categories.${depense.categorie}`) }),
      confirmLabel: t('dep.validate.button'),
      tone: 'warning',
    })
    if (!ok) return
    setValidatingId(depense.id)
    try {
      const response = await validerDepense(depense.id)
      onNotice(serverMessage(response.message, 200, { fallback: 'original' }))
      refresh()
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      setError({ message: err.message, status: err.status })
    } finally {
      setValidatingId(null)
    }
  }

  const stats = data?.stats
  // Année scolaire affichée, déduite de la période renvoyée par le serveur
  const annee = !data ? '' : data.periode.type === 'annee_scolaire' ? data.periode.valeur : anneeDuMois(data.periode.valeur)
  const months = annee ? moisDeLAnnee(annee) : []
  const periodLabel = mois ? monthLabel(mois) : t('dep.period.year', { year: annee })
  const maxCategory = Math.max(1, ...(stats?.par_categorie ?? []).map(ligne => ligne.total))

  return (
    <div className="pay dep">
      {/* ---------- Période + nouvelle dépense ---------- */}
      <div className="pay-toolbar">
        <div className="pay-month">
          <label className="db-sr-only" htmlFor="dep-period">{t('dep.period.label')}</label>
          <select id="dep-period" value={mois} onChange={event => filter(setMois, event.target.value)} disabled={!data}>
            <option value="">{t('dep.period.year', { year: annee })}</option>
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
        <div className="pay-actions">
          <button type="button" className="db-button" onClick={() => setEditing({})} disabled={!data}>
            <Icon name="plus" size={17} />{t('dep.create')}
          </button>
        </div>
      </div>

      {error && (
        <div className="db-alert db-alert--error" role="alert">
          <span>{error.status ? serverMessage(error.message, error.status) : error.message}</span>
          <button type="button" className="db-button db-button--secondary" onClick={refresh}>{t('dash.retry')}</button>
        </div>
      )}

      {/* ---------- Indicateurs de la période ---------- */}
      <section className="pay-stats" aria-label={t('dep.stats.aria')}>
        {stats ? (
          <>
            <div className="pay-stat pay-stat--green">
              <span className="pay-stat-label">{t('dep.stats.income')}</span>
              <strong>{amount(stats.recettes.total)}</strong>
              <span className="pay-stat-hint">{t('dep.stats.incomeDetail', { monthly: amount(stats.recettes.mensualites), fees: amount(stats.recettes.frais_inscription) })}</span>
            </div>
            <div className="pay-stat">
              <span className="pay-stat-label">{t('dep.stats.expenses')}</span>
              <strong>{amount(stats.total_valide)}</strong>
              <span className="pay-stat-hint">{periodLabel}</span>
            </div>
            <div className={`pay-stat ${stats.solde < 0 ? 'dep-stat--negative' : 'pay-stat--green'}`}>
              <span className="pay-stat-label">{t('dep.stats.balance')}</span>
              <strong>{amount(stats.solde)}</strong>
              <span className="pay-stat-hint">{t('dep.stats.balanceHint')}</span>
            </div>
            <div className={`pay-stat ${stats.nombre_en_attente > 0 ? 'pay-stat--attention' : ''}`}>
              <span className="pay-stat-label">{t('dep.stats.pending')}</span>
              <strong>{amount(stats.total_en_attente)}</strong>
              <span className="pay-stat-hint">{t('dep.stats.pendingCount', { count: stats.nombre_en_attente })}</span>
            </div>
          </>
        ) : Array.from({ length: 4 }, (_, i) => <div key={i} className="pay-stat db-skeleton" />)}
      </section>

      {/* ---------- Répartition des dépenses validées par catégorie ---------- */}
      {stats?.par_categorie.length > 0 && (
        <section className="db-panel dep-breakdown" aria-labelledby="dep-breakdown-title">
          <h2 id="dep-breakdown-title">{t('dep.breakdown.title')}</h2>
          <ul>
            {stats.par_categorie.map(ligne => (
              <li key={ligne.categorie}>
                <span className="dep-breakdown-name">{t(`dep.categories.${ligne.categorie}`)}</span>
                <span className="dep-breakdown-bar" aria-hidden="true"><span style={{ width: `${(ligne.total / maxCategory) * 100}%` }} /></span>
                <strong className="db-nowrap">{amount(ligne.total)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- Liste ---------- */}
      <section className="db-panel db-records" aria-busy={loading}>
        <div className="pay-filters">
          <div className="pay-tabs" role="group" aria-label={t('dep.table.status')}>
            {STATUS_TABS.map(value => (
              <button
                key={value || 'toutes'}
                type="button"
                className={`pay-tab ${statut === value ? 'pay-tab--active' : ''}`}
                aria-pressed={statut === value}
                onClick={() => filter(setStatut, value)}
              >
                {value ? t(`dep.status.${value}`) : t('dep.filters.all')}
              </button>
            ))}
          </div>

          <div className="pay-filter-fields">
            <label className="db-sr-only" htmlFor="dep-category">{t('dep.form.category')}</label>
            <select id="dep-category" className="pay-select" value={categorie} onChange={event => filter(setCategorie, event.target.value)}>
              <option value="">{t('dep.filters.allCategories')}</option>
              {data?.categories.map(value => <option key={value} value={value}>{t(`dep.categories.${value}`)}</option>)}
            </select>
            <form className="db-search" role="search" onSubmit={event => { event.preventDefault(); filter(setSearch, draft.trim()) }}>
              <Icon name="search" size={18} />
              <input aria-label={t('dep.filters.searchLabel')} placeholder={t('dep.filters.placeholder')} maxLength={120} value={draft} onChange={event => setDraft(event.target.value)} />
              {search && (
                <button type="button" className="db-search-clear" aria-label={t('dash.search.clear')} onClick={() => { setDraft(''); filter(setSearch, '') }}>
                  <Icon name="close" size={16} />
                </button>
              )}
              <button type="submit" className="db-search-submit">{t('dash.search.submit')}</button>
            </form>
          </div>
        </div>

        {loading && !data ? (
          <div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loadingData')}</div>
        ) : data?.items.length ? (
          <>
            <div className={`db-table-scroll ${loading ? 'pay-dimmed' : ''}`}>
              <table>
                <caption className="db-sr-only">{t('dep.table.caption')}</caption>
                <thead>
                  <tr>
                    <th>{t('dep.table.date')}</th>
                    <th>{t('dep.table.category')}</th>
                    <th>{t('dep.table.beneficiary')}</th>
                    <th>{t('dep.table.amount')}</th>
                    <th>{t('dep.table.status')}</th>
                    <th>{t('dep.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(depense => (
                    <tr key={depense.id}>
                      <td data-label={t('dep.table.date')} className="db-nowrap">{formatDate(`${depense.date_depense}T12:00:00`, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td data-label={t('dep.table.category')}>
                        <div>
                          <span className="db-strong">{t(`dep.categories.${depense.categorie}`)}</span>
                          {depense.description && <small className="dep-description">{depense.description}</small>}
                        </div>
                      </td>
                      <td data-label={t('dep.table.beneficiary')}>
                        <div>
                          <span>{depense.beneficiaire || <span className="db-muted-text">—</span>}</span>
                          {depense.mode_paiement && <small className="dep-description">{t(`pay.modes.${depense.mode_paiement}`)}</small>}
                        </div>
                      </td>
                      <td data-label={t('dep.table.amount')} className="db-nowrap"><strong>{amount(depense.montant)}</strong></td>
                      <td data-label={t('dep.table.status')}>
                        <div>
                          <DepenseStatus statut={depense.statut} />
                          {depense.statut === 'rejetee' && depense.motif_rejet && <small className="dep-description">{t('dep.table.reason', { reason: depense.motif_rejet })}</small>}
                          {depense.traitee_par && <small className="dep-description">{t('dep.table.by', { name: depense.traitee_par })}</small>}
                        </div>
                      </td>
                      <td data-label={t('dep.table.actions')}>
                        {depense.statut === 'en_attente' ? (
                          <ActionMenu
                            label={t('dep.actionsFor', { category: t(`dep.categories.${depense.categorie}`), amount: amount(depense.montant) })}
                            items={[
                              { key: 'validate', label: t('dep.validate.button'), icon: 'check', disabled: validatingId === depense.id, onSelect: () => validate(depense) },
                              { key: 'edit', label: t('dep.edit'), icon: 'pencil', onSelect: () => setEditing(depense) },
                              { key: 'reject', label: t('dep.reject.button'), icon: 'close', danger: true, onSelect: () => setRejecting(depense) },
                            ]}
                          />
                        ) : <span className="db-muted-text">{t('dep.table.processed')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="db-pagination">
              <span>{t('dep.table.count', { total: data.pagination.total, page: data.pagination.page, last: data.pagination.last_page })}</span>
              <div>
                <button type="button" className="db-button db-button--secondary" disabled={page <= 1 || loading} onClick={() => filter(setPage, page - 1)}>{t('dash.pagination.previous')}</button>
                <button type="button" className="db-button db-button--secondary" disabled={page >= data.pagination.last_page || loading} onClick={() => filter(setPage, page + 1)}>{t('dash.pagination.next')}</button>
              </div>
            </div>
          </>
        ) : (
          <div className="db-empty">
            <span className="db-empty-icon"><Icon name="expense" size={24} /></span>
            <h3>{t('dep.empty.title')}</h3>
            <p>{statut || categorie || search ? t('dep.empty.filtered') : t('dep.empty.text')}</p>
          </div>
        )}
      </section>

      {editing && (
        <DepenseForm
          depense={editing.id ? editing : null}
          categories={data.categories}
          modes={data.modes}
          onClose={() => setEditing(null)}
          onSaved={message => { setEditing(null); onNotice(message); refresh() }}
          onSessionExpired={onSessionExpired}
        />
      )}
      {rejecting && (
        <RejectDialog
          depense={rejecting}
          onClose={() => setRejecting(null)}
          onSaved={message => { setRejecting(null); onNotice(message); refresh() }}
          onSessionExpired={onSessionExpired}
        />
      )}
    </div>
  )
}

/** Pastille : en attente (or), validée (vert), rejetée (rouge). */
function DepenseStatus({ statut }) {
  const { t } = useI18n()
  const classes = { validee: 'db-badge--success', en_attente: 'db-badge--attention', rejetee: 'pay-badge--danger' }
  return (
    <span className={`db-badge ${classes[statut] ?? 'db-badge--neutral'}`}>
      <span className="db-badge-dot" />{t(`dep.status.${statut}`)}
    </span>
  )
}
