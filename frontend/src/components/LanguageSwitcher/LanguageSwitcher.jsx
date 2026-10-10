import { LANGUAGES } from '../../i18n/i18n'
import { useI18n } from '../../i18n/useI18n'
import './LanguageSwitcher.css'

/**
 * Bouton de changement de langue (français <-> arabe).
 * Il affiche le nom de l'autre langue, écrit dans cette langue (« العربية » / « Français »).
 *
 * @param {{ variant?: 'default' | 'light', compact?: boolean, className?: string }} props
 *   variant « light » : texte blanc, pour un fond vert (bandeau, menu).
 *   compact : affiche seulement l'abréviation (« ع » / « FR ») ; le nom complet reste lu par les lecteurs d'écran.
 */
export default function LanguageSwitcher({ variant = 'default', compact = false, className = '' }) {
  const { lang, t, setLanguage } = useI18n()

  // Avec deux langues, on propose simplement l'autre
  const other = Object.values(LANGUAGES).find((language) => language.code !== lang)

  return (
    <button
      type="button"
      className={`lang-switch lang-switch--${variant} ${compact ? 'lang-switch--compact' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      onClick={() => setLanguage(other.code)}
      title={t('common.changeLanguage')}
    >
      <IconeGlobe />
      {/* lang/dir : bonne prononciation par les lecteurs d'écran et bon sens d'écriture */}
      <span className="lang-switch__label" lang={other.code} dir={other.dir}>{other.label}</span>
      <span className="lang-switch__short" lang={other.code} aria-hidden="true">{other.short}</span>
    </button>
  )
}

/** Icône globe (décorative). */
function IconeGlobe() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3Z" />
    </svg>
  )
}
