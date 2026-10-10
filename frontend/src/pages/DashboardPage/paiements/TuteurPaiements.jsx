import { useEffect, useState } from 'react'
import { useI18n } from '../../../i18n/useI18n'
import { getMesPaiements } from '../../../services/paiementsService'
import { usePaymentFormat } from './usePaymentFormat'
import './Paiements.css'

/**
 * Espace tuteur : mensualités de l'année pour chacun de ses enfants,
 * un repère par mois (payé, partiel, impayé, à venir) et le reste à payer.
 */
export default function TuteurPaiements({ refreshKey }) {
  const { t } = useI18n()
  const { amount, monthLabel } = usePaymentFormat()
  const [enfants, setEnfants] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    getMesPaiements()
      .then(data => { if (!cancelled) { setEnfants(data); setError(false) } })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [refreshKey])

  // Rien à afficher tant qu'il n'y a pas d'enfant inscrit cette année
  if (error || !enfants?.length) return null

  const annee = enfants[0].mois.length ? `${enfants[0].mois[0].mois.slice(0, 4)}-${Number(enfants[0].mois[0].mois.slice(0, 4)) + 1}` : ''

  return (
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
  )
}
