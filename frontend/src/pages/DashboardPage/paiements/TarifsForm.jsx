import { useEffect, useRef, useState } from 'react'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { getTarifs, updateTarifs } from '../../../services/paiementsService'
import { usePaymentFormat } from './usePaymentFormat'

// Montants fixés par classe : mensualité et frais d'inscription
const CHAMPS = [['mensualite', 'defaut'], ['frais_inscription', 'defaut_frais_inscription']]

/**
 * Fenêtre « Tarifs par classe » : mensualité et frais d'inscription de chaque classe de l'année.
 * Un champ vide applique le montant par défaut (configuré côté serveur).
 * Les frais d'inscription ne sont jamais saisis à l'inscription : c'est ce montant qui est encaissé.
 */
export default function TarifsForm({ onClose, onSaved, onSessionExpired }) {
  const { t, serverMessage, formatNumber } = useI18n()
  const { amount } = usePaymentFormat()
  const dialog = useRef(null)
  const [data, setData] = useState(null)
  // Valeurs saisies : { [classeId]: { mensualite: '15000' | '', frais_inscription: '' } }
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
        setValues(Object.fromEntries(response.classes.map(c => [c.id, Object.fromEntries(CHAMPS.map(([champ]) => [champ, c[champ] === null ? '' : String(c[champ])]))])))
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
        ...Object.fromEntries(CHAMPS.map(([champ]) => [champ, values[c.id][champ] === '' ? null : Number(values[c.id][champ])])),
      })))
      onSaved(serverMessage(response.message, 200, { fallback: 'original' }))
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      setError(err.status ? serverMessage(err.message, err.status) : err.message)
      setBusy(false)
    }
  }

  const setValue = (classeId, champ, value) => setValues(previous => ({ ...previous, [classeId]: { ...previous[classeId], [champ]: value } }))

  return (
    <dialog ref={dialog} className="db-dialog pay-dialog" aria-labelledby="tarifs-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
      <div className="db-dialog-heading">
        <span className="db-dialog-icon"><Icon name="settings" /></span>
        <div>
          <h2 id="tarifs-title">{t('pay.tarifs.title')}</h2>
          <p>{data ? t('pay.tarifs.text', { amount: amount(data.defaut), fees: amount(data.defaut_frais_inscription) }) : t('dash.loading')}</p>
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
              <div className="pay-tarif pay-tarif--double" key={classe.id}>
                <span className="pay-tarif-name">
                  <strong>{classe.nom}</strong>
                  <small>{classe.niveau}</small>
                </span>
                {CHAMPS.map(([champ, defaut]) => (
                  <div className="pay-tarif-field" key={champ}>
                    <label htmlFor={`tarif-${champ}-${classe.id}`}>{t(`pay.tarifs.${champ}`)}</label>
                    <div className="pay-amount-field">
                      <input
                        id={`tarif-${champ}-${classe.id}`}
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="500"
                        placeholder={`${formatNumber(data[defaut])} (${t('pay.tarifs.placeholder')})`}
                        value={values[classe.id]?.[champ] ?? ''}
                        onChange={event => setValue(classe.id, champ, event.target.value)}
                        aria-label={`${t(`pay.tarifs.${champ}`)} · ${classe.nom}`}
                      />
                      <span className="pay-currency">FCFA</span>
                    </div>
                  </div>
                ))}
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
