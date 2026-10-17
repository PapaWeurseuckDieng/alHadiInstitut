import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Icon from '../Icon'
import { useI18n } from '../../i18n/useI18n'
import { PhotoError, preparerPhoto } from '../../utils/photo'
import './PhotoField.css'

/** Appareil tactile (téléphone, tablette) : l'appareil photo s'ouvre via le champ fichier. */
const tactile = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
/** Webcam utilisable (ordinateur, contexte sécurisé : https ou localhost). */
const webcamDisponible = () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && !tactile()

/**
 * Champ photo : prise de vue (téléphone ou webcam), choix d'un fichier, aperçu et retrait.
 * La photo est réduite avant envoi (voir utils/photo.js).
 *
 * @param {{ label: string, value: File|null, currentUrl?: string|null, onChange: (file: File|null) => void,
 *           error?: string, disabled?: boolean }} props
 *   value : nouvelle photo choisie (null = aucune) · currentUrl : photo déjà enregistrée, affichée tant qu'aucune nouvelle n'est choisie
 */
export default function PhotoField({ label, value, currentUrl = null, onChange, error, disabled = false }) {
  const { t } = useI18n()
  const id = useId()
  const cameraInput = useRef(null)
  const fileInput = useRef(null)
  const video = useRef(null)
  const [localError, setLocalError] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [stream, setStream] = useState(null)

  // Aperçu de la nouvelle photo : URL temporaire, libérée quand la photo change
  const preview = useMemo(() => (value ? URL.createObjectURL(value) : null), [value])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  // Webcam : branche le flux sur la vidéo, coupe la caméra à la fermeture
  useEffect(() => {
    if (!stream) return undefined
    if (video.current) video.current.srcObject = stream
    return () => stream.getTracks().forEach(track => track.stop())
  }, [stream])

  async function accept(file) {
    if (!file) return
    setLocalError('')
    setPreparing(true)
    try {
      onChange(await preparerPhoto(file))
    } catch (err) {
      setLocalError(t(`photo.errors.${err instanceof PhotoError ? err.code : 'unreadable'}`))
    } finally {
      setPreparing(false)
    }
  }

  function pick(event) {
    accept(event.target.files?.[0])
    // Permet de rechoisir le même fichier après un retrait
    event.target.value = ''
  }

  async function openWebcam() {
    setLocalError('')
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false }))
    } catch {
      setLocalError(t('photo.errors.camera'))
    }
  }

  function capture() {
    const node = video.current
    if (!node?.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = node.videoWidth
    canvas.height = node.videoHeight
    canvas.getContext('2d').drawImage(node, 0, 0)
    canvas.toBlob(blob => {
      setStream(null)
      if (blob) accept(new File([blob], 'webcam.jpg', { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.92)
  }

  const shown = preview || currentUrl
  const message = localError || error
  const busy = disabled || preparing

  return (
    <div className="photo-field">
      <span className="photo-field-label" id={`${id}-label`}>{label}</span>

      {stream ? (
        /* ---------- Webcam ouverte ---------- */
        <div className="photo-webcam">
          <video ref={video} autoPlay playsInline muted aria-label={t('photo.webcamPreview')} />
          <div className="photo-actions">
            <button type="button" className="db-button" onClick={capture}><Icon name="camera" size={16} />{t('photo.capture')}</button>
            <button type="button" className="db-button db-button--secondary" onClick={() => setStream(null)}>{t('form.cancel')}</button>
          </div>
        </div>
      ) : (
        <div className="photo-row">
          <span className={`photo-preview ${shown ? '' : 'photo-preview--empty'}`}>
            {shown ? <img src={shown} alt={t('photo.previewAlt')} /> : <Icon name="camera" size={26} />}
          </span>

          <div className="photo-side">
            <div className="photo-actions" role="group" aria-labelledby={`${id}-label`}>
              {/* Téléphone : ouvre directement l'appareil photo (caméra arrière) */}
              {tactile() && (
                <button type="button" className="db-button db-button--secondary" disabled={busy} onClick={() => cameraInput.current?.click()}>
                  <Icon name="camera" size={16} />{t('photo.take')}
                </button>
              )}
              {webcamDisponible() && (
                <button type="button" className="db-button db-button--secondary" disabled={busy} onClick={openWebcam}>
                  <Icon name="camera" size={16} />{t('photo.webcam')}
                </button>
              )}
              <button type="button" className="db-button db-button--secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
                <Icon name="image" size={16} />{shown ? t('photo.change') : t('photo.choose')}
              </button>
              {value && (
                <button type="button" className="db-text-button" disabled={busy} onClick={() => onChange(null)}>{t('photo.remove')}</button>
              )}
            </div>
            <small className="photo-hint">{preparing ? t('photo.preparing') : t('photo.hint')}</small>
            {message && <small className="db-field-error" role="alert">{message}</small>}
          </div>
        </div>
      )}

      {/* Champs fichier cachés, déclenchés par les boutons */}
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} aria-label={t('photo.choose')} />
    </div>
  )
}
