import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PasswordInput from '../../components/PasswordInput/PasswordInput'
import { login } from '../../services/authService'
import { validateLogin } from './validateLogin'
import './LoginPage.css'

/**
 * Route vers laquelle rediriger après une connexion réussie.
 * Laissée à null tant que le tableau de bord n'existe pas : un message
 * de confirmation s'affiche à la place. À renseigner plus tard (ex. '/tableau-de-bord').
 */
const ROUTE_APRES_CONNEXION = null

const VALEURS_INITIALES = { telephone: '', password: '' }

// Domaines couverts par la plateforme, affichés dans le panneau d'accueil.
const MODULES = ['Suivi coranique', 'Scolarité', 'Internat', 'Finances']

/**
 * Page de connexion : numéro de téléphone + mot de passe.
 *
 * Ordinateur : panneau d'accueil vert à gauche, carte de connexion à droite.
 * Mobile     : bandeau vert en haut, carte par-dessus, le tout tient sans défilement.
 */
export default function LoginPage() {
  const navigate = useNavigate()

  const [valeurs, setValeurs] = useState(VALEURS_INITIALES)
  // Erreurs affichées sous chaque champ (validation locale ou 422 Laravel)
  const [erreursChamps, setErreursChamps] = useState({})
  // Erreur générale affichée en haut du formulaire (401, 403, 429, réseau...)
  const [erreurGenerale, setErreurGenerale] = useState('')
  const [chargement, setChargement] = useState(false)
  // Utilisateur connecté, utilisé pour le message de confirmation
  const [utilisateur, setUtilisateur] = useState(null)

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
      const { user } = await login(valeurs)

      if (ROUTE_APRES_CONNEXION) {
        navigate(ROUTE_APRES_CONNEXION, { replace: true })
      } else {
        setUtilisateur(user)
        setValeurs(VALEURS_INITIALES)
      }
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
        // 401 / 403 / 429 : le backend fournit déjà un message en français.
        setErreurGenerale(erreur.message)
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
            Bienvenue à l'<span className="login__nowrap">Institut Al-Hadi</span>
          </p>
          <span className="login__rule" aria-hidden="true" />
          <p className="login__brand-text">
            Un seul espace pour l'administration, les enseignants, les élèves et les parents.
          </p>
          <ul className="login__modules">
            {MODULES.map((module) => (
              <li key={module} className="login__module">
                {module}
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
            Bienvenue à l'<span className="login__nowrap">Institut Al-Hadi</span>
          </p>
        </div>

        <div className="login__card">
          {/* Logo d'origine, même taille sur ordinateur et mobile.
              Le cadre recadre les marges transparentes du fichier SVG. */}
          <div className="login__logo">
            <img src="/faviconDara.svg" alt="Institut Al-Hadi" className="login__logo-img" />
          </div>

          <h1 className="login__title">Connexion</h1>
          <p className="login__subtitle">Accédez à votre espace avec votre numéro de téléphone.</p>

          {erreurGenerale && (
            <div className="login__alert login__alert--error" role="alert">
              {erreurGenerale}
            </div>
          )}

          {utilisateur && (
            <div className="login__alert login__alert--success" role="status">
              Connexion réussie. Bienvenue, {utilisateur.prenom} {utilisateur.nom}.
            </div>
          )}

          <form className="login__form" onSubmit={handleSubmit} noValidate>
            <div className="login__field">
              <label htmlFor="login-telephone" className="login__label">
                Numéro de téléphone
              </label>
              <div className="login__control">
                <IconeTelephone />
                <input
                  id="login-telephone"
                  name="telephone"
                  type="tel"
                  inputMode="tel"
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
                Mot de passe
              </label>
              <div className="login__control">
                <IconeCadenas />
                <PasswordInput
                  id="login-password"
                  name="password"
                  autoComplete="current-password"
                  className="login__input"
                  placeholder="Votre mot de passe"
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
              {chargement ? 'Connexion en cours…' : 'Se connecter'}
            </button>
          </form>
        </div>

        {/* Pied de page : copyright et crédit développeur */}
        <footer className="login__footer">
          <span className="login__footer-part">© {annee} Institut Al-Hadi.</span>{' '}
          <span className="login__footer-part">
            Développé par{' '}
            <a href="https://xelltekk.com/" target="_blank" rel="noopener noreferrer">
              XELLTEKK
            </a>
          </span>
        </footer>
      </main>
    </div>
  )
}

/** Icône téléphone placée à gauche du champ (décorative). */
function IconeTelephone() {
  return (
    <svg className="login__control-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.5 18h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

/** Icône cadenas placée à gauche du champ mot de passe (décorative). */
function IconeCadenas() {
  return (
    <svg className="login__control-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}