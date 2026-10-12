import { useCallback, useEffect, useState } from 'react'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { envoyerRappels, getPaiements } from '../../../services/paiementsService'
import PaymentForm from './PaymentForm'
import TarifsForm from './TarifsForm'
import { usePaymentFormat } from './usePaymentFormat'
import './Paiements.css'

// Onglets de statut (vide = tous)
const STATUS_TABS = ['', 'impaye', 'partiel', 'paye']

/**
 * Rubrique « Paiements » (administrateur) :
 * mois affiché, indicateurs, rappels WhatsApp, liste des élèves avec leur statut,
 * encaissement d'un paiement et accès aux reçus.
 *
 * @param {{ refreshKey: number, onNotice: (message: string) => void, onSessionExpired: () => void }} props
 *   refreshKey : change quand l'utilisateur clique sur « Actualiser »
 */
export default function PaymentsSection({ refreshKey, onNotice, onSessionExpired }) {
  const { t, formatDate, serverMessage } = useI18n()
  const { amount, monthLabel } = usePaymentFormat()

  // Filtres (mois vide = mois par défaut choisi par le serveur)
  const [mois, setMois] = useState('')
  const [statut, setStatut] = useState('')
  const [classeId, setClasseId] = useState('')
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Fenêtres ouvertes : encaissement d'une ligne, tarifs
  const [paying, setPaying] = useState(null)
  const [tarifsOpen, setTarifsOpen] = useState(false)
  const [sending, setSending] = useState(false)

  // Chargement de la situation du mois à chaque changement de filtre
  useEffect(() => {
    let cancelled = false
    getPaiements({ mois, statut, classe_id: classeId, q: search, page })
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
  }, [mois, statut, classeId, search, page, reload, refreshKey, onSessionExpired])

  /** Recharge les données en gardant les filtres. */
  const refresh = useCallback(() => { setLoading(true); setReload(r => r + 1) }, [])

  /** Change un filtre et revient à la première page. */
  function filter(setter, value) { setter(value); setPage(1); setLoading(true) }

  // Navigation entre les mois de l'année scolaire
  const months = data?.mois_disponibles ?? []
  const index = months.findIndex(m => m.value === data?.mois)
  function goToMonth(value) { filter(setMois, value) }

  /** Envoi manuel des rappels WhatsApp du mois, après confirmation. */
  async function sendReminders() {
    if (!window.confirm(t('pay.reminders.confirm', { month: monthLabel(data.mois) }))) return
    setSending(true)
    try {
      const response = await envoyerRappels(data.mois)
      onNotice(serverMessage(response.message, 200, { fallback: 'original' }))
      refresh()
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      setError({ message: err.message, status: err.status })
    } finally {
      setSending(false)
    }
  }

  const stats = data?.stats
  const rate = stats?.attendu ? Math.round((stats.encaisse / stats.attendu) * 100) : 0
  const rappels = data?.rappels

  return (
    <div className="pay">
      {/* ---------- Mois + outils ---------- */}
      <div className="pay-toolbar">
        <div className="pay-month" role="group" aria-label={t('pay.month')}>
          <button type="button" className="db-icon-button" aria-label={t('pay.previousMonth')} disabled={index <= 0 || loading} onClick={() => goToMonth(months[index - 1].value)}>
            <span className="db-flip-rtl"><Icon name="chevronLeft" /></span>
          </button>
          <label className="db-sr-only" htmlFor="pay-month">{t('pay.month')}</label>
          <select id="pay-month" value={data?.mois ?? ''} onChange={event => goToMonth(event.target.value)} disabled={!data}>
            {months.map(m => <option key={m.value} value={m.value}>{monthLabel(m.value)}</option>)}
          </select>
          <button type="button" className="db-icon-button" aria-label={t('pay.nextMonth')} disabled={index < 0 || index >= months.length - 1 || loading} onClick={() => goToMonth(months[index + 1].value)}>
            <span className="db-flip-rtl"><Icon name="chevronRight" /></span>
          </button>
        </div>

        <div className="pay-actions">
          <button type="button" className="db-button db-button--secondary" onClick={() => setTarifsOpen(true)}>
            <Icon name="settings" size={17} />{t('pay.tarifs.button')}
          </button>
          <button type="button" className="db-button" onClick={sendReminders} disabled={!data || sending || !stats?.eleves}>
            <Icon name="chat" size={17} />{sending ? t('pay.reminders.sending') : t('pay.reminders.sendNow')}
          </button>
        </div>
      </div>

      {error && (
        <div className="db-alert db-alert--error" role="alert">
          <span>{error.status ? serverMessage(error.message, error.status) : error.message}</span>
          <button type="button" className="db-button db-button--secondary" onClick={refresh}>{t('dash.retry')}</button>
        </div>
      )}

      {/* ---------- Indicateurs du mois ---------- */}
      <section className="pay-stats" aria-label={t('pay.stats.aria')}>
        {stats ? (
          <>
            <div className="pay-stat">
              <span className="pay-stat-label">{t('pay.stats.expected')}</span>
              <strong>{amount(stats.attendu)}</strong>
              <span className="pay-stat-hint">{monthLabel(data.mois)}</span>
            </div>
            <div className="pay-stat pay-stat--green">
              <span className="pay-stat-label">{t('pay.stats.collected')}</span>
              <strong>{amount(stats.encaisse)}</strong>
              {/* Barre de progression de l'encaissement */}
              <span className="pay-progress" aria-hidden="true"><span style={{ width: `${Math.min(rate, 100)}%` }} /></span>
              <span className="pay-stat-hint">{t('pay.stats.rate', { rate })}</span>
            </div>
            <div className={`pay-stat ${stats.reste > 0 ? 'pay-stat--attention' : ''}`}>
              <span className="pay-stat-label">{t('pay.stats.remaining')}</span>
              <strong>{amount(stats.reste)}</strong>
              <span className="pay-stat-hint">{t('pay.stats.unpaidCount', { count: stats.impayes + stats.partiels })}</span>
            </div>
            <div className="pay-stat">
              <span className="pay-stat-label">{t('pay.stats.upToDate')}</span>
              <strong>{t('pay.stats.ofTotal', { count: stats.payes, total: stats.eleves })}</strong>
              <span className="pay-stat-hint">
                {t('pay.status.partiel')} : {stats.partiels} · {t('pay.status.impaye')} : {stats.impayes}
              </span>
            </div>
          </>
        ) : Array.from({ length: 4 }, (_, i) => <div key={i} className="pay-stat db-skeleton" />)}
      </section>

      {/* ---------- Rappels WhatsApp ---------- */}
      {rappels && (
        <section className="pay-reminders" aria-labelledby="pay-reminders-title">
          <span className="pay-reminders-icon" aria-hidden="true"><Icon name="chat" /></span>
          <div>
            <h2 id="pay-reminders-title">
              {t('pay.reminders.title')}
              {rappels.pilote === 'log' && <span className="db-badge db-badge--attention"><span className="db-badge-dot" />{t('pay.reminders.simulation')}</span>}
            </h2>
            <p>{t('pay.reminders.auto', { day: rappels.jour, hour: rappels.heure })}</p>
            <p className="pay-reminders-state">
              {rappels.envoyes ? t('pay.reminders.sentThisMonth', { count: rappels.envoyes }) : t('pay.reminders.none')}
              {rappels.echecs > 0 && <span className="pay-error-text"> {t('pay.reminders.failures', { count: rappels.echecs })}</span>}
            </p>
            {rappels.pilote === 'log' && <p className="pay-reminders-help">{t('pay.reminders.simulationHelp')}</p>}
          </div>
        </section>
      )}

      {/* ---------- Liste des élèves ---------- */}
      <section className="db-panel db-records" aria-busy={loading}>
        <div className="pay-filters">
          {/* Onglets de statut, avec le nombre d'élèves de chaque statut */}
          <div className="pay-tabs" role="group" aria-label={t('pay.table.status')}>
            {STATUS_TABS.map(value => {
              const count = !stats ? null : value === '' ? stats.eleves : value === 'paye' ? stats.payes : value === 'partiel' ? stats.partiels : stats.impayes
              return (
                <button
                  key={value || 'tous'}
                  type="button"
                  className={`pay-tab ${statut === value ? 'pay-tab--active' : ''}`}
                  aria-pressed={statut === value}
                  onClick={() => filter(setStatut, value)}
                >
                  {value ? t(`pay.status.${value}`) : t('pay.filters.all')}
                  {count !== null && <span className="pay-tab-count">{count}</span>}
                </button>
              )
            })}
          </div>

          <div className="pay-filter-fields">
            <label className="db-sr-only" htmlFor="pay-class">{t('pay.filters.class')}</label>
            <select id="pay-class" className="pay-select" value={classeId} onChange={event => filter(setClasseId, event.target.value)}>
              <option value="">{t('pay.filters.allClasses')}</option>
              {data?.classes.map(classe => <option key={classe.id} value={classe.id}>{classe.nom}</option>)}
            </select>
            <form className="db-search" role="search" onSubmit={event => { event.preventDefault(); filter(setSearch, draft.trim()) }}>
              <Icon name="search" size={18} />
              <input aria-label={t('pay.filters.searchLabel')} placeholder={t('pay.filters.placeholder')} maxLength={120} value={draft} onChange={event => setDraft(event.target.value)} />
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
              <PaymentsTable
                items={data.items}
                onCollect={item => setPaying(item)}
                lastReminderText={date => t('pay.reminders.lastReminder', { date: formatDate(date, { day: 'numeric', month: 'short' }) })}
              />
            </div>
            <div className="db-pagination">
              <span>{t('pay.table.count', { total: data.pagination.total, page: data.pagination.page, last: data.pagination.last_page })}</span>
              <div>
                <button type="button" className="db-button db-button--secondary" disabled={page <= 1 || loading} onClick={() => filter(setPage, page - 1)}>{t('dash.pagination.previous')}</button>
                <button type="button" className="db-button db-button--secondary" disabled={page >= data.pagination.last_page || loading} onClick={() => filter(setPage, page + 1)}>{t('dash.pagination.next')}</button>
              </div>
            </div>
          </>
        ) : (
          <div className="db-empty">
            <span className="db-empty-icon"><Icon name="wallet" size={24} /></span>
            <h3>{t('pay.empty.title')}</h3>
            <p>{statut || classeId || search ? t('pay.empty.filtered') : t('pay.empty.text')}</p>
          </div>
        )}
      </section>

      {paying && (
        <PaymentForm
          item={paying}
          mois={data.mois}
          modes={data.modes}
          onClose={() => setPaying(null)}
          onSaved={message => { onNotice(message); refresh() }}
          onSessionExpired={onSessionExpired}
        />
      )}
      {tarifsOpen && (
        <TarifsForm
          onClose={() => setTarifsOpen(false)}
          onSaved={message => { setTarifsOpen(false); onNotice(message); refresh() }}
          onSessionExpired={onSessionExpired}
        />
      )}
    </div>
  )
}

/**
 * Tableau des mensualités du mois. Sur mobile, chaque ligne devient une carte (voir DashboardPage.css).
 */
function PaymentsTable({ items, onCollect, lastReminderText }) {
  const { t } = useI18n()
  const { amount } = usePaymentFormat()

  return (
    <table>
      <caption className="db-sr-only">{t('pay.table.caption')}</caption>
      <thead>
        <tr>
          <th>{t('pay.table.student')}</th>
          <th>{t('pay.table.class')}</th>
          <th>{t('pay.table.due')}</th>
          <th>{t('pay.table.paid')}</th>
          <th>{t('pay.table.status')}</th>
          <th>{t('pay.table.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {items.map(item => (
          <tr key={item.eleve.id}>
            <td data-label={t('pay.table.student')}>
              <div className="db-person">
                <span className="db-avatar" aria-hidden="true">{`${item.eleve.prenom[0] ?? ''}${item.eleve.nom[0] ?? ''}`.toUpperCase()}</span>
                <span>
                  <strong>{item.eleve.prenom} {item.eleve.nom}</strong>
                  <small><bdi>{item.eleve.matricule}</bdi></small>
                </span>
              </div>
            </td>
            <td data-label={t('pay.table.class')}>{item.classe?.nom ?? '—'}</td>
            <td data-label={t('pay.table.due')} className="db-nowrap">{amount(item.montant_du)}</td>
            <td data-label={t('pay.table.paid')}>
              <div>
                <span className="db-nowrap">{amount(item.montant_paye)}</span>
                {/* Liens vers les reçus du mois (nouvel onglet, pour imprimer) */}
                {item.paiements.map(paiement => (
                  <a key={paiement.id} className="pay-receipt-link" href={`/recus/${paiement.id}`} target="_blank" rel="noopener noreferrer">
                    <Icon name="receipt" size={14} />{t('pay.table.receipt', { numero: paiement.numero_recu })}
                  </a>
                ))}
              </div>
            </td>
            <td data-label={t('pay.table.status')}>
              <div>
                <StatusBadge statut={item.statut} />
                {/* Date du dernier rappel au parent : utile seulement si l'élève n'est pas à jour */}
                {item.dernier_rappel && item.statut !== 'paye' && <small className="pay-reminder-date">{lastReminderText(item.dernier_rappel.date)}</small>}
              </div>
            </td>
            <td data-label={t('pay.table.actions')}>
              {/* Cellule vide pour un élève à jour : masquée sur mobile (voir Paiements.css) */}
              {(item.statut !== 'paye' || item.whatsapp) && (
              <div className="pay-row-actions">
                {item.statut !== 'paye' && (
                  <button type="button" className="db-button pay-collect" onClick={() => onCollect(item)}>
                    <Icon name="wallet" size={16} />{t('pay.collect')}
                  </button>
                )}
                {/* Rappel manuel : ouvre WhatsApp avec le message pré-rempli pour le parent */}
                {item.whatsapp && (
                  <a
                    className="db-button db-button--secondary pay-whatsapp"
                    href={`https://wa.me/${item.whatsapp.numero}?text=${encodeURIComponent(item.whatsapp.message)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t('pay.reminders.manualTitle')}
                  >
                    <Icon name="chat" size={16} />{t('pay.reminders.manual')}
                  </a>
                )}
              </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Pastille de statut : payé (vert), partiel (or), impayé (rouge). */
export function StatusBadge({ statut }) {
  const { t } = useI18n()
  const classes = { paye: 'db-badge--success', partiel: 'db-badge--attention', impaye: 'pay-badge--danger' }
  return (
    <span className={`db-badge ${classes[statut] ?? 'db-badge--neutral'}`}>
      <span className="db-badge-dot" />{t(`pay.status.${statut}`)}
    </span>
  )
}
