import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import Icon from '../../components/Icon'
import LanguageSwitcher from '../../components/LanguageSwitcher/LanguageSwitcher'
import { translate } from '../../i18n/i18n'
import { useI18n } from '../../i18n/useI18n'
import { getToken } from '../../services/authService'
import { annulerPaiement, getRecu } from '../../services/paiementsService'
import { montantEnLettres } from '../../utils/montantEnLettres'
import { usePaymentFormat } from '../DashboardPage/paiements/usePaymentFormat'
import './RecuPage.css'

/**
 * Reçu de paiement imprimable (/recus/:id), format A5.
 * « Imprimer / Enregistrer en PDF » ouvre la fenêtre d'impression du navigateur :
 * choisir l'imprimante, ou « Enregistrer au format PDF ».
 * Un administrateur peut annuler un reçu erroné (motif obligatoire).
 */
export default function RecuPage() {
  const { id } = useParams()
  const { t, formatDate, serverMessage } = useI18n()
  const { amount, monthLabel } = usePaymentFormat()
  const [recu, setRecu] = useState(null)
  const [error, setError] = useState('')
  // Annulation : formulaire affiché, motif saisi, envoi en cours
  const [cancelOpen, setCancelOpen] = useState(false)
  const [motif, setMotif] = useState('')
  const [busy, setBusy] = useState(false)
  const token = getToken()

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getRecu(id)
      .then(data => { if (!cancelled) setRecu(data) })
      .catch(err => { if (!cancelled) setError(err.status === 404 ? t('pay.receipt.notFound') : (err.status ? serverMessage(err.message, err.status) : err.message)) })
    return () => { cancelled = true }
  }, [id, token, t, serverMessage])

  // Titre de l'onglet (et nom proposé pour le PDF) : numéro du reçu
  useEffect(() => {
    if (recu) document.title = `${t('pay.receipt.title')} ${recu.numero_recu}`
    return () => { document.title = 'Al Hadi Institut' }
  }, [recu, t])

  if (!token) return <Navigate to="/login" replace />

  async function cancelReceipt(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const response = await annulerPaiement(recu.id, motif.trim())
      setRecu(response.data)
      setCancelOpen(false)
    } catch (err) {
      setError(err.status ? serverMessage(err.errors?.motif?.[0] || err.message, err.status, { fallback: 'original' }) : err.message)
    } finally {
      setBusy(false)
    }
  }

  const date = value => formatDate(`${value}T12:00:00`, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="recu-page">
      {/* ---------- Barre d'outils (non imprimée) ---------- */}
      <div className="recu-toolbar">
        <Link to="/tableau-de-bord" className="db-button db-button--secondary">
          <span className="db-flip-rtl"><Icon name="chevronLeft" size={17} /></span>{t('pay.receipt.back')}
        </Link>
        <div className="recu-toolbar-end">
          <LanguageSwitcher />
          {recu && !recu.annule && (
            <button type="button" className="db-button db-button--secondary recu-cancel-btn" onClick={() => setCancelOpen(open => !open)}>
              {t('pay.receipt.cancel')}
            </button>
          )}
          <button type="button" className="db-button" onClick={() => window.print()} disabled={!recu}>
            <Icon name="printer" size={17} />{t('pay.receipt.print')}
          </button>
        </div>
      </div>

      {cancelOpen && (
        <form className="recu-cancel" onSubmit={cancelReceipt}>
          <label htmlFor="recu-motif">{t('pay.receipt.cancelReason')}</label>
          <input id="recu-motif" value={motif} onChange={event => setMotif(event.target.value)} minLength={3} maxLength={255} required />
          <p>{t('pay.receipt.cancelHelp')}</p>
          <button className="db-button recu-cancel-confirm" disabled={busy || motif.trim().length < 3}>{t('pay.receipt.cancelConfirm')}</button>
        </form>
      )}

      {error && <div className="db-alert db-alert--error recu-error" role="alert"><span>{error}</span></div>}
      {!recu && !error && <p className="recu-loading" role="status">{t('pay.receipt.loading')}</p>}

      {/* ---------- Reçu (seule partie imprimée) ---------- */}
      {recu && (
        <article className={`recu ${recu.annule ? 'recu--annule' : ''}`}>
          {recu.annule && <span className="recu-stamp" aria-hidden="true">{t('pay.receipt.cancelled')}</span>}

          <header className="recu-header">
            <img src="/faviconDara.svg" alt="" className="recu-logo" />
            <div className="recu-institut">
              <strong>{t('common.instituteName')}</strong>
              <span>{t('pay.receipt.schoolYear')} {recu.annee_scolaire}</span>
            </div>
            <div className="recu-title">
              <h1>{t('pay.receipt.title')}</h1>
              <p>{t('pay.receipt.number')} <bdi>{recu.numero_recu}</bdi></p>
              <p>{date(recu.date_paiement)}</p>
            </div>
          </header>

          {recu.annule && (
            <p className="recu-cancelled" role="status">
              {t('pay.receipt.cancelledOn', { date: formatDate(recu.annule_at, { dateStyle: 'medium' }), motif: recu.motif_annulation })}
            </p>
          )}

          {/* Montant mis en avant */}
          <div className="recu-amount">
            <span>{t('pay.receipt.amount')}</span>
            <strong>{amount(recu.montant)}</strong>
            {/* Montant en lettres : en français (langue des documents officiels de l'institut) */}
            <p lang="fr" dir="ltr">
              {translate('pay.receipt.inWords', {}, 'fr')} <em>{montantEnLettres(recu.montant)} francs CFA</em>.
            </p>
          </div>

          <dl className="recu-details">
            <div><dt>{t('pay.receipt.student')}</dt><dd>{recu.eleve ? `${recu.eleve.prenom} ${recu.eleve.nom}` : '—'}</dd></div>
            <div><dt>{t('pay.receipt.matricule')}</dt><dd><bdi>{recu.eleve?.matricule ?? '—'}</bdi></dd></div>
            <div><dt>{t('pay.receipt.class')}</dt><dd>{recu.classe ?? '—'}</dd></div>
            <div><dt>{t('pay.receipt.month')}</dt><dd>{monthLabel(recu.mois)}</dd></div>
            <div><dt>{t('pay.receipt.mode')}</dt><dd>{t(`pay.modes.${recu.mode_paiement}`)}</dd></div>
            {recu.tuteur && <div><dt>{t('pay.receipt.tutor')}</dt><dd>{recu.tuteur}</dd></div>}
            <div><dt>{t('pay.receipt.due')}</dt><dd className="recu-money">{amount(recu.montant_du)}</dd></div>
            <div><dt>{t('pay.receipt.totalMonth')}</dt><dd className="recu-money">{amount(recu.total_paye_mois)}</dd></div>
            <div className="recu-rest"><dt>{t('pay.receipt.remaining')}</dt><dd className="recu-money">{amount(recu.reste)}</dd></div>
            {recu.note && <div><dt>{t('pay.receipt.note')}</dt><dd>{recu.note}</dd></div>}
            {recu.encaisse_par && <div><dt>{t('pay.receipt.cashier')}</dt><dd>{recu.encaisse_par}</dd></div>}
          </dl>

          <div className="recu-signatures">
            <div>{t('pay.receipt.parentSignature')}</div>
            <div>{t('pay.receipt.signature')}</div>
          </div>

          <footer className="recu-footer">{t('pay.receipt.footer')}</footer>
        </article>
      )}
    </div>
  )
}
