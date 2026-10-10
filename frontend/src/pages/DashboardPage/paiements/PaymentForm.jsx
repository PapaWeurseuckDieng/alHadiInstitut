import { useEffect, useRef, useState } from 'react'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { createPaiement } from '../../../services/paiementsService'
import { usePaymentFormat } from './usePaymentFormat'

/** Date du jour au format AAAA-MM-JJ (heure locale). */
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Fenêtre « Enregistrer un paiement » : montant reçu au secrétariat pour un élève et un mois.
 * Après l'enregistrement, la fenêtre affiche le numéro du reçu et propose de l'imprimer.
 *
 * @param {{ item: object, mois: string, modes: string[], onClose: () => void, onSaved: (message: string) => void, onSessionExpired: () => void }} props
 *   item : ligne de la liste du mois (élève, montant dû, payé, reste)
 */
export default function PaymentForm({ item, mois, modes, onClose, onSaved, onSessionExpired }) {
  const { t, serverMessage } = useI18n()
  const { amount, monthLabel } = usePaymentFormat()
  const dialog = useRef(null)
  const sending = useRef(false)

  // Montant proposé : le reste à payer
  const [values, setValues] = useState({ montant: String(item.reste), mode_paiement: 'especes', date_paiement: today(), note: '' })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  // Reçu créé : la fenêtre passe à l'étape « succès »
  const [receipt, setReceipt] = useState(null)

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
    const montant = Number(values.montant)
    if (!montant || montant <= 0) { setErrors({ montant: t('pay.form.amountRequired') }); return }
    if (montant > item.reste) { setErrors({ montant: t('pay.form.amountTooHigh', { amount: amount(item.reste) }) }); return }

    sending.current = true
    setBusy(true)
    setMessage('')
    try {
      const response = await createPaiement({
        eleve_id: item.eleve.id,
        mois,
        montant,
        mode_paiement: values.mode_paiement,
        date_paiement: values.date_paiement,
        note: values.note.trim() || null,
      })
      setReceipt(response.data)
      onSaved(`${serverMessage(response.message, 201, { fallback: 'original' })} ${t('pay.form.successText', { numero: response.data.numero_recu, amount: amount(response.data.montant) })}`)
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      // Erreurs de champ du serveur (montant, mois...) : premier message de chaque champ
      setErrors(Object.fromEntries(Object.entries(err.errors || {}).map(([key, messages]) => [key, serverMessage(messages[0], 422, { fallback: 'original' })])))
      setMessage(err.status ? serverMessage(err.message, err.status) : err.message)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialog} className="db-dialog pay-dialog" aria-labelledby="pay-form-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
      <div className="db-dialog-heading">
        <span className="db-dialog-icon"><Icon name="wallet" /></span>
        <div>
          <h2 id="pay-form-title">{receipt ? t('pay.form.successTitle') : t('pay.form.title')}</h2>
          <p>{t('pay.form.text', { month: monthLabel(mois) })}</p>
        </div>
        <button type="button" className="db-icon-button" aria-label={t('form.close')} disabled={busy} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>

      {receipt ? (
        /* ---------- Étape 2 : paiement enregistré ---------- */
        <>
          <div className="db-dialog-body">
            <div className="pay-success">
              <span className="pay-success-icon" aria-hidden="true"><Icon name="check" size={28} /></span>
              <p className="pay-success-amount">{amount(receipt.montant)}</p>
              <p>{item.eleve.prenom} {item.eleve.nom} · {monthLabel(mois)}</p>
              <p className="pay-success-number">{t('pay.form.successText', { numero: receipt.numero_recu, amount: amount(receipt.montant) })}</p>
              {receipt.reste > 0 && <p className="pay-success-rest">{t('pay.form.remaining')} : {amount(receipt.reste)}</p>}
            </div>
          </div>
          <div className="db-dialog-footer">
            <button type="button" className="db-button db-button--secondary" onClick={onClose}>{t('pay.form.close')}</button>
            {/* Clic de l'utilisateur : le nouvel onglet n'est pas bloqué par le navigateur */}
            <a className="db-button" href={`/recus/${receipt.id}`} target="_blank" rel="noopener noreferrer">
              <Icon name="printer" size={17} />{t('pay.form.print')}
            </a>
          </div>
        </>
      ) : (
        /* ---------- Étape 1 : saisie ---------- */
        // noValidate : nos propres messages (traduits) remplacent les bulles du navigateur
        <form onSubmit={submit} noValidate>
          <div className="db-dialog-body">
            <fieldset className="db-dialog-fields" disabled={busy}>
              {message && <div className="db-alert db-alert--error" role="alert"><strong>{message}</strong></div>}

              {/* Rappel de la situation de l'élève pour ce mois */}
              <div className="pay-summary">
                <div className="db-person">
                  <span className="db-avatar" aria-hidden="true">{`${item.eleve.prenom[0] ?? ''}${item.eleve.nom[0] ?? ''}`.toUpperCase()}</span>
                  <span>
                    <strong>{item.eleve.prenom} {item.eleve.nom}</strong>
                    <small><bdi>{item.eleve.matricule}</bdi>{item.classe ? ` · ${item.classe.nom}` : ''}</small>
                  </span>
                </div>
                <dl>
                  <div><dt>{t('pay.form.due')}</dt><dd>{amount(item.montant_du)}</dd></div>
                  <div><dt>{t('pay.form.alreadyPaid')}</dt><dd>{amount(item.montant_paye)}</dd></div>
                  <div className="pay-summary-rest"><dt>{t('pay.form.remaining')}</dt><dd>{amount(item.reste)}</dd></div>
                </dl>
              </div>

              <div className="db-form-grid">
                <div className="db-field">
                  <label htmlFor="pay-amount">{t('pay.form.amount')}<span className="db-required" aria-hidden="true"> *</span></label>
                  <div className="pay-amount-field">
                    <input
                      id="pay-amount"
                      name="montant"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max={item.reste}
                      step="1"
                      required
                      value={values.montant}
                      onChange={change}
                      aria-invalid={Boolean(errors.montant)}
                      aria-describedby={errors.montant ? 'pay-amount-error' : undefined}
                    />
                    <button type="button" className="pay-full" onClick={() => setValues(v => ({ ...v, montant: String(item.reste) }))}>{t('pay.form.full')}</button>
                  </div>
                  {errors.montant && <small className="db-field-error" id="pay-amount-error">{errors.montant}</small>}
                </div>

                <div className="db-field">
                  <label htmlFor="pay-mode">{t('pay.form.mode')}</label>
                  <select id="pay-mode" name="mode_paiement" value={values.mode_paiement} onChange={change}>
                    {modes.map(mode => <option key={mode} value={mode}>{t(`pay.modes.${mode}`)}</option>)}
                  </select>
                </div>

                <div className="db-field">
                  <label htmlFor="pay-date">{t('pay.form.date')}</label>
                  <input id="pay-date" name="date_paiement" type="date" max={today()} value={values.date_paiement} onChange={change} aria-invalid={Boolean(errors.date_paiement)} />
                  {errors.date_paiement && <small className="db-field-error">{errors.date_paiement}</small>}
                </div>

                <div className="db-field">
                  <label htmlFor="pay-note">{t('pay.form.note')}</label>
                  <input id="pay-note" name="note" maxLength={255} placeholder={t('pay.form.notePlaceholder')} value={values.note} onChange={change} />
                </div>
              </div>
            </fieldset>
          </div>

          <div className="db-dialog-footer">
            <button type="button" className="db-button db-button--secondary" disabled={busy} onClick={onClose}>{t('form.cancel')}</button>
            <button className="db-button" disabled={busy} aria-busy={busy}>
              {busy ? t('pay.form.saving') : t('pay.form.save')}<Icon name="check" size={17} />
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
