import { useState } from 'react'
import './PasswordInput.css'

/**
 * Champ mot de passe avec bouton afficher / masquer.
 * Réutilisable ailleurs (changement de mot de passe, création de compte...).
 *
 * Toutes les props non listées (id, name, value, onChange, disabled,
 * autoComplete, aria-*...) sont transmises telles quelles à l'<input>.
 *
 * @param {{ className?: string } & React.InputHTMLAttributes<HTMLInputElement>} props
 */
export default function PasswordInput({ className = '', ...inputProps }) {
  // true = mot de passe lisible en clair
  const [visible, setVisible] = useState(false)

  return (
    <div className="password-input">
      <input
        {...inputProps}
        type={visible ? 'text' : 'password'}
        className={`password-input__field ${className}`.trim()}
      />
      <button
        type="button"
        className="password-input__toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        aria-pressed={visible}
        disabled={inputProps.disabled}
      >
        {visible ? <IconeOeilBarre /> : <IconeOeil />}
      </button>
    </div>
  )
}

/** Icône « afficher » (œil ouvert), dessinée en SVG pour éviter toute dépendance. */
function IconeOeil() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"
        fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

/** Icône « masquer » (œil barré). */
function IconeOeilBarre() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"
        fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
