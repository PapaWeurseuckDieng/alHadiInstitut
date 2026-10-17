import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icon'
import { useI18n } from '../../i18n/useI18n'
import { DialogsContext } from './dialogsContext'
import './Dialogs.css'

const ICONS = { danger: 'shield', warning: 'shield', success: 'check', primary: 'check' }

/**
 * Une fenêtre de confirmation ou d'alerte à la fois, au-dessus de tout (même d'une autre fenêtre
 * ouverte : <dialog> modale placée dans la couche supérieure du navigateur).
 */
function DialogBox({ request, onDone }) {
  const { t } = useI18n()
  const node = useRef(null)
  const field = useRef(null)
  const [value, setValue] = useState('')
  const { kind, options } = request
  const tone = options.tone ?? 'primary'
  const input = options.input
  const invalid = input && ((input.required && !value.trim()) || (input.minLength && value.trim().length < input.minLength))

  useEffect(() => {
    const dialog = node.current
    dialog.showModal()
    // Focus : champ à remplir, sinon le bouton principal (Entrée confirme), « Annuler » pour une action dangereuse
    requestAnimationFrame(() => {
      if (field.current) field.current.focus()
      else dialog.querySelector(tone === 'danger' && kind === 'confirm' ? '[data-dialog-cancel]' : '[data-dialog-confirm]')?.focus()
    })
    return () => dialog.close()
  }, [kind, tone])

  function submit(event) {
    event.preventDefault()
    if (invalid) return
    onDone(input ? value.trim() : true)
  }

  return (
    <dialog
      ref={node}
      className={`db-dialog app-dialog app-dialog--${tone}`}
      aria-labelledby="app-dialog-title"
      aria-describedby={options.message ? 'app-dialog-message' : undefined}
      role={kind === 'alert' ? 'alertdialog' : 'dialog'}
      onCancel={event => { event.preventDefault(); onDone(kind === 'alert' ? true : false) }}
    >
      <form onSubmit={submit}>
        <div className="app-dialog-body">
          <span className="app-dialog-icon" aria-hidden="true"><Icon name={ICONS[tone] ?? 'check'} size={24} /></span>
          <div className="app-dialog-text">
            <h2 id="app-dialog-title">{options.title}</h2>
            {options.message && <p id="app-dialog-message">{options.message}</p>}
            {options.details?.length > 0 && <ul>{options.details.map(line => <li key={line}>{line}</li>)}</ul>}
            {input && (
              <div className="db-field app-dialog-field">
                <label htmlFor="app-dialog-input">{input.label}{input.required && <span className="db-required" aria-hidden="true"> *</span>}</label>
                {input.multiline ? (
                  <textarea id="app-dialog-input" ref={field} rows={3} value={value} maxLength={input.maxLength ?? 255} placeholder={input.placeholder} onChange={event => setValue(event.target.value)} />
                ) : (
                  <input id="app-dialog-input" ref={field} value={value} maxLength={input.maxLength ?? 255} placeholder={input.placeholder} onChange={event => setValue(event.target.value)} />
                )}
              </div>
            )}
          </div>
        </div>
        <div className="db-dialog-footer">
          {kind === 'confirm' && (
            <button type="button" data-dialog-cancel className="db-button db-button--secondary" onClick={() => onDone(false)}>
              {options.cancelLabel ?? t('dialogs.cancel')}
            </button>
          )}
          <button type="submit" data-dialog-confirm className={`db-button app-dialog-confirm--${tone}`} disabled={Boolean(invalid)}>
            {options.confirmLabel ?? (kind === 'alert' ? t('dialogs.ok') : t('dialogs.confirm'))}
          </button>
        </div>
      </form>
    </dialog>
  )
}

/** Fournit confirm() et alert() à toute l'application (monté une fois dans App.jsx). */
export default function DialogsProvider({ children }) {
  // File d'attente : une demande affichée à la fois
  const [queue, setQueue] = useState([])

  const open = useCallback((kind, options) => new Promise(resolve => {
    setQueue(previous => [...previous, { id: Math.random(), kind, options, resolve }])
  }), [])

  const value = useMemo(() => ({
    confirm: options => open('confirm', options),
    alert: options => open('alert', options),
  }), [open])

  const current = queue[0]
  function done(result) {
    current.resolve(result)
    setQueue(previous => previous.slice(1))
  }

  return (
    <DialogsContext.Provider value={value}>
      {children}
      {current && <DialogBox key={current.id} request={current} onDone={done} />}
    </DialogsContext.Provider>
  )
}
