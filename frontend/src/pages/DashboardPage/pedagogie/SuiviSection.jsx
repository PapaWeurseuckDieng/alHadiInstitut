import { useEffect, useState } from 'react'
import Avatar from '../../../components/Avatar'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { getClassStudents, getDemandesModification, getFichesSemaine, getSourates } from '../../../services/pedagogieService'
import { ajouterJours, aujourdhui, samediDeLaSemaine } from '../../../utils/semaine'
import { Empty } from './AppelSection'
import FicheEditor, { FicheObjectiveDialog, FicheStatus } from './FicheEditor'

/**
 * Suivi coranique d'une classe, semaine par semaine (samedi → mercredi) :
 * chaque élève, sa fiche (objectif, jours saisis, statut).
 * Oustaz : crée, remplit et valide les fiches. Admin : consulte, et traite les demandes
 * de modification des fiches validées (toutes classes confondues).
 *
 * @param {{ classe: object, admin: boolean, onNotice: (message: string) => void, onSessionExpired: () => void }} props
 */
export default function SuiviSection({ classe, admin, onNotice, onSessionExpired }) {
  const { t, formatDate, serverMessage } = useI18n()
  const [samedi, setSamedi] = useState(() => samediDeLaSemaine(aujourdhui()))
  const [eleves, setEleves] = useState(null)
  const [sourates, setSourates] = useState(null)
  const [fiches, setFiches] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  // Fenêtres : création de fiche (élève) ou fiche ouverte (id)
  const [creating, setCreating] = useState(null)
  const [openId, setOpenId] = useState(null)
  // Admin : fiches validées dont l'oustaz demande la réouverture
  const [demandes, setDemandes] = useState([])

  const mercredi = ajouterJours(samedi, 4)

  function fail(err) {
    if (err.status === 401) { onSessionExpired(); return }
    setError({ message: err.message, status: err.status })
  }

  // Élèves de la classe et référentiel des sourates (une fois par classe)
  useEffect(() => {
    let cancelled = false
    Promise.all([getClassStudents(classe.id), getSourates()])
      .then(([list, refs]) => { if (!cancelled) { setEleves(list); setSourates(refs) } })
      .catch(err => { if (!cancelled) fail(err) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classe.id])

  // Fiches de la semaine affichée
  useEffect(() => {
    let cancelled = false
    getFichesSemaine(samedi, mercredi)
      .then(list => { if (!cancelled) { setFiches(list); setError(null) } })
      .catch(err => { if (!cancelled) fail(err) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samedi, mercredi, reload])

  // Demandes de modification en attente (Admin), rechargées avec la liste
  useEffect(() => {
    if (!admin) return
    let cancelled = false
    getDemandesModification()
      .then(list => { if (!cancelled) setDemandes(list) })
      .catch(err => { if (!cancelled && err.status === 401) onSessionExpired() })
    return () => { cancelled = true }
  }, [admin, reload, onSessionExpired])

  function goToWeek(offset) {
    setFiches(null)
    setSamedi(current => ajouterJours(current, offset * 7))
  }

  const ficheOf = eleveId => fiches?.find(f => f.eleve_id === eleveId)
  const day = value => formatDate(`${value}T12:00:00`, { day: 'numeric', month: 'short' })
  // Oustaz : fiches de la semaine encore en brouillon (à remplir puis valider)
  const toValidate = !admin && fiches && eleves ? eleves.filter(e => ficheOf(e.id)?.statut === 'brouillon').length : 0

  let body
  if (!eleves || !sourates || !fiches) body = <div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loadingData')}</div>
  else if (!eleves.length) body = <Empty icon="users" title={t('ped.appel.noStudent')} text={t('ped.appel.noStudentText')} />
  else {
    body = (
      <div className="db-table-scroll">
        <table>
          <caption className="db-sr-only">{t('ped.suivi.caption')}</caption>
          <thead>
            <tr>
              <th>{t('dash.table.student')}</th>
              <th>{t('ped.suivi.objective')}</th>
              <th>{t('ped.suivi.days')}</th>
              <th>{t('dash.table.status')}</th>
              <th>{t('dash.table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {eleves.map(eleve => {
              const fiche = ficheOf(eleve.id)
              return (
                <tr key={eleve.id}>
                  <td data-label={t('dash.table.student')}>
                    <div className="db-person">
                      <Avatar person={eleve} />
                      <span><strong>{eleve.prenom} {eleve.nom}</strong><small><bdi>{eleve.matricule}</bdi></small></span>
                    </div>
                  </td>
                  <td data-label={t('ped.suivi.objective')}>
                    {fiche ? <span>{fiche.sourate_debut} {fiche.verset_debut} → {fiche.sourate_fin} {fiche.verset_fin}</span> : <span className="db-muted-text">—</span>}
                  </td>
                  <td data-label={t('ped.suivi.days')}>{fiche ? t('ped.suivi.daysCount', { count: fiche.notes.length }) : <span className="db-muted-text">—</span>}</td>
                  <td data-label={t('dash.table.status')}>{fiche ? <FicheStatus fiche={fiche} /> : <span className="db-muted-text">{t('ped.suivi.noFiche')}</span>}</td>
                  <td data-label={t('dash.table.actions')}>
                    {fiche ? (
                      <button type="button" className="db-button db-button--secondary db-button--small" onClick={() => setOpenId(fiche.id)} aria-label={t('ped.suivi.openFor', { name: `${eleve.prenom} ${eleve.nom}` })}>
                        <Icon name={admin ? 'eye' : 'book'} size={15} />{!admin && fiche.statut === 'brouillon' ? t('ped.suivi.fill') : t('ped.suivi.open')}
                      </button>
                    ) : admin ? (
                      // L'administration ne crée pas de fiche : c'est le travail de l'oustaz
                      <span className="db-muted-text">{t('ped.suivi.waitingOustaz')}</span>
                    ) : (
                      <button type="button" className="db-button db-button--small" onClick={() => setCreating(eleve)} aria-label={t('ped.suivi.createFor', { name: `${eleve.prenom} ${eleve.nom}` })}>
                        <Icon name="plus" size={15} />{t('ped.suivi.create')}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <section className="db-panel" aria-labelledby="ped-suivi-title">
      <div className="db-panel-heading">
        <div>
          <h2 id="ped-suivi-title">{t('ped.suivi.title')}</h2>
          <p>{t('ped.suivi.text')}</p>
        </div>
        {toValidate > 0 && <span className="db-badge db-badge--attention"><span className="db-badge-dot" />{t('ped.suivi.toValidate', { count: toValidate })}</span>}
      </div>
      {admin && <p className="db-form-note">{t('ped.suivi.adminNote')}</p>}

      {/* Admin : demandes de modification des fiches validées, toutes classes confondues */}
      {admin && demandes.length > 0 && (
        <div className="ped-requests" role="region" aria-labelledby="ped-requests-title">
          <h3 id="ped-requests-title"><Icon name="lock" size={17} />{t('ped.suivi.requests', { count: demandes.length })}</h3>
          <ul>
            {demandes.map(demande => (
              <li key={demande.id}>
                <span className="db-person">
                  <Avatar person={demande.eleve ?? {}} />
                  <span>
                    <strong>{demande.eleve?.prenom} {demande.eleve?.nom}</strong>
                    <small>
                      {t('ped.suivi.weekLabel', { from: day(demande.date_debut), to: day(demande.date_fin) })}
                      {demande.enseignant ? ` · ${demande.enseignant}` : ''}
                      {demande.motif_demande_modification ? ` · « ${demande.motif_demande_modification} »` : ''}
                    </small>
                  </span>
                </span>
                <button type="button" className="db-button db-button--small" onClick={() => setOpenId(demande.id)} aria-label={t('ped.suivi.reviewFor', { name: `${demande.eleve?.prenom} ${demande.eleve?.nom}` })}>
                  <Icon name="eye" size={15} />{t('ped.suivi.review')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Semaine affichée */}
      <div className="pay-month ped-week-nav" role="group" aria-label={t('ped.suivi.week')}>
        <button type="button" className="db-icon-button" aria-label={t('ped.suivi.previousWeek')} onClick={() => goToWeek(-1)}>
          <span className="db-flip-rtl"><Icon name="chevronLeft" /></span>
        </button>
        <strong>{t('ped.suivi.weekLabel', { from: day(samedi), to: day(mercredi) })}</strong>
        <button type="button" className="db-icon-button" aria-label={t('ped.suivi.nextWeek')} onClick={() => goToWeek(1)}>
          <span className="db-flip-rtl"><Icon name="chevronRight" /></span>
        </button>
        {samedi !== samediDeLaSemaine(aujourdhui()) && (
          <button type="button" className="db-text-button" onClick={() => { setFiches(null); setSamedi(samediDeLaSemaine(aujourdhui())) }}>{t('ped.suivi.thisWeek')}</button>
        )}
      </div>

      {error && (
        <div className="db-alert db-alert--error" role="alert">
          <span>{error.status ? serverMessage(error.message, error.status) : error.message}</span>
          <button type="button" className="db-button db-button--secondary" onClick={() => setReload(r => r + 1)}>{t('dash.retry')}</button>
        </div>
      )}

      {body}

      {creating && (
        <FicheObjectiveDialog
          eleve={creating}
          samedi={samedi}
          sourates={sourates}
          onClose={() => setCreating(null)}
          onSaved={(message, fiche) => { setCreating(null); onNotice(message); setReload(r => r + 1); setOpenId(fiche.id) }}
          onSessionExpired={onSessionExpired}
        />
      )}
      {openId && (
        <FicheEditor
          ficheId={openId}
          admin={admin}
          sourates={sourates}
          onClose={() => { setOpenId(null); setReload(r => r + 1) }}
          onNotice={onNotice}
          onSessionExpired={onSessionExpired}
        />
      )}
    </section>
  )
}
