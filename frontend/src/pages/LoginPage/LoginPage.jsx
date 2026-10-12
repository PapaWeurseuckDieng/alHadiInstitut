import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import LanguageSwitcher from '../../components/LanguageSwitcher/LanguageSwitcher'
import PasswordInput from '../../components/PasswordInput/PasswordInput'
import { useI18n } from '../../i18n/useI18n'
import { login } from '../../services/authService'
import { validateLogin } from './validateLogin'
import './LoginPage.css'

const VALEURS_INITIALES = { telephone: '', password: '' }

// Domaines couverts par la plateforme, affichés dans le panneau d'accueil (clés de traduction).
const MODULES = ['dash.sections.eleves', 'dash.sections.classes', 'dash.sections.users']

/**
 * Page de connexion : numéro de téléphone + mot de passe.
 *
 * Ordinateur : panneau d'accueil vert à gauche, carte de connexion à droite.
 * Mobile     : bandeau vert en haut, carte par-dessus, le tout tient sans défilement.
 */
export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t, serverMessage } = useI18n()

  // Message laissé par un autre écran : clé de traduction (ex. mot de passe modifié) ou texte
  const messageInfo = location.state?.messageKey ? t(location.state.messageKey) : location.state?.message

  const [valeurs, setValeurs] = useState(VALEURS_INITIALES)
  // Erreurs affichées sous chaque champ (validation locale ou 422 Laravel)
  const [erreursChamps, setErreursChamps] = useState({})
  // Erreur générale affichée en haut du formulaire (401, 403, 429, réseau...)
  const [erreurGenerale, setErreurGenerale] = useState('')
  const [chargement, setChargement] = useState(false)

  // Verrou synchrone : bloque un double envoi avant même que l'état ne se mette à jour.
  const envoiEnCours = useRef(false)

  const annee = new Date().getFullYear()

  /*
   * Bloque le défilement de la page (et l'effet « élastique » sur iPhone)
   * tant que la page de connexion est affichée. La classe est retirée
   * en quittant la page pour ne pas impacter les autres écrans.
   * Le blocage ne s'applique que sur mobile (voir LoginPage.css).
   */
  useEffect(() => {
    document.documentElement.classList.add('login-sans-defilement')
    return () => document.documentElement.classList.remove('login-sans-defilement')
  }, [])

  /** Met à jour un champ et efface son erreur dès que l'utilisateur corrige. */
  function handleChange(event) {
    const { name, value } = event.target
    setValeurs((prev) => ({ ...prev, [name]: value }))
    if (erreursChamps[name]) {
      setErreursChamps((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  /** Place le curseur dans le premier champ en erreur (accessibilité clavier). */
  function focusPremiereErreur(erreurs) {
    const premier = ['telephone', 'password'].find((champ) => erreurs[champ])
    if (premier) document.getElementById(`login-${premier}`)?.focus()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (envoiEnCours.current) return

    setErreurGenerale('')

    // 1. Validation locale : on n'appelle pas l'API si un champ est vide.
    const erreurs = validateLogin(valeurs)
    setErreursChamps(erreurs)
    if (Object.keys(erreurs).length > 0) {
      focusPremiereErreur(erreurs)
      return
    }

    // 2. Appel API
    envoiEnCours.current = true
    setChargement(true)
    try {
      await login(valeurs)
      navigate('/tableau-de-bord', { replace: true })
    } catch (erreur) {
      if (erreur.status === 422) {
        // Erreurs de validation Laravel : on garde le premier message de chaque champ.
        const erreursServeur = {
          telephone: erreur.errors?.telephone?.[0],
          password: erreur.errors?.password?.[0],
        }
        setErreursChamps(erreursServeur)
        focusPremiereErreur(erreursServeur)
      } else {
        // 401 / 403 / 429 : message du backend (en français), traduit si l'interface est en arabe.
        setErreurGenerale(erreur.status ? serverMessage(erreur.message, erreur.status) : erreur.message)
      }
      // Par sécurité, on vide le mot de passe après un échec.
      setValeurs((prev) => ({ ...prev, password: '' }))
    } finally {
      envoiEnCours.current = false
      setChargement(false)
    }
  }

  return (
    <div className="login">
      {/* ---------- Panneau d'accueil (ordinateur et tablette paysage) ---------- */}
      <aside className="login__brand">
        <div className="login__brand-content">
          <p className="login__brand-title">
            {t('login.welcome')}<span className="login__nowrap">{t('common.instituteName')}</span>
          </p>
          <span className="login__rule" aria-hidden="true" />
          <p className="login__brand-text">
            {t('login.brandText')}
          </p>
          <ul className="login__modules">
            {MODULES.map((module) => (
              <li key={module} className="login__module">
                {t(module)}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* ---------- Zone de connexion ---------- */}
      <main className="login__main">
        {/* Bandeau affiché uniquement sur mobile (le message n'apparaît que sur les grands téléphones) */}
        <div className="login__band" aria-hidden="true">
          <p className="login__band-title">
            {t('login.welcome')}<span className="login__nowrap">{t('common.instituteName')}</span>
          </p>
        </div>

        <div className="login__card">
          {/* Choix de la langue : coin supérieur de la carte (en fin de ligne : à droite en français, à gauche en arabe) */}
          <LanguageSwitcher className="login__lang" />

          {/* Logo d'origine, même taille sur ordinateur et mobile.
              Le cadre recadre les marges transparentes du fichier SVG. */}
          <div className="login__logo">
            <img src="/faviconDara.svg" alt={t('common.instituteName')} className="login__logo-img" />
          </div>

          <h1 className="login__title">{t('login.title')}</h1>
          <p className="login__subtitle">{t('login.subtitle')}</p>

          {erreurGenerale && (
            <div className="login__alert login__alert--error" role="alert">
              {erreurGenerale}
            </div>
          )}

          {messageInfo && (
            <div className="login__alert login__alert--success" role="status">
              {messageInfo}
            </div>
          )}

          <form className="login__form" onSubmit={handleSubmit} noValidate>
            <div className="login__field">
              <label htmlFor="login-telephone" className="login__label">
                {t('login.phone')}
              </label>
              <div className="login__control">
                <IconeTelephone />
                <input
                  id="login-telephone"
                  name="telephone"
                  type="tel"
                  inputMode="tel"
                  dir="ltr" /* un numéro se lit toujours de gauche à droite, même en arabe */
                  autoComplete="username"
                  className="login__input"
                  placeholder="77 123 45 67"
                  value={valeurs.telephone}
                  onChange={handleChange}
                  disabled={chargement}
                  aria-invalid={Boolean(erreursChamps.telephone)}
                  aria-describedby={erreursChamps.telephone ? 'login-telephone-error' : undefined}
                />
              </div>
              {erreursChamps.telephone && (
                <p id="login-telephone-error" className="login__field-error">
                  {erreursChamps.telephone}
                </p>
              )}
            </div>

            <div className="login__field">
              <label htmlFor="login-password" className="login__label">
                {t('login.password')}
              </label>
              <div className="login__control">
                <IconeCadenas />
                <PasswordInput
                  id="login-password"
                  name="password"
                  autoComplete="current-password"
                  className="login__input"
                  placeholder={t('login.passwordPlaceholder')}
                  value={valeurs.password}
                  onChange={handleChange}
                  disabled={chargement}
                  aria-invalid={Boolean(erreursChamps.password)}
                  aria-describedby={erreursChamps.password ? 'login-password-error' : undefined}
                />
              </div>
              {erreursChamps.password && (
                <p id="login-password-error" className="login__field-error">
                  {erreursChamps.password}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="login__submit"
              disabled={chargement}
              aria-busy={chargement}
            >
              {chargement && <span className="login__spinner" aria-hidden="true" />}
              {chargement ? t('login.submitting') : t('login.submit')}
            </button>
          </form>
        </div>

        {/* Pied de page : copyright et crédit développeur */}
        <footer className="login__footer">
          <span className="login__footer-part">© {annee} {t('common.instituteName')}.</span>{' '}
          <span className="login__footer-part">
            {t('common.developedBy')}{' '}
            <a href="https://xelltekk.com/" target="_blank" rel="noopener noreferrer">
              XELLTEKK
            </a>
          </span>
        </footer>
      </main>
    </div>
  )
}

/** Icône téléphone placée au début du champ (décorative). */
function IconeTelephone() {
  return (
    <svg className="login__control-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.5 18h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

/** Icône cadenas placée au début du champ mot de passe (décorative). */
function IconeCadenas() {
  return (
    <svg className="login__control-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
