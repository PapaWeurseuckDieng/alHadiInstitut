import { createContext, useContext } from 'react'

/**
 * Fenêtres de confirmation et d'alerte de l'application (remplacent window.confirm / window.alert).
 * Fournies par <DialogsProvider> (voir DialogsProvider.jsx), utilisées avec useDialogs().
 */
export const DialogsContext = createContext(null)

/**
 * @example
 *   const { confirm, alert } = useDialogs()
 *   if (!(await confirm({ title: 'Archiver ?', message: '…', confirmLabel: 'Archiver', tone: 'danger' }))) return
 *   const motif = await confirm({ title: 'Motif', input: { label: 'Motif', required: true } }) // texte ou false
 *   await alert({ title: 'Impossible', message: '…', tone: 'danger' })
 *
 * @returns {{
 *   confirm: (options: DialogOptions) => Promise<boolean|string>,
 *   alert: (options: DialogOptions) => Promise<true>,
 * }}
 * @typedef {{ title: string, message?: string, confirmLabel?: string, cancelLabel?: string,
 *   tone?: 'primary'|'danger'|'warning'|'success', details?: string[],
 *   input?: { label: string, required?: boolean, minLength?: number, maxLength?: number, placeholder?: string, multiline?: boolean } }} DialogOptions
 */
export function useDialogs() {
  const context = useContext(DialogsContext)
  if (!context) throw new Error('useDialogs() doit être utilisé sous <DialogsProvider>.')
  return context
}
