import { useEffect, useId, useRef, useState } from 'react'
import Avatar from '../Avatar'
import Icon from '../Icon'
import { useI18n } from '../../i18n/useI18n'
import { searchTuteurs } from '../../services/dashboardService'
import './TuteurPicker.css'

/**
 * Recherche d'un tuteur existant par prénom, nom ou téléphone (au moins 2 caractères).
 * Chaque résultat affiche le téléphone et les enfants déjà rattachés ; les homonymes
 * (même prénom et même nom) sont signalés pour éviter de choisir le mauvais compte.
 *
 * @param {{ id: string, label: React.ReactNode, value: object|null, onChange: (tuteur: object|null) => void,
 *           error?: string, excludeEleveId?: number, onSessionExpired?: () => void, disabled?: boolean }} props
 *   value : tuteur choisi { id, prenom, nom, telephone, enfants, homonyme } ou null
 */
export default function TuteurPicker({ id, label, value, onChange, error, excludeEleveId, onSessionExpired, disabled = false }) {
  const { t, serverMessage } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [message, setMessage] = useState('')
  const [active, setActive] = useState(-1)
  const [open, setOpen] = useState(false)
  const listId = useId()
  const input = useRef(null)
  const term = query.trim()

  // Recherche différée de 300 ms après la dernière frappe ; la réponse d'une ancienne frappe est ignorée
  useEffect(() => {
    if (term.length < 2) return
    let cancelled = false
    const timer = setTimeout(() => {
      setStatus('loading')
      searchTuteurs(term, excludeEleveId)
        .then(list => { if (!cancelled) { setResults(list); setStatus('done'); setActive(list.length ? 0 : -1) } })
        .catch(err => {
          if (cancelled) return
          if (err.status === 401) { onSessionExpired?.(); return }
          setStatus('error')
          setMessage(err.status ? serverMessage(err.message, err.status) : err.message)
        })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [term, excludeEleveId, onSessionExpired, serverMessage])

  function choose(tuteur) {
    onChange(tuteur)
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(event) {
    if (!open || !results.length) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => (index + 1) % results.length) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => (index - 1 + results.length) % results.length) }
    if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(results[active]) }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false) }
  }

  // Tuteur déjà choisi : carte récapitulative + bouton « Changer »
  if (value) {
    return (
      <div className="db-field">
        <span className="tp-label" id={`${id}-label`}>{label}</span>
        <div className="tp-selected" aria-labelledby={`${id}-label`}>
          <Avatar person={value} />
          <span className="tp-person">
            <strong>{value.prenom} {value.nom}</strong>
            <small><bdi dir="ltr">{value.telephone}</bdi>{value.enfants?.length ? ` · ${t('tutorPicker.children', { names: value.enfants.join(', ') })}` : ''}</small>
          </span>
          {value.homonyme && <span className="db-badge db-badge--attention"><span className="db-badge-dot" />{t('tutorPicker.homonym')}</span>}
          <button type="button" className="db-text-button" disabled={disabled} onClick={() => { onChange(null); requestAnimationFrame(() => input.current?.focus()) }}>
            {t('tutorPicker.change')}
          </button>
        </div>
        {error && <small className="db-field-error">{error}</small>}
      </div>
    )
  }

  const showList = open && term.length >= 2
  return (
    <div className="db-field tp">
      <label htmlFor={id}>{label}</label>
      <div className="tp-input">
        <Icon name="search" size={17} />
        <input
          ref={input}
          id={id}
          type="search"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-help`}
          placeholder={t('tutorPicker.placeholder')}
          value={query}
          disabled={disabled}
          onChange={event => { setQuery(event.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
        />
      </div>
      <small id={`${id}-help`} className="tp-help">{t('tutorPicker.help')}</small>
      {showList && (
        <ul id={listId} role="listbox" className="tp-list" aria-label={t('tutorPicker.results')}>
          {status === 'loading' && <li className="tp-note" role="presentation">{t('tutorPicker.searching')}</li>}
          {status === 'error' && <li className="tp-note tp-note--error" role="presentation">{message}</li>}
          {status === 'done' && results.length === 0 && <li className="tp-note" role="presentation">{t('tutorPicker.none')}</li>}
          {status === 'done' && results.map((tuteur, index) => (
            <li
              key={tuteur.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={`tp-option ${index === active ? 'tp-option--active' : ''}`}
              // mousedown : choisi avant que le champ ne perde le focus
              onMouseDown={event => { event.preventDefault(); choose(tuteur) }}
              onMouseEnter={() => setActive(index)}
            >
              <Avatar person={tuteur} />
              <span className="tp-person">
                <strong>{tuteur.prenom} {tuteur.nom}</strong>
                <small>
                  <bdi dir="ltr">{tuteur.telephone}</bdi>
                  {tuteur.enfants.length > 0 ? ` · ${t('tutorPicker.children', { names: tuteur.enfants.join(', ') })}` : ` · ${t('tutorPicker.noChild')}`}
                </small>
              </span>
              {tuteur.homonyme && <span className="db-badge db-badge--attention"><span className="db-badge-dot" />{t('tutorPicker.homonym')}</span>}
            </li>
          ))}
        </ul>
      )}
      {error && <small className="db-field-error">{error}</small>}
    </div>
  )
}
