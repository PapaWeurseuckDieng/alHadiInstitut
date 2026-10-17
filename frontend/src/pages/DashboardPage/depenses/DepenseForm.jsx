import { useEffect, useRef, useState } from 'react'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { createDepense, updateDepense } from '../../../services/depensesService'

/** Date du jour au format AAAA-MM-JJ (heure locale). */
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Fenêtre « Nouvelle dépense » ou « Corriger la dépense » (dépense encore en attente).
 * @param {{ depense: object|null, categories: string[], modes: string[], onClose: () => void,
 *           onSaved: (message: string) => void, onSessionExpired: () => void }} props
 *   depense : null pour une nouvelle dépense
 */
export default function DepenseForm({ depense, categories, modes, onClose, onSaved, onSessionExpired }) {
  const { t, serverMessage } = useI18n()
  const dialog = useRef(null)
  const sending = useRef(false)
  const [values, setValues] = useState({
    categorie: depense?.categorie ?? '',
    montant: depense ? String(depense.montant) : '',
    date_depense: depense?.date_depense ?? today(),
    mode_paiement: depense?.mode_paiement ?? 'especes',
    beneficiaire: depense?.beneficiaire ?? '',
    description: depense?.description ?? '',
  })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => node.close()
  }, [])

  function change(event) {
    const { name, value } = event.target
    setValues(previous => ({ ...previous, [name]: value }))
    setErrors(previous => ({ ...previous, [name]: undefined }))
  }

  async function submit(event) {
    event.preventDefault()
    if (sending.current) return

    // Contrôles avant envoi (le serveur vérifie aussi)
    const local = {}
    if (!values.categorie) local.categorie = t('dep.form.categoryRequired')
    if (!(Number(values.montant) > 0)) local.montant = t('dep.form.amountRequired')
    if (values.categorie === 'autre' && !values.description.trim()) local.description = t('dep.form.descriptionRequired')
    if (Object.keys(local).length) { setErrors(local); return }

    sending.current = true
    setBusy(true)
    setMessage('')
    const body = {
      categorie: values.categorie,
      montant: Number(values.montant),
      date_depense: values.date_depense,
      mode_paiement: values.mode_paiement || null,
      beneficiaire: values.beneficiaire.trim() || null,
      description: values.description.trim() || null,
    }
    try {
      const response = depense ? await updateDepense(depense.id, body) : await createDepense(body)
      onSaved(serverMessage(response.message, depense ? 200 : 201, { fallback: 'original' }))
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      setErrors(Object.fromEntries(Object.entries(err.errors || {}).map(([key, messages]) => [key, serverMessage(messages[0], 422, { fallback: 'original' })])))
      setMessage(err.status ? serverMessage(err.message, err.status) : err.message)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  /** Champ avec libellé et message d'erreur. */
  const fieldProps = name => ({
    id: `dep-${name}`,
    name,
    value: values[name],
    onChange: change,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `dep-${name}-error` : undefined,
  })
  const fieldError = name => errors[name] && <small className="db-field-error" id={`dep-${name}-error`}>{errors[name]}</small>
  const required = <span className="db-required" aria-hidden="true"> *</span>

  return (
    <dialog ref={dialog} className="db-dialog pay-dialog" aria-labelledby="dep-form-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
      <div className="db-dialog-heading">
        <span className="db-dialog-icon"><Icon name="expense" /></span>
        <div>
          <h2 id="dep-form-title">{depense ? t('dep.form.editTitle') : t('dep.form.title')}</h2>
          <p>{t('dep.form.text')}</p>
        </div>
        <button type="button" className="db-icon-button" aria-label={t('form.close')} disabled={busy} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>

      {/* noValidate : nos propres messages (traduits) remplacent les bulles du navigateur */}
      <form onSubmit={submit} noValidate>
        <div className="db-dialog-body">
          <fieldset className="db-dialog-fields" disabled={busy}>
            {message && <div className="db-alert db-alert--error" role="alert"><strong>{message}</strong></div>}

            <div className="db-form-grid">
              <div className="db-field">
                <label htmlFor="dep-categorie">{t('dep.form.category')}{required}</label>
                <select {...fieldProps('categorie')} required>
                  <option value="">{t('form.options.select')}</option>
                  {categories.map(value => <option key={value} value={value}>{t(`dep.categories.${value}`)}</option>)}
                </select>
                {fieldError('categorie')}
              </div>

              <div className="db-field">
                <label htmlFor="dep-montant">{t('dep.form.amount')}{required}</label>
                <input {...fieldProps('montant')} type="number" inputMode="numeric" min="1" step="1" required />
                {fieldError('montant')}
              </div>

              <div className="db-field">
                <label htmlFor="dep-date_depense">{t('dep.form.date')}</label>
                <input {...fieldProps('date_depense')} type="date" max={today()} />
                {fieldError('date_depense')}
              </div>

              <div className="db-field">
                <label htmlFor="dep-mode_paiement">{t('pay.form.mode')}</label>
                <select {...fieldProps('mode_paiement')}>
                  {modes.map(mode => <option key={mode} value={mode}>{t(`pay.modes.${mode}`)}</option>)}
                </select>
              </div>
            </div>

            <div className="db-field">
              <label htmlFor="dep-beneficiaire">{t('dep.form.beneficiary')}</label>
              <input {...fieldProps('beneficiaire')} maxLength={120} placeholder={t('dep.form.beneficiaryPlaceholder')} />
              {fieldError('beneficiaire')}
            </div>

            <div className="db-field">
              <label htmlFor="dep-description">{t('dep.form.description')}{values.categorie === 'autre' && required}</label>
              <textarea {...fieldProps('description')} rows={3} maxLength={1000} placeholder={t('dep.form.descriptionPlaceholder')} />
              {fieldError('description')}
            </div>

            <div className="db-callout">
              <Icon name="shield" />
              <span>{t('dep.form.pendingNote')}</span>
            </div>
          </fieldset>
        </div>

        <div className="db-dialog-footer">
          <button type="button" className="db-button db-button--secondary" disabled={busy} onClick={onClose}>{t('form.cancel')}</button>
          <button className="db-button" disabled={busy} aria-busy={busy}>
            {busy ? t('form.saving') : t('dep.form.save')}<Icon name="check" size={17} />
          </button>
        </div>
      </form>
    </dialog>
  )
}
