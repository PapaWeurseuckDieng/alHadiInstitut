import { useEffect, useState } from 'react'
import Icon from '../../../components/Icon'
import { useI18n } from '../../../i18n/useI18n'
import { getClasses } from '../../../services/pedagogieService'
import AppelSection from './AppelSection'
import ExemplariteSection from './ExemplariteSection'
import PlanningSection from './PlanningSection'
import SuiviSection from './SuiviSection'
import './Pedagogie.css'

const SECTIONS = { appel: AppelSection, planning: PlanningSection, suivi: SuiviSection, exemplarite: ExemplariteSection }

/**
 * Espace pédagogique (Oustaz : ses classes ; Admin : toutes les classes de l'année).
 * Charge les classes une seule fois et garde la classe choisie d'une rubrique à l'autre.
 *
 * @param {{ section: 'appel'|'planning'|'suivi'|'exemplarite', admin: boolean, refreshKey: number,
 *           onNotice: (message: string) => void, onSessionExpired: () => void }} props
 */
export default function Pedagogie({ section, admin, refreshKey, onNotice, onSessionExpired }) {
  const { t, serverMessage } = useI18n()
  const [classes, setClasses] = useState(null)
  const [error, setError] = useState(null)
  const [classeId, setClasseId] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    getClasses()
      .then(list => {
        if (cancelled) return
        setClasses(list)
        setError(null)
        // Première classe choisie d'office (cas le plus fréquent : un oustaz, une classe)
        setClasseId(current => (current && list.some(c => String(c.id) === String(current)) ? current : String(list[0]?.id ?? '')))
      })
      .catch(err => {
        if (cancelled) return
        if (err.status === 401) { onSessionExpired(); return }
        setError({ message: err.message, status: err.status })
      })
    return () => { cancelled = true }
  }, [reload, refreshKey, onSessionExpired])

  const Section = SECTIONS[section]
  const classe = classes?.find(c => String(c.id) === String(classeId))

  return (
    <div className="ped">
      {error && (
        <div className="db-alert db-alert--error" role="alert">
          <span>{error.status ? serverMessage(error.message, error.status) : error.message}</span>
          <button type="button" className="db-button db-button--secondary" onClick={() => setReload(r => r + 1)}>{t('dash.retry')}</button>
        </div>
      )}

      {!classes && !error && <div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loadingData')}</div>}

      {classes && classes.length === 0 && (
        <div className="db-panel">
          <div className="db-empty">
            <span className="db-empty-icon"><Icon name="book" size={24} /></span>
            <h3>{t('ped.noClass.title')}</h3>
            <p>{admin ? t('ped.noClass.admin') : t('ped.noClass.oustaz')}</p>
          </div>
        </div>
      )}

      {classes?.length > 0 && (
        <>
          {/* Classe travaillée : visible seulement s'il y a un choix à faire */}
          {classes.length > 1 ? (
            <div className="ped-class-picker">
              <label htmlFor="ped-class">{t('ped.class')}</label>
              <select id="ped-class" value={classeId} onChange={event => setClasseId(event.target.value)}>
                {classes.map(c => <option key={c.id} value={c.id}>{c.nom} · {c.niveau}{admin && c.oustaz ? ` · ${c.oustaz}` : ''}</option>)}
              </select>
            </div>
          ) : (
            <p className="ped-class-single"><Icon name="book" size={16} /><strong>{classe.nom}</strong> · {classe.niveau} · {t('ped.students', { count: classe.effectif })}</p>
          )}

          {classe && (
            <Section
              // Nouvelle classe ou bouton « Actualiser » : la rubrique repart de zéro
              key={`${section}-${classe.id}-${refreshKey}`}
              classe={classe}
              admin={admin}
              onNotice={onNotice}
              onSessionExpired={onSessionExpired}
            />
          )}
        </>
      )}
    </div>
  )
}
