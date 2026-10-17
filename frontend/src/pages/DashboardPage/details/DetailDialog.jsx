import { useEffect, useRef } from 'react'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import './Details.css'

/**
 * Cadre commun des fenêtres de détail (élève, compte, classe) :
 * en-tête avec titre et fermeture, corps qui défile, boutons en bas.
 *
 * Le pied de page doit être enveloppé dans un fragment avec une clé par mode (consultation /
 * modification) : sinon React réutilise le bouton « Modifier » pour « Enregistrer » (type submit)
 * pendant le clic, et le navigateur envoie aussitôt le formulaire.
 *
 * @param {{ icon: string, title: string, subtitle?: React.ReactNode, busy?: boolean, onClose: () => void,
 *           notice?: string, footer: React.ReactNode, children: React.ReactNode }} props
 *   notice : confirmation affichée dans la fenêtre (la page derrière est inactive tant qu'elle est ouverte)
 */
export default function DetailDialog({ icon, title, subtitle, busy = false, onClose, notice, footer, children }) {
  const { t } = useI18n()
  const dialog = useRef(null)

  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => node.close()
  }, [])

  return (
    <dialog ref={dialog} className="db-dialog detail-dialog" aria-labelledby="detail-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
      <div className="db-dialog-heading">
        <span className="db-dialog-icon"><Icon name={icon} /></span>
        <div>
          <h2 id="detail-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button type="button" className="db-icon-button" aria-label={t('form.close')} disabled={busy} onClick={onClose}><Icon name="close" /></button>
      </div>
      <div className="db-dialog-body">
        {notice && <div className="db-alert db-alert--success" role="status"><Icon name="check" /><span>{notice}</span></div>}
        {children}
      </div>
      <div className="db-dialog-footer">{footer}</div>
    </dialog>
  )
}

/** Liste « libellé : valeur » d'une fiche (valeur vide → « Non renseigné »). */
export function InfoList({ items }) {
  const { t } = useI18n()
  return (
    <dl className="detail-info">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value === null || value === undefined || value === '' ? <span className="db-muted-text">{t('dash.table.notProvided')}</span> : value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Champ de formulaire simple (texte, date, liste) avec libellé et erreur du serveur. */
export function DetailField({ id, label, error, required = false, children }) {
  return (
    <div className="db-field">
      <label htmlFor={id}>{label}{required && <span className="db-required" aria-hidden="true"> *</span>}</label>
      {children}
      {error && <small className="db-field-error" id={`${id}-error`}>{error}</small>}
    </div>
  )
}
