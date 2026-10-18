import { useEffect, useRef, useState } from 'react'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { rejeterDepense } from '../../../services/depensesService'
import { usePaymentFormat } from '../paiements/usePaymentFormat'

/**
 * Fenêtre « Rejeter la dépense » : le motif est obligatoire. La dépense reste visible, marquée rejetée.
 * @param {{ depense: object, onClose: () => void, onSaved: (message: string) => void, onSessionExpired: () => void }} props
 */
export default function RejectDialog({ depense, onClose, onSaved, onSessionExpired }) {
  const { t, serverMessage } = useI18n()
  const { amount } = usePaymentFormat()
  const dialog = useRef(null)
  const [motif, setMotif] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => node.close()
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (motif.trim().length < 3) { setError(t('dep.reject.reasonRequired')); return }
    setBusy(true)
    setError('')
    try {
      const response = await rejeterDepense(depense.id, motif.trim())
      onSaved(serverMessage(response.message, 200, { fallback: 'original' }))
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      setError(serverMessage(err.errors?.motif?.[0] || err.message, err.status || 0, { fallback: 'original' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialog} className="db-dialog pay-dialog" aria-labelledby="dep-reject-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
      <div className="db-dialog-heading">
        <span className="db-dialog-icon"><Icon name="close" /></span>
        <div>
          <h2 id="dep-reject-title">{t('dep.reject.title')}</h2>
          <p>{t(`dep.categories.${depense.categorie}`)} · {amount(depense.montant)}</p>
        </div>
        <button type="button" className="db-icon-button" aria-label={t('form.close')} disabled={busy} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <form onSubmit={submit} noValidate>
        <div className="db-dialog-body">
          <fieldset className="db-dialog-fields" disabled={busy}>
            <div className="db-field">
              <label htmlFor="dep-reject-reason">{t('dep.reject.reason')}<span className="db-required" aria-hidden="true"> *</span></label>
              <textarea
                id="dep-reject-reason"
                rows={3}
                maxLength={255}
                value={motif}
                onChange={event => { setMotif(event.target.value); setError('') }}
                placeholder={t('dep.reject.placeholder')}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'dep-reject-error' : undefined}
              />
              {error && <small className="db-field-error" id="dep-reject-error">{error}</small>}
            </div>
            <p className="db-form-note">{t('dep.reject.help')}</p>
          </fieldset>
        </div>
        <div className="db-dialog-footer">
          <button type="button" className="db-button db-button--secondary" disabled={busy} onClick={onClose}>{t('form.cancel')}</button>
          <button className="db-button dep-reject-confirm" disabled={busy} aria-busy={busy}>
            {busy ? t('form.saving') : t('dep.reject.confirm')}<Icon name="check" size={17} />
          </button>
        </div>
      </form>
    </dialog>
  )
}
