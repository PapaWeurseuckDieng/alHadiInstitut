import { useEffect, useId, useRef, useState } from 'react'
import Icon from '../Icon'
import './ActionMenu.css'

/**
 * Menu « ⋮ » des actions d'une ligne (élève, classe, compte, paiement…).
 * Le menu est en position fixe : il n'est pas coupé par un tableau qui défile.
 * Clavier : Entrée/Espace ouvre, flèches haut/bas, Échap ferme et rend le focus au bouton.
 *
 * @param {{ label: string, items: Array<{ key: string, label: string, icon?: string, onSelect: () => void,
 *           danger?: boolean, disabled?: boolean, hidden?: boolean }> }} props
 *   label : nom accessible du bouton, ex. « Actions pour Awa Ndiaye »
 */
export default function ActionMenu({ label, items }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const button = useRef(null)
  const menu = useRef(null)
  const id = useId()
  const visible = items.filter(item => !item.hidden)

  /** Ouvre le menu sous le bouton (ou au-dessus s'il manque de place), aligné sur son bord de fin. */
  function toggle() {
    if (open) { setOpen(false); return }
    const rect = button.current.getBoundingClientRect()
    const height = visible.length * 40 + 14
    const rtl = document.documentElement.dir === 'rtl'
    const below = rect.bottom + 6 + height <= window.innerHeight
    setPosition({
      top: below ? rect.bottom + 6 : Math.max(8, rect.top - 6 - height),
      ...(rtl ? { left: Math.max(8, rect.left) } : { right: Math.max(8, window.innerWidth - rect.right) }),
    })
    setOpen(true)
  }

  // Fermeture : clic ailleurs, défilement, redimensionnement
  useEffect(() => {
    if (!open) return
    const close = event => {
      if (event.type === 'mousedown' && (menu.current?.contains(event.target) || button.current?.contains(event.target))) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    menu.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus()
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  function onKeyDown(event) {
    const entries = [...menu.current.querySelectorAll('[role="menuitem"]:not(:disabled)')]
    const index = entries.indexOf(document.activeElement)
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current.focus() }
    if (event.key === 'ArrowDown') { event.preventDefault(); entries[(index + 1) % entries.length]?.focus() }
    if (event.key === 'ArrowUp') { event.preventDefault(); entries[(index - 1 + entries.length) % entries.length]?.focus() }
    if (event.key === 'Tab') setOpen(false)
  }

  if (!visible.length) return null

  return (
    <span className="action-menu">
      <button
        ref={button}
        type="button"
        className="action-menu-button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={toggle}
      >
        <Icon name="dots" size={18} />
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={label}
          className="action-menu-list"
          style={position}
          onKeyDown={onKeyDown}
        >
          {visible.map(item => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`action-menu-item ${item.danger ? 'action-menu-item--danger' : ''}`}
              disabled={item.disabled}
              onClick={() => { setOpen(false); item.onSelect() }}
            >
              {item.icon && <Icon name={item.icon} size={16} />}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
