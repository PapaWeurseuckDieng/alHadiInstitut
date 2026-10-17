import { useEffect, useState } from 'react'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { getMesPaiements, getMesRecus } from '../../../services/paiementsService'
import { usePaymentFormat } from './usePaymentFormat'
import './Paiements.css'

/** Lien vers le reçu imprimable : mensualité ou frais d'inscription. */
const receiptHref = recu => (recu.type === 'inscription' ? `/recus/inscription/${recu.id}` : `/recus/${recu.id}`)

/**
 * Espace tuteur :
 *  - mensualités de l'année pour chacun de ses enfants (un repère par mois, reste à payer) ;
 *  - tous les reçus déjà émis (frais d'inscription et mensualités), chacun ouvrant le reçu détaillé.
 */
export default function TuteurPaiements({ refreshKey }) {
  const { t, formatDate } = useI18n()
  const { amount, monthLabel } = usePaymentFormat()
  const [enfants, setEnfants] = useState(null)
  const [recus, setRecus] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([getMesPaiements(), getMesRecus()])
      .then(([mensualites, mesRecus]) => { if (!cancelled) { setEnfants(mensualites); setRecus(mesRecus); setError(false) } })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [refreshKey])

  if (error || (!enfants?.length && !recus?.recus.length)) return null

  const annee = enfants?.[0]?.mois.length ? `${enfants[0].mois[0].mois.slice(0, 4)}-${Number(enfants[0].mois[0].mois.slice(0, 4)) + 1}` : ''

  return (
    <>
      {enfants?.length > 0 && (
        <section className="db-panel pay-tuteur" aria-labelledby="pay-tuteur-title">
          <div className="db-panel-heading">
            <div>
              <h2 id="pay-tuteur-title">{t('pay.tuteur.title')}</h2>
              <p>{t('pay.tuteur.text', { year: annee })}</p>
            </div>
          </div>

          <div className="pay-tuteur-list">
            {enfants.map(enfant => {
              // Reste à payer : mois échus ou en cours seulement
              const reste = enfant.mois.filter(m => !m.a_venir).reduce((total, m) => total + m.reste, 0)
              return (
                <article key={enfant.eleve.id} className="pay-tuteur-child">
                  <header>
                    <h3>{enfant.eleve.prenom} {enfant.eleve.nom}</h3>
                    {reste > 0
                      ? <span className="db-badge pay-badge--danger"><span className="db-badge-dot" />{t('pay.tuteur.remaining', { amount: amount(reste) })}</span>
                      : <span className="db-badge db-badge--success"><span className="db-badge-dot" />{t('pay.tuteur.upToDate')}</span>}
                  </header>
                  <ol className="pay-months">
                    {enfant.mois.map(m => {
                      const etat = m.a_venir ? 'aVenir' : m.statut
                      return (
                        <li key={m.mois} className={`pay-month-chip pay-month-chip--${etat}`} title={`${monthLabel(m.mois)} : ${t(`pay.status.${etat}`)}${m.reste > 0 && !m.a_venir ? ` (${amount(m.reste)})` : ''}`}>
                          <span className="pay-month-name">{monthLabel(m.mois).split(' ')[0]}</span>
                          <span className="pay-month-state">{t(`pay.status.${etat}`)}</span>
                        </li>
                      )
                    })}
                  </ol>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {/* ---------- Reçus déjà émis : chaque ligne ouvre le reçu détaillé (imprimable) ---------- */}
      {recus?.recus.length > 0 && (
        <section className="db-panel pay-tuteur" aria-labelledby="pay-recus-title">
          <div className="db-panel-heading">
            <div>
              <h2 id="pay-recus-title">{t('pay.tuteur.receiptsTitle')}</h2>
              <p>{t('pay.tuteur.receiptsText', { total: amount(recus.total_paye) })}</p>
            </div>
          </div>
          <div className="db-table-scroll">
            <table className="pay-receipts">
              <caption className="db-sr-only">{t('pay.tuteur.receiptsTitle')}</caption>
              <thead>
                <tr>
                  <th>{t('pay.receipt.date')}</th>
                  <th>{t('pay.receipt.student')}</th>
                  <th>{t('pay.tuteur.object')}</th>
                  <th>{t('pay.receipt.amount')}</th>
                  <th>{t('pay.receipt.number')}</th>
                </tr>
              </thead>
              <tbody>
                {recus.recus.map(recu => (
                  <tr key={`${recu.type}-${recu.id}`} className={recu.annule ? 'pay-receipt--cancelled' : ''}>
                    <td data-label={t('pay.receipt.date')} className="db-nowrap">{recu.date_paiement ? formatDate(`${recu.date_paiement}T12:00:00`, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                    <td data-label={t('pay.receipt.student')}>{recu.eleve?.prenom} {recu.eleve?.nom}</td>
                    <td data-label={t('pay.tuteur.object')}>
                      {recu.type === 'inscription' ? t('pay.receipt.fees', { year: recu.annee_scolaire }) : t('form.payment.monthly', { month: monthLabel(recu.mois) })}
                      {recu.annule && <> <span className="db-badge db-badge--neutral"><span className="db-badge-dot" />{t('pay.tuteur.cancelled')}</span></>}
                    </td>
                    <td data-label={t('pay.receipt.amount')} className="db-nowrap"><strong>{amount(recu.montant)}</strong></td>
                    <td data-label={t('pay.receipt.number')}>
                      <a className="pay-receipt-link" href={receiptHref(recu)} target="_blank" rel="noopener noreferrer" aria-label={t('pay.tuteur.openReceipt', { numero: recu.numero_recu })}>
                        <Icon name="receipt" size={14} /><bdi>{recu.numero_recu}</bdi>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
