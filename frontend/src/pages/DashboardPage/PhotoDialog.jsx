import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import PhotoField from '../../components/PhotoField/PhotoField'
import { useI18n } from '../../i18n/useI18n'
import { updatePhoto } from '../../services/dashboardService'

/**
 * Fenêtre « Changer la photo » d'un élève ou d'un compte.
 * @param {{ kind: 'eleve'|'user', record: object, onClose: () => void, onSaved: (message: string) => void, onSessionExpired: () => void }} props
 */
export default function PhotoDialog({ kind, record, onClose, onSaved, onSessionExpired }) {
  const { t, serverMessage } = useI18n()
  const dialog = useRef(null)
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => node.close()
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (!photo || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await updatePhoto(kind, record.id, photo)
      onSaved(serverMessage(response.message, 200, { fallback: 'original' }))
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      const fieldMessage = err.errors?.photo?.[0]
      setError(serverMessage(fieldMessage || err.message, err.status || 0, { fallback: 'original' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialog} className="db-dialog pay-dialog" aria-labelledby="photo-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
      <div className="db-dialog-heading">
        <span className="db-dialog-icon"><Icon name="camera" /></span>
        <div>
          <h2 id="photo-dialog-title">{t('photo.dialogTitle')}</h2>
          <p>{record.prenom} {record.nom}</p>
        </div>
        <button type="button" className="db-icon-button" aria-label={t('form.close')} disabled={busy} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <form onSubmit={submit}>
        <div className="db-dialog-body">
          <fieldset className="db-dialog-fields" disabled={busy}>
            <PhotoField
              label={kind === 'eleve' ? t('photo.studentLabel') : t('photo.accountLabel')}
              value={photo}
              currentUrl={record.photo}
              onChange={setPhoto}
              error={error}
              disabled={busy}
            />
          </fieldset>
        </div>
        <div className="db-dialog-footer">
          <button type="button" className="db-button db-button--secondary" disabled={busy} onClick={onClose}>{t('form.cancel')}</button>
          <button className="db-button" disabled={busy || !photo} aria-busy={busy}>
            {busy ? t('form.saving') : t('photo.save')}<Icon name="check" size={17} />
          </button>
        </div>
      </form>
    </dialog>
  )
}
