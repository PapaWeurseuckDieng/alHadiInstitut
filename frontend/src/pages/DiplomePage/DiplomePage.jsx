import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import Icon from '../../components/Icon'
import LanguageSwitcher from '../../components/LanguageSwitcher/LanguageSwitcher'
import { useI18n } from '../../i18n/useI18n'
import { getToken } from '../../services/authService'
import { getDiplome } from '../../services/diplomesService'
import './DiplomePage.css'

/**
 * Diplôme imprimable (/diplomes/:id), format A4 paysage.
 * Ouvert par l'administration ou par le tuteur de l'élève ; un diplôme annulé porte la mention « ANNULÉ ».
 */
export default function DiplomePage() {
  const { id } = useParams()
  const { t, formatDate, serverMessage } = useI18n()
  const [diplome, setDiplome] = useState(null)
  const [error, setError] = useState('')
  const token = getToken()

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getDiplome(id)
      .then(data => { if (!cancelled) setDiplome(data) })
      .catch(err => { if (!cancelled) setError(err.status === 404 ? t('dip.page.notFound') : (err.status ? serverMessage(err.message, err.status) : err.message)) })
    return () => { cancelled = true }
  }, [id, token, t, serverMessage])

  // Titre de l'onglet (et nom proposé pour le PDF) : numéro du diplôme
  useEffect(() => {
    if (diplome) document.title = `${t('dip.page.title')} ${diplome.numero}`
    return () => { document.title = 'Al Hadi Institut' }
  }, [diplome, t])

  if (!token) return <Navigate to="/login" replace />

  const date = value => formatDate(`${value}T12:00:00`, { day: 'numeric', month: 'long', year: 'numeric' })
  const eleve = diplome?.eleve

  return (
    <div className="dip-page">
      {/* ---------- Barre d'outils (non imprimée) ---------- */}
      <div className="dip-toolbar">
        <Link to="/tableau-de-bord" className="db-button db-button--secondary">
          <span className="db-flip-rtl"><Icon name="chevronLeft" size={17} /></span>{t('pay.receipt.back')}
        </Link>
        <div className="dip-toolbar-end">
          <LanguageSwitcher />
          <button type="button" className="db-button" onClick={() => window.print()} disabled={!diplome}>
            <Icon name="printer" size={17} />{t('pay.receipt.print')}
          </button>
        </div>
      </div>

      {error && <div className="db-alert db-alert--error dip-error" role="alert"><span>{error}</span></div>}
      {!diplome && !error && <p className="dip-loading" role="status">{t('dash.loading')}</p>}

      {diplome && (
        <article className={`dip ${diplome.annule ? 'dip--annule' : ''}`}>
          {diplome.annule && <span className="dip-stamp" aria-hidden="true">{t('pay.receipt.cancelled')}</span>}
          <div className="dip-frame">
            <header className="dip-header">
              <img src="/faviconDara.svg" alt="" className="dip-logo" />
              <div>
                <p className="dip-institute">{t('common.instituteName')}</p>
                <p className="dip-basmala" lang="ar" dir="rtl">بسم الله الرحمن الرحيم</p>
              </div>
              <p className="dip-number">{t('dip.page.number')} <bdi>{diplome.numero}</bdi></p>
            </header>

            <h1 className="dip-title">{diplome.intitule}</h1>
            <p className="dip-intro">{t('dip.page.awardedTo')}</p>
            <p className="dip-name">{eleve?.prenom} {eleve?.nom}</p>
            <p className="dip-identity">
              {eleve?.date_naissance && <>{t('dip.page.bornOn', { date: date(eleve.date_naissance) })} · </>}
              {t('dip.page.matricule')} <bdi>{eleve?.matricule}</bdi>
              {diplome.classe && <> · {diplome.classe}</>}
            </p>

            {diplome.mention && (
              <p className="dip-mention">{t('dip.page.mention')} <strong>{t(`dip.mentions.${diplome.mention}`)}</strong></p>
            )}
            {diplome.observations && <p className="dip-observations">{diplome.observations}</p>}

            <footer className="dip-footer">
              <div>
                <span>{t('dip.page.deliveredOn', { date: date(diplome.date_obtention) })}</span>
                <span>{t('dip.page.schoolYear', { year: diplome.annee_scolaire })}</span>
              </div>
              <div className="dip-signature">
                <span>{t('dip.page.signature')}</span>
                {diplome.delivre_par && <small>{diplome.delivre_par}</small>}
              </div>
            </footer>
          </div>
          {diplome.annule && (
            <p className="dip-cancelled" role="status">{t('dip.page.cancelledOn', { date: formatDate(diplome.annule_at, { dateStyle: 'medium' }), motif: diplome.motif_annulation })}</p>
          )}
        </article>
      )}
    </div>
  )
}
