import { Fragment, useEffect, useState } from 'react'
import Avatar from '../../../components/Avatar'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { archiveUser, getUser, updateUser } from '../../../services/dashboardService'
import { champsModifies } from '../../../utils/formulaire'
import DetailDialog, { DetailField, InfoList } from './DetailDialog'

/**
 * Fiche d'un compte (Admin) : informations, modification (dont statut actif/inactif), archivage.
 * @param {{ id: number, currentUserId: number, onClose: () => void, onChanged: (message: string) => void, onSessionExpired: () => void }} props
 */
export default function UserDetail({ id, currentUserId, onClose, onChanged, onSessionExpired }) {
  const { t, formatDate, serverMessage } = useI18n()
  const [account, setAccount] = useState(null)
  const [mode, setMode] = useState('view')
  const [values, setValues] = useState({})
  // Valeurs à l'ouverture de la modification : seuls les champs changés sont envoyés
  const [initial, setInitial] = useState({})
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  // Confirmation affichée dans la fenêtre après une modification
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    getUser(id)
      .then(data => { if (!cancelled) setAccount(data) })
      .catch(err => {
        if (cancelled) return
        if (err.status === 401) { onSessionExpired(); return }
        setMessage(serverMessage(err.message, err.status || 0))
      })
    return () => { cancelled = true }
  }, [id, reload, onSessionExpired, serverMessage])

  function start(next) {
    setMode(next)
    setErrors({})
    setMessage('')
    setSuccess('')
    if (next === 'edit') {
      const current = {
        prenom: account.prenom, nom: account.nom, telephone: account.telephone, sexe: account.sexe ?? '',
        adresse: account.adresse ?? '', date_naissance: account.date_naissance ?? '', role: account.role, statut: account.statut,
        profession: account.profession ?? '', specialite: account.specialite ?? '',
      }
      setValues(current)
      setInitial(current)
    }
    if (next === 'archive') setValues({ motif: '' })
  }

  const change = event => setValues(previous => ({ ...previous, [event.target.name]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    // Seuls les champs modifiés partent ; profession/spécialité seulement pour le rôle concerné
    const { profession, specialite, ...changes } = champsModifies(values, initial)
    if (values.role === 'tuteur' && (profession !== undefined || changes.role)) changes.profession = values.profession.trim() || null
    if (values.role === 'oustaz' && (specialite !== undefined || changes.role)) changes.specialite = values.specialite.trim() || null
    if (mode === 'edit' && Object.keys(changes).length === 0) { setMode('view'); return }
    setBusy(true)
    setErrors({})
    setMessage('')
    try {
      let response
      if (mode === 'edit') response = await updateUser(id, changes)
      if (mode === 'archive') response = await archiveUser(id, values.motif.trim())
      const text = serverMessage(response.message, 200, { fallback: 'original' })
      setSuccess(text)
      onChanged(text)
      setMode('view')
      setReload(r => r + 1)
    } catch (err) {
      if (err.status === 401) { onSessionExpired(); return }
      setErrors(Object.fromEntries(Object.entries(err.errors || {}).map(([key, messages]) => [key, serverMessage(messages[0], 422, { fallback: 'original' })])))
      setMessage(serverMessage(Object.values(err.errors || {})[0]?.[0] || err.message, err.status || 0, { fallback: 'original' }))
    } finally {
      setBusy(false)
    }
  }

  const self = account?.id === currentUserId
  const formId = 'user-detail-form'
  const field = (name, label, props = {}) => (
    <DetailField id={`user-${name}`} label={label} required={props.required} error={errors[name]}>
      <input id={`user-${name}`} name={name} value={values[name]} onChange={change} aria-invalid={Boolean(errors[name])} {...props} />
    </DetailField>
  )

  let footer
  if (!account) footer = <button type="button" className="db-button db-button--secondary" onClick={onClose}>{t('pay.form.close')}</button>
  else if (mode === 'view') {
    footer = (
      <Fragment key="view">
        <button type="button" className="db-button db-button--secondary" onClick={onClose}>{t('pay.form.close')}</button>
        {!account.is_archived && (
          <>
            {!self && <button type="button" className="db-button db-button--secondary detail-danger" onClick={() => start('archive')}><Icon name="close" size={16} />{t('details.archive')}</button>}
            <button type="button" className="db-button" onClick={() => start('edit')}><Icon name="pencil" size={16} />{t('details.edit')}</button>
          </>
        )}
      </Fragment>
    )
  } else {
    footer = (
      <Fragment key={mode}>
        <button type="button" className="db-button db-button--secondary" disabled={busy} onClick={() => start('view')}>{t('form.cancel')}</button>
        <button type="submit" form={formId} className={`db-button ${mode === 'archive' ? 'detail-danger-solid' : ''}`} disabled={busy} aria-busy={busy}>
          {busy ? t('form.saving') : t(`details.user.submit.${mode}`)}<Icon name="check" size={17} />
        </button>
      </Fragment>
    )
  }

  return (
    <DetailDialog
      icon="shield"
      title={account ? `${account.prenom} ${account.nom}` : t('dash.loading')}
      subtitle={account && <>{t(`dash.roleLabels.${account.role}`)}{account.is_archived && <> · <span className="db-badge db-badge--neutral"><span className="db-badge-dot" />{t('details.archived')}</span></>}</>}
      busy={busy}
      onClose={onClose}
      notice={success}
      footer={footer}
    >
      {message && <div className="db-alert db-alert--error" role="alert"><strong>{message}</strong></div>}
      {!account && !message && <div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loading')}</div>}

      {account && mode === 'view' && (
        <div className="detail-identity">
          <Avatar person={account} className="detail-avatar" />
          <InfoList items={[
            [t('form.fields.telephone'), <bdi key="tel" dir="ltr">{account.telephone}</bdi>],
            [t('form.fields.sexe'), account.sexe && t(account.sexe === 'M' ? 'details.male' : 'details.female')],
            [t('form.fields.adresse'), account.adresse],
            [t('form.fields.dateNaissance'), account.date_naissance && formatDate(`${account.date_naissance}T12:00:00`, { dateStyle: 'long' })],
            ...(account.role === 'tuteur' ? [[t('details.user.profession'), account.profession]] : []),
            ...(account.role === 'oustaz' ? [[t('details.user.specialite'), account.specialite]] : []),
            [t('dash.table.status'), account.is_archived ? t('details.archivedOn', { date: formatDate(account.archived_at, { dateStyle: 'medium' }) }) : t(`details.user.statuts.${account.statut}`)],
            [t('dash.table.access'), account.must_change_password ? t('dash.table.mustChange') : t('dash.table.configured')],
            [t('details.user.createdAt'), account.created_at && formatDate(account.created_at, { dateStyle: 'medium' })],
          ]} />
        </div>
      )}

      {account && mode !== 'view' && (
        <form id={formId} onSubmit={submit} noValidate>
          <fieldset className="db-dialog-fields" disabled={busy}>
            {mode === 'edit' && (
              <>
                <div className="db-form-grid">
                  {field('prenom', t('form.fields.prenom'), { required: true, maxLength: 120 })}
                  {field('nom', t('form.fields.nom'), { required: true, maxLength: 120 })}
                  {field('telephone', t('form.fields.telephone'), { required: true, type: 'tel', dir: 'ltr', maxLength: 24 })}
                  <DetailField id="user-sexe" label={t('form.fields.sexe')} required error={errors.sexe}>
                    <select id="user-sexe" name="sexe" value={values.sexe} onChange={change}>
                      <option value="">{t('form.options.select')}</option>
                      <option value="M">{t('form.options.male')}</option>
                      <option value="F">{t('form.options.female')}</option>
                    </select>
                  </DetailField>
                  {field('adresse', t('form.fields.adresse'), { maxLength: 255 })}
                  {field('date_naissance', t('form.fields.dateNaissance'), { type: 'date' })}
                  <DetailField id="user-role" label={t('form.fields.role')} error={errors.role}>
                    <select id="user-role" name="role" value={values.role} onChange={change} disabled={self}>
                      {['tuteur', 'oustaz', 'admin'].map(role => <option key={role} value={role}>{t(`dash.roleLabels.${role}`)}</option>)}
                    </select>
                  </DetailField>
                  <DetailField id="user-statut" label={t('dash.table.status')} error={errors.statut}>
                    <select id="user-statut" name="statut" value={values.statut} onChange={change} disabled={self}>
                      <option value="actif">{t('details.user.statuts.actif')}</option>
                      <option value="inactif">{t('details.user.statuts.inactif')}</option>
                    </select>
                  </DetailField>
                  {values.role === 'tuteur' && field('profession', t('details.user.profession'), { maxLength: 120 })}
                  {values.role === 'oustaz' && field('specialite', t('details.user.specialite'), { maxLength: 120 })}
                </div>
                <p className="db-form-note">{t('details.user.statusHelp')}</p>
              </>
            )}

            {mode === 'archive' && (
              <>
                <div className="db-callout detail-warning"><Icon name="shield" /><span>{t('details.user.archiveHelp')}</span></div>
                <DetailField id="user-motif" label={t('details.reason')} error={errors.motif}>
                  <textarea id="user-motif" name="motif" rows={3} maxLength={255} value={values.motif} onChange={change} placeholder={t('details.reasonPlaceholder')} />
                </DetailField>
              </>
            )}
          </fieldset>
        </form>
      )}
    </DetailDialog>
  )
}
