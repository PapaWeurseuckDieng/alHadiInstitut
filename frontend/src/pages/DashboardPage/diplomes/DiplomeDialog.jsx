import { useEffect, useRef, useState } from 'react'
import Avatar from '../../../components/Avatar'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { MENTIONS_DIPLOME, TYPES_DIPLOME, createDiplome, searchEleves, updateDiplome } from '../../../services/diplomesService'
import '../../../components/TuteurPicker/TuteurPicker.css'
import { DetailField } from '../details/DetailDialog'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Délivrance (diplome = null : recherche de l'élève) ou correction d'un diplôme.
 * Après une délivrance, la fenêtre affiche le lien d'impression ; « Terminer » recharge la liste.
 *
 * @param {{ diplome: object|null, onClose: () => void, onSaved: (message: string) => void, onSessionExpired: () => void }} props
 */
export default function DiplomeDialog({ diplome, onClose, onSaved, onSessionExpired }) {
  const { t, serverMessage } = useI18n()
  const dialog = useRef(null)
  const [eleve, setEleve] = useState(diplome?.eleve ?? null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [values, setValues] = useState({
    type: diplome?.type ?? 'hifz_partiel',
    mention: diplome?.mention ?? '',
    intitule: diplome?.intitule ?? '',
    date_obtention: diplome?.date_obtention ?? today(),
    observations: diplome?.observations ?? '',
  })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  // Diplôme délivré : lien d'impression
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => node.close()
  }, [])

  // Recherche de l'élève (délivrance) : 300 ms après la dernière frappe
  useEffect(() => {
    const term = query.trim()
    if (diplome || term.length < 2) return
    let cancelled = false
    const timer = setTimeout(() => {
      searchEleves(term)
        .then(list => { if (!cancelled) setResults(list) })
        .catch(err => { if (!cancelled && err.status === 401) onSessionExpired() })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, diplome, onSessionExpired])

  const change = event => setValues(previous => ({ ...previous, [event.target.name]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    if (!eleve) { setErrors({ eleve: t('dip.chooseStudent') }); return }
    setBusy(true)
    setErrors({})
    setMessage('')
    const body = {
      type: values.type,
      mention: values.mention || null,
      intitule: values.intitule.trim() || null,
      date_obtention: values.date_obtention,
      observations: values.observations.trim() || null,
    }
    try {
      const response = diplome ? await updateDiplome(diplome.id, body) : await createDiplome(eleve.id, body)
      const text = serverMessage(response.message, 200, { fallback: 'original' })
      if (diplome) onSaved(text)
      else setSuccess({ text, diplome: response.data })
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      setErrors(Object.fromEntries(Object.entries(err.errors || {}).map(([key, messages]) => [key, serverMessage(messages[0], 422, { fallback: 'original' })])))
      setMessage(serverMessage(Object.values(err.errors || {})[0]?.[0] || err.message, err.status || 0, { fallback: 'original' }))
    } finally {
      setBusy(false)
    }
  }

  const close = () => (success ? onSaved(success.text) : onClose())

  return (
    <dialog ref={dialog} className="db-dialog" aria-labelledby="dip-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) close() }}>
      <div className="db-dialog-heading">
        <span className="db-dialog-icon"><Icon name={success ? 'check' : 'award'} /></span>
        <div>
          <h2 id="dip-dialog-title">{success ? t('dip.deliveredTitle') : diplome ? t('dip.editTitle', { numero: diplome.numero }) : t('dip.deliver')}</h2>
          <p>{success ? success.text : t('dip.dialogText')}</p>
        </div>
        <button type="button" className="db-icon-button" aria-label={t('form.close')} disabled={busy} onClick={close}><Icon name="close" /></button>
      </div>

      {success ? (
        <>
          <div className="db-dialog-body">
            <div className="pay-success">
              <span className="pay-success-icon" aria-hidden="true"><Icon name="award" size={28} /></span>
              <p className="pay-success-amount">{success.diplome.intitule}</p>
              <p>{success.diplome.eleve.prenom} {success.diplome.eleve.nom} · <bdi>{success.diplome.numero}</bdi></p>
              <a className="db-button" href={`/diplomes/${success.diplome.id}`} target="_blank" rel="noopener noreferrer">
                <Icon name="printer" size={16} />{t('dip.printNumber', { numero: success.diplome.numero })}
              </a>
            </div>
          </div>
          <div className="db-dialog-footer">
            <button type="button" className="db-button db-button--secondary" onClick={close}>{t('form.payment.done')}</button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="db-dialog-body">
            <fieldset className="db-dialog-fields" disabled={busy}>
              {message && <div className="db-alert db-alert--error" role="alert"><strong>{message}</strong></div>}

              {/* ---------- Élève ---------- */}
              {eleve ? (
                <div className="tp-selected dip-student">
                  <Avatar person={eleve} />
                  <span className="tp-person"><strong>{eleve.prenom} {eleve.nom}</strong><small><bdi>{eleve.matricule}</bdi></small></span>
                  {!diplome && <button type="button" className="db-text-button" onClick={() => { setEleve(null); setResults(null) }}>{t('tutorPicker.change')}</button>}
                </div>
              ) : (
                <DetailField id="dip-eleve" label={t('dip.fields.student')} required error={errors.eleve}>
                  <input id="dip-eleve" type="search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('dip.studentPlaceholder')} />
                  {query.trim().length >= 2 && results && (
                    <ul className="dip-results" aria-label={t('dip.results')}>
                      {results.length === 0 && <li className="db-muted-text">{t('dip.noStudent')}</li>}
                      {results.map(result => (
                        <li key={result.id}>
                          <button type="button" className="db-person db-person-link" onClick={() => { setEleve(result); setErrors({}) }}>
                            <Avatar person={result} />
                            <span><strong>{result.prenom} {result.nom}</strong><small><bdi>{result.matricule}</bdi>{result.inscriptions?.[0]?.classe ? ` · ${result.inscriptions[0].classe}` : ''}</small></span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </DetailField>
              )}

              {/* ---------- Diplôme ---------- */}
              <div className="db-form-grid">
                <DetailField id="dip-form-type" label={t('dip.fields.type')} required error={errors.type}>
                  <select id="dip-form-type" name="type" value={values.type} onChange={change}>
                    {TYPES_DIPLOME.map(type => <option key={type} value={type}>{t(`dip.types.${type}`)}</option>)}
                  </select>
                </DetailField>
                <DetailField id="dip-form-mention" label={t('dip.fields.mention')} error={errors.mention}>
                  <select id="dip-form-mention" name="mention" value={values.mention} onChange={change}>
                    <option value="">{t('dip.noMention')}</option>
                    {MENTIONS_DIPLOME.map(mention => <option key={mention} value={mention}>{t(`dip.mentions.${mention}`)}</option>)}
                  </select>
                </DetailField>
                <DetailField id="dip-form-intitule" label={t('dip.fields.intitule')} error={errors.intitule}>
                  <input id="dip-form-intitule" name="intitule" value={values.intitule} onChange={change} maxLength={160} placeholder={t(`dip.defaultTitles.${values.type}`)} />
                </DetailField>
                <DetailField id="dip-form-date" label={t('dip.fields.date')} required error={errors.date_obtention}>
                  <input id="dip-form-date" name="date_obtention" type="date" max={today()} value={values.date_obtention} onChange={change} />
                </DetailField>
              </div>
              <DetailField id="dip-form-observations" label={t('dip.fields.observations')} error={errors.observations}>
                <textarea id="dip-form-observations" name="observations" rows={2} maxLength={1000} value={values.observations} onChange={change} />
              </DetailField>
            </fieldset>
          </div>
          <div className="db-dialog-footer">
            <button type="button" className="db-button db-button--secondary" disabled={busy} onClick={onClose}>{t('form.cancel')}</button>
            <button type="submit" className="db-button" disabled={busy} aria-busy={busy}>
              {busy ? t('form.saving') : diplome ? t('form.save') : t('dip.deliverSubmit')}<Icon name="check" size={17} />
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
