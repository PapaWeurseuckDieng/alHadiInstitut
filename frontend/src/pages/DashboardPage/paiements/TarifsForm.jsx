import { useEffect, useRef, useState } from 'react'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { getTarifs, updateTarifs } from '../../../services/paiementsService'
import { usePaymentFormat } from './usePaymentFormat'

/**
 * Fenêtre « Mensualités par classe » : montant mensuel de chaque classe de l'année en cours.
 * Un champ vide applique le tarif par défaut (configuré côté serveur).
 */
export default function TarifsForm({ onClose, onSaved, onSessionExpired }) {
  const { t, serverMessage, formatNumber } = useI18n()
  const { amount } = usePaymentFormat()
  const dialog = useRef(null)
  const [data, setData] = useState(null)
  // Valeurs saisies par classe : { [classeId]: '15000' | '' }
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => node.close()
  }, [])

  // Chargement des tarifs actuels
  useEffect(() => {
    let cancelled = false
    getTarifs()
      .then(response => {
        if (cancelled) return
        setData(response)
        setValues(Object.fromEntries(response.classes.map(c => [c.id, c.mensualite === null ? '' : String(c.mensualite)])))
      })
      .catch(err => {
        if (cancelled) return
        if (err.status === 401) { onSessionExpired(); return }
        setError(err.status ? serverMessage(err.message, err.status) : err.message)
      })
    return () => { cancelled = true }
  }, [onSessionExpired, serverMessage])

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await updateTarifs(data.classes.map(c => ({
        classe_id: c.id,
        mensualite: values[c.id] === '' ? null : Number(values[c.id]),
      })))
      onSaved(serverMessage(response.message, 200, { fallback: 'original' }))
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      setError(err.status ? serverMessage(err.message, err.status) : err.message)
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialog} className="db-dialog pay-dialog" aria-labelledby="tarifs-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
      <div className="db-dialog-heading">
        <span className="db-dialog-icon"><Icon name="settings" /></span>
        <div>
          <h2 id="tarifs-title">{t('pay.tarifs.title')}</h2>
          <p>{data ? t('pay.tarifs.text', { amount: amount(data.defaut) }) : t('dash.loading')}</p>
        </div>
        <button type="button" className="db-icon-button" aria-label={t('form.close')} disabled={busy} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>

      <form onSubmit={submit}>
        <div className="db-dialog-body">
          <fieldset className="db-dialog-fields" disabled={busy || !data}>
            {error && <div className="db-alert db-alert--error" role="alert"><strong>{error}</strong></div>}
            {data && !data.classes.length && <p className="db-form-note">{t('pay.tarifs.empty')}</p>}
            {data?.classes.map(classe => (
              <div className="pay-tarif" key={classe.id}>
                <label htmlFor={`tarif-${classe.id}`}>
                  <strong>{classe.nom}</strong>
                  <small>{classe.niveau}</small>
                </label>
                <div className="pay-amount-field">
                  <input
                    id={`tarif-${classe.id}`}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="500"
                    placeholder={`${formatNumber(data.defaut)} (${t('pay.tarifs.placeholder')})`}
                    value={values[classe.id] ?? ''}
                    onChange={event => setValues(v => ({ ...v, [classe.id]: event.target.value }))}
                  />
                  <span className="pay-currency">FCFA</span>
                </div>
              </div>
            ))}
          </fieldset>
        </div>
        <div className="db-dialog-footer">
          <button type="button" className="db-button db-button--secondary" disabled={busy} onClick={onClose}>{t('form.cancel')}</button>
          <button className="db-button" disabled={busy || !data?.classes.length}>
            {busy ? t('form.saving') : t('pay.tarifs.save')}<Icon name="check" size={17} />
          </button>
        </div>
      </form>
    </dialog>
  )
}
