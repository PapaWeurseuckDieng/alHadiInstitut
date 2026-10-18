import { useEffect, useRef, useState } from 'react'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { getRappels } from '../../../services/paiementsService'
import { usePaymentFormat } from './usePaymentFormat'

// Onglets de statut (vide = tous)
const STATUTS = ['', 'envoye', 'simule', 'echec']
const BADGES = { envoye: 'db-badge--success', simule: 'db-badge--attention', echec: 'pay-badge--danger' }

/**
 * Journal détaillé des rappels WhatsApp d'un mois : destinataire, statut, envoi automatique
 * ou manuel (et par qui), texte exact du message et erreur éventuelle.
 *
 * @param {{ mois: string, onClose: () => void, onSessionExpired: () => void }} props
 */
export default function RappelsJournal({ mois, onClose, onSessionExpired }) {
  const { t, formatDate, serverMessage } = useI18n()
  const { monthLabel } = usePaymentFormat()
  const dialog = useRef(null)
  const [statut, setStatut] = useState('')
  const [journal, setJournal] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => node.close()
  }, [])

  useEffect(() => {
    let cancelled = false
    getRappels(mois, statut)
      .then(response => { if (!cancelled) { setJournal(response); setError('') } })
      .catch(err => {
        if (cancelled) return
        if (err.status === 401) { onSessionExpired(); return }
        setError(serverMessage(err.message, err.status || 0))
      })
    return () => { cancelled = true }
  }, [mois, statut, onSessionExpired, serverMessage])

  const totaux = journal?.totaux
  const count = value => (!totaux ? null : value ? totaux[value] : totaux.envoye + totaux.simule + totaux.echec)

  return (
    <dialog ref={dialog} className="db-dialog pay-journal" aria-labelledby="journal-title" onCancel={event => { event.preventDefault(); onClose() }}>
      <div className="db-dialog-heading">
        <span className="db-dialog-icon"><Icon name="chat" /></span>
        <div>
          <h2 id="journal-title">{t('pay.journal.title')}</h2>
          <p>{monthLabel(mois)}</p>
        </div>
        <button type="button" className="db-icon-button" aria-label={t('form.close')} onClick={onClose}><Icon name="close" /></button>
      </div>

      <div className="db-dialog-body">
        <div className="pay-tabs" role="group" aria-label={t('pay.table.status')}>
          {STATUTS.map(value => (
            <button key={value || 'tous'} type="button" className={`pay-tab ${statut === value ? 'pay-tab--active' : ''}`} aria-pressed={statut === value} onClick={() => setStatut(value)}>
              {value ? t(`pay.journal.status.${value}`) : t('pay.filters.all')}
              {count(value) !== null && <span className="pay-tab-count">{count(value)}</span>}
            </button>
          ))}
        </div>

        {error && <div className="db-alert db-alert--error" role="alert"><strong>{error}</strong></div>}
        {!journal && !error && <div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loading')}</div>}
        {journal && journal.data.length === 0 && (
          <div className="db-empty">
            <span className="db-empty-icon"><Icon name="chat" size={24} /></span>
            <h3>{t('pay.journal.emptyTitle')}</h3>
            <p>{statut ? t('pay.journal.emptyFiltered') : t('pay.journal.emptyText')}</p>
          </div>
        )}

        {journal && journal.data.length > 0 && (
          <ul className="pay-journal-list">
            {journal.data.map(rappel => (
              <li key={rappel.id}>
                <div className="pay-journal-head">
                  <span>
                    <strong>{rappel.tuteur || t('dash.table.notProvided')}</strong>
                    <small><bdi dir="ltr">{rappel.telephone}</bdi> · {formatDate(rappel.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</small>
                  </span>
                  <span className="pay-journal-badges">
                    <span className={`db-badge ${BADGES[rappel.statut] ?? 'db-badge--neutral'}`}><span className="db-badge-dot" />{t(`pay.journal.status.${rappel.statut}`)}</span>
                    <span className="db-badge db-badge--neutral">
                      {rappel.automatique ? t('pay.journal.auto') : rappel.envoye_par ? t('pay.journal.manualBy', { name: rappel.envoye_par }) : t('pay.journal.manual')}
                    </span>
                  </span>
                </div>
                {rappel.erreur && <p className="pay-error-text">{t('pay.journal.error', { error: rappel.erreur })}</p>}
                <details>
                  <summary>{t('pay.journal.showMessage')}</summary>
                  <p className="pay-journal-message">{rappel.message}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="db-dialog-footer">
        <button type="button" className="db-button db-button--secondary" onClick={onClose}>{t('pay.form.close')}</button>
      </div>
    </dialog>
  )
}
