import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import ActionMenu from '../../components/ActionMenu/ActionMenu'
import Avatar from '../../components/Avatar'
import { useDialogs } from '../../components/Dialogs/dialogsContext'
import Icon from '../../components/Icon'
import LanguageSwitcher from '../../components/LanguageSwitcher/LanguageSwitcher'
import { useI18n } from '../../i18n/useI18n'
import { clearSession, getCurrentUser, getToken, getUtilisateur, logout } from '../../services/authService'
import { archiveEleve, archiveUser, getDashboard, getMyRecords, resetPassword } from '../../services/dashboardService'
import PhotoDialog from './PhotoDialog'
import RecordForm from './RecordForm'
import PaymentsSection from './paiements/PaymentsSection'
import TuteurPaiements from './paiements/TuteurPaiements'
import './DashboardPage.css'

// Rubriques et fenêtres chargées à la demande : un tuteur ne télécharge pas l'espace pédagogique
const ClasseDetail = lazy(() => import('./details/ClasseDetail'))
const EleveDetail = lazy(() => import('./details/EleveDetail'))
const SyntheseDialog = lazy(() => import('./details/SyntheseDialog'))
const UserDetail = lazy(() => import('./details/UserDetail'))
const DepensesSection = lazy(() => import('./depenses/DepensesSection'))
const DiplomesSection = lazy(() => import('./diplomes/DiplomesSection'))
const EleveDuMoisSection = lazy(() => import('./pedagogie/EleveDuMoisSection'))
const Pedagogie = lazy(() => import('./pedagogie/Pedagogie'))

/* ==========================================================================
   Configuration
   Les textes sont dans src/i18n/fr.js et src/i18n/ar.js (clés « dash.… »).
   ========================================================================== */

// Menu de l'administration : 6 rubriques ; Finances et Pédagogie se détaillent en onglets
const ADMIN_KEYS = ['overview', 'eleves', 'classes', 'finances', 'pedagogie', 'users']
const ADMIN_TABS = {
  finances: ['paiements', 'depenses'],
  pedagogie: ['suivi', 'eleveDuMois', 'exemplarite', 'appel', 'planning', 'diplomes'],
}
// Espace pédagogique : Oustaz (ses classes, une rubrique par activité) et Admin (onglets)
const PEDAGOGY_KEYS = ['suivi', 'appel', 'planning', 'exemplarite']
const SECTION_ICONS = {
  overview: 'dashboard', eleves: 'users', classes: 'book', finances: 'wallet', pedagogie: 'star', users: 'shield',
  paiements: 'wallet', depenses: 'expense', suivi: 'book', appel: 'check', planning: 'calendar', exemplarite: 'shield', eleveDuMois: 'star', diplomes: 'award',
}

// Rubriques qui chargent leurs propres données (pas la liste du tableau de bord)
const OWN_DATA_SECTIONS = ['finances', 'pedagogie', 'paiements', 'depenses', 'eleveDuMois', 'diplomes', ...PEDAGOGY_KEYS]

/** Rubriques du menu selon le rôle. */
function menuKeys(role) {
  if (role === 'admin') return ADMIN_KEYS
  if (role === 'oustaz') return ['overview', ...PEDAGOGY_KEYS]
  return ['overview']
}

// Liste chargée par le tableau de bord pour chaque rubrique
const listFor = section => (section === 'overview' || OWN_DATA_SECTIONS.includes(section) ? 'eleves' : section)

// Formulaire de création associé à chaque liste
const LIST_FORMS = { eleves: 'eleve', classes: 'classe', users: 'user' }

// Actions rapides du tableau de bord administrateur : [formulaire, préfixe de clé, icône]
const QUICK_ACTIONS = [
  ['eleve', 'eleve', 'users'],
  ['classe', 'classe', 'book'],
  ['user', 'user', 'shield'],
]

// Opérations du journal d'activité -> clé de traduction
const ACTIVITY_KEYS = { 'user.created': 'userCreated', 'eleve.enrolled': 'eleveEnrolled', 'classe.created': 'classeCreated' }

/* ==========================================================================
   Fonctions utilitaires
   ========================================================================== */

/** « Prénom Nom » d'une personne. */
const fullName = record => `${record.prenom} ${record.nom}`

/* ==========================================================================
   Petits composants d'affichage
   ========================================================================== */

/** Message affiché quand une liste est vide ou indisponible. */
function EmptyState({ title, description }) {
  return (
    <div className="db-empty">
      <span className="db-empty-icon"><Icon name="book" size={24} /></span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}

/** Pastille de statut : « Archivé », « Actif » en vert, sinon la valeur brute en gris. */
function StatusBadge({ value, archived = false }) {
  const { t } = useI18n()
  if (archived) return <span className="db-badge db-badge--neutral"><span className="db-badge-dot" />{t('details.archived')}</span>
  const active = value === 'actif' || value === 'active'
  return (
    <span className={`db-badge ${active ? 'db-badge--success' : 'db-badge--neutral'}`}>
      <span className="db-badge-dot" />
      {active ? t('dash.table.active') : value || t('dash.table.notProvided')}
    </span>
  )
}

/**
 * Photo (ou initiales) suivie du nom et d'une ligne secondaire (matricule...).
 * Avec onOpen, toute la cellule est un bouton qui ouvre la fiche de détail.
 */
function PersonCell({ record, onOpen, secondary }) {
  const { t } = useI18n()
  const content = (
    <>
      <Avatar person={record} />
      <span>
        <strong>{fullName(record)}</strong>
        <small>{secondary ?? <bdi>{record.matricule}</bdi>}</small>
      </span>
    </>
  )
  if (!onOpen) return <div className="db-person">{content}</div>
  return (
    <button type="button" className="db-person db-person-link" onClick={onOpen} aria-label={t('details.openFor', { name: fullName(record) })}>
      {content}
    </button>
  )
}

/** Flèche « aller vers » : retournée en arabe (sens de lecture inversé). */
function ArrowIcon({ size = 16 }) {
  return <span className="db-flip-rtl"><Icon name="arrow" size={size} /></span>
}

/* ==========================================================================
   Tableaux administrateur
   Sur mobile, chaque ligne devient une carte : `data-label` fournit
   l'intitulé de la colonne affiché devant chaque valeur (voir le CSS).
   Chaque cellule contient un seul bloc, indispensable à cet affichage.
   ========================================================================== */

/** Liste des élèves et de leurs inscriptions. */
function ElevesTable({ records, actions }) {
  const { t } = useI18n()
  return (
    <table>
      <caption className="db-sr-only">{t('dash.table.elevesCaption')}</caption>
      <thead>
        <tr>
          <th>{t('dash.table.student')}</th>
          <th>{t('dash.table.classYear')}</th>
          <th>{t('dash.table.tutors')}</th>
          <th>{t('dash.table.status')}</th>
          <th>{t('dash.table.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {records.map(eleve => (
          <tr key={eleve.id}>
            <td data-label={t('dash.table.student')}><PersonCell record={eleve} onOpen={() => actions.onDetail('eleve', eleve)} /></td>
            <td data-label={t('dash.table.classYear')}>
              <div>
                {eleve.inscriptions.length
                  ? eleve.inscriptions.map(inscription => (
                    <div className="db-inscription" key={inscription.id}>
                      {inscription.classe
                        ? <span className="db-strong">{inscription.classe}</span>
                        : <span className="db-badge db-badge--attention"><span className="db-badge-dot" />{t('dash.table.noClass')}</span>}
                      <small>
                        {inscription.annee_scolaire} · {inscription.statut === 'active' ? t('dash.table.activeEnrollment') : inscription.statut}
                      </small>
                    </div>
                  ))
                  : <span className="db-muted-text">{t('dash.table.noEnrollment')}</span>}
              </div>
            </td>
            <td data-label={t('dash.table.tutors')}>
              <div>
                {eleve.tuteurs.length
                  ? eleve.tuteurs.map((name, index) => <span className="db-line" key={index}>{name}</span>)
                  : <span className="db-muted-text">{t('dash.table.noTutor')}</span>}
              </div>
            </td>
            <td data-label={t('dash.table.status')}><StatusBadge value={eleve.statut} archived={eleve.is_archived} /></td>
            <td data-label={t('dash.table.actions')}>
              <ActionMenu
                label={t('actions.for', { name: fullName(eleve) })}
                items={[
                  { key: 'detail', label: t('actions.openStudent'), icon: 'eye', onSelect: () => actions.onDetail('eleve', eleve) },
                  { key: 'photo', label: t('photo.dialogTitle'), icon: 'camera', hidden: eleve.is_archived, onSelect: () => actions.onPhoto('eleve', eleve) },
                  { key: 'archive', label: t('details.archive'), icon: 'close', danger: true, hidden: eleve.is_archived, onSelect: () => actions.onArchive('eleve', eleve) },
                ]}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Liste des classes académiques. */
function ClassesTable({ records, actions }) {
  const { t } = useI18n()
  return (
    <table>
      <caption className="db-sr-only">{t('dash.table.classesCaption')}</caption>
      <thead>
        <tr>
          <th>{t('dash.table.classLevel')}</th>
          <th>{t('dash.table.oustaz')}</th>
          <th>{t('dash.table.schoolYear')}</th>
          <th>{t('dash.table.size')}</th>
          <th>{t('dash.table.status')}</th>
          <th>{t('dash.table.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {records.map(classe => (
          <tr key={classe.id}>
            <td data-label={t('dash.table.classLevel')}>
              <button type="button" className="db-person db-person-link" onClick={() => actions.onDetail('classe', classe)} aria-label={t('details.openFor', { name: classe.nom })}>
                <span className="db-avatar db-avatar--square" aria-hidden="true"><Icon name="book" size={18} /></span>
                <span><strong>{classe.nom}</strong><small>{classe.niveau}</small></span>
              </button>
            </td>
            <td data-label={t('dash.table.oustazShort')}>{classe.oustaz || <span className="db-muted-text">{t('dash.table.notProvided')}</span>}</td>
            <td data-label={t('dash.table.yearShort')}>{classe.annee_scolaire}</td>
            {/* Le texte « N élèves » est vérifié par les tests e2e : ne pas le modifier. */}
            <td data-label={t('dash.table.size')}><span><span className="db-count">{classe.effectif}</span> {t('dash.table.studentsSuffix')}</span></td>
            <td data-label={t('dash.table.status')}><StatusBadge value={classe.statut} archived={classe.is_archived} /></td>
            <td data-label={t('dash.table.actions')}>
              <ActionMenu
                label={t('actions.for', { name: classe.nom })}
                items={[
                  { key: 'detail', label: t('actions.openClass'), icon: 'eye', onSelect: () => actions.onDetail('classe', classe) },
                  { key: 'edit', label: t('details.edit'), icon: 'pencil', hidden: classe.is_archived, onSelect: () => actions.onDetail('classe', classe, 'edit') },
                ]}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Liste des comptes utilisateurs. */
function UsersTable({ records, actions }) {
  const { t } = useI18n()
  return (
    <table>
      <caption className="db-sr-only">{t('dash.table.usersCaption')}</caption>
      <thead>
        <tr>
          <th>{t('dash.table.user')}</th>
          <th>{t('dash.table.role')}</th>
          <th>{t('dash.table.phone')}</th>
          <th>{t('dash.table.access')}</th>
          <th>{t('dash.table.status')}</th>
          <th>{t('dash.table.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {records.map(account => (
          <tr key={account.id}>
            <td data-label={t('dash.table.user')}><PersonCell record={account} onOpen={() => actions.onDetail('user', account)} /></td>
            <td data-label={t('dash.table.role')}>{t(`dash.roleLabels.${account.role}`)}</td>
            {/* dir="ltr" : « +221… » ne doit pas être inversé en arabe */}
            <td data-label={t('dash.table.phone')} className="db-nowrap"><span dir="ltr">{account.telephone}</span></td>
            <td data-label={t('dash.table.access')}>
              {account.must_change_password
                ? <span className="db-badge db-badge--attention"><span className="db-badge-dot" />{t('dash.table.mustChange')}</span>
                : <span className="db-badge db-badge--success"><span className="db-badge-dot" />{t('dash.table.configured')}</span>}
            </td>
            <td data-label={t('dash.table.status')}><StatusBadge value={account.statut} archived={account.is_archived} /></td>
            <td data-label={t('dash.table.actions')}>
              {/* Son propre compte : ni réinitialisation ni archivage (refusés par le serveur) */}
              <ActionMenu
                label={t('actions.for', { name: fullName(account) })}
                items={[
                  { key: 'detail', label: t('actions.openAccount'), icon: 'eye', onSelect: () => actions.onDetail('user', account) },
                  { key: 'photo', label: t('photo.dialogTitle'), icon: 'camera', hidden: account.is_archived, onSelect: () => actions.onPhoto('user', account) },
                  { key: 'reset', label: actions.resettingId === account.id ? t('users.reset.running') : t('users.reset.button'), icon: 'key', disabled: actions.resettingId === account.id, hidden: account.is_archived || account.id === actions.currentUserId, onSelect: () => actions.onReset(account) },
                  { key: 'archive', label: t('details.archive'), icon: 'close', danger: true, hidden: account.is_archived || account.id === actions.currentUserId, onSelect: () => actions.onArchive('user', account) },
                ]}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Choisit le tableau correspondant à la rubrique. */
function RecordsTable({ section, records, actions }) {
  if (section === 'classes') return <ClassesTable records={records} actions={actions} />
  if (section === 'users') return <UsersTable records={records} actions={actions} />
  return <ElevesTable records={records} actions={actions} />
}

/* ==========================================================================
   Cadre : menu latéral et barre du haut
   ========================================================================== */

/** Menu latéral : logo, rubriques et utilisateur connecté (tiroir sur mobile). */
function Sidebar({ user, section, menuOpen, onSelect }) {
  const { t } = useI18n()

  return (
    <aside className={`db-sidebar ${menuOpen ? 'db-sidebar--open' : ''}`}>
      <a className="db-brand" href="/tableau-de-bord">
        <span className="db-brand-logo"><img src="/faviconDara.svg" alt="" /></span>
        <span>
          <strong>{t('common.instituteName')}</strong>
          <small>{user?.role ? t(`dash.roles.${user.role}`) : t('dash.roles.fallback')}</small>
        </span>
      </a>

      <nav aria-label={t('dash.menu.nav')}>
        <p className="db-nav-label">{t('dash.menu.label')}</p>
        {menuKeys(user?.role).map(key => (
          <button
            key={key}
            type="button"
            className={`db-nav-item ${section === key ? 'db-nav-item--active' : ''}`}
            aria-current={section === key ? 'page' : undefined}
            onClick={() => onSelect(key)}
          >
            <Icon name={SECTION_ICONS[key]} />
            <span>{t(`dash.sections.${key}`)}</span>
          </button>
        ))}
      </nav>

      {/* Utilisateur connecté */}
      <div className="db-user-card">
        <Avatar person={user} className="db-avatar--gold" />
        <span>
          <strong>{user ? fullName(user) : t('dash.menu.account')}</strong>
          <small>{user?.role ? t(`dash.roleLabels.${user.role}`) : ''}</small>
        </span>
      </div>
    </aside>
  )
}

/** Barre du haut : bouton menu (mobile), fil d'Ariane, date, langue et déconnexion. */
function Topbar({ section, menuOpen, today, loggingOut, onOpenMenu, onSignOut }) {
  const { t } = useI18n()
  return (
    <header className="db-topbar">
      <div className="db-crumbs">
        <button
          type="button"
          className="db-icon-button db-mobile-menu"
          aria-label={t('dash.menu.open')}
          aria-expanded={menuOpen}
          onClick={onOpenMenu}
        >
          <Icon name="menu" />
        </button>
        <span className="db-crumbs-root">{t('dash.sections.overview')}</span>
        {section !== 'overview' && (
          <>
            <span className="db-crumbs-separator" aria-hidden="true">/</span>
            <strong>{t(`dash.sections.${section}`)}</strong>
          </>
        )}
      </div>

      <div className="db-topbar-right">
        <span className="db-topbar-date"><Icon name="calendar" size={16} />{today}</span>
        <LanguageSwitcher className="db-lang" />
        {/* aria-label utilisé par les tests e2e : « Se déconnecter » en français */}
        <button
          type="button"
          className="db-button db-button--ghost db-logout"
          onClick={onSignOut}
          disabled={loggingOut}
          aria-label={t('dash.logout')}
          title={t('dash.logout')}
        >
          <span className="db-flip-rtl"><Icon name="logout" size={18} /></span>
          <span className="db-logout-text">{loggingOut ? t('dash.loggingOut') : t('dash.logout')}</span>
        </button>
      </div>
    </header>
  )
}

/* ==========================================================================
   Blocs du tableau de bord administrateur
   ========================================================================== */

/** Les 4 indicateurs cliquables (ou leur squelette pendant le premier chargement). */
function MetricCards({ data, loading, year, onSelect }) {
  const { t, formatNumber } = useI18n()

  if (!data) {
    return (
      <section className="db-metrics" aria-label={t('dash.metrics.aria')}>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="db-metric db-skeleton" aria-label={t('dash.metrics.loading')} />
        ))}
      </section>
    )
  }

  const cards = [
    { key: 'eleves', value: data.stats.eleves, hint: year ? t('dash.year.hint', { year }) : t('dash.year.all'), icon: 'users', target: 'eleves' },
    { key: 'classes', value: data.stats.classes, hint: t('dash.metrics.classesHint'), icon: 'book', target: 'classes' },
    { key: 'aAffecter', value: data.stats.a_affecter, hint: t('dash.metrics.aAffecterHint'), icon: 'calendar', target: 'eleves', attention: true },
    { key: 'comptes', value: data.stats.comptes_actifs, hint: t('dash.metrics.comptesHint'), icon: 'shield', target: 'users' },
  ]

  return (
    <section className="db-metrics" aria-label={t('dash.metrics.aria')}>
      {cards.map(card => (
        <button
          key={card.key}
          type="button"
          className={`db-metric ${card.attention && card.value > 0 ? 'db-metric--attention' : ''}`}
          onClick={() => onSelect(card.target)}
          disabled={loading}
        >
          <span className="db-metric-head">
            <span className="db-metric-name">{t(`dash.metrics.${card.key}`)}</span>
            <span className="db-metric-icon"><Icon name={card.icon} size={19} /></span>
          </span>
          <strong className="db-metric-value">{loading ? '…' : formatNumber(card.value)}</strong>
          <span className="db-metric-hint">
            <span>{card.hint}</span>
            <ArrowIcon />
          </span>
        </button>
      ))}
    </section>
  )
}

/** Raccourcis vers les trois formulaires de création. */
function QuickActions({ disabled, onCreate }) {
  const { t } = useI18n()
  return (
    <section className="db-panel db-quick-actions" aria-labelledby="db-quick-title">
      <div className="db-panel-heading">
        <h2 id="db-quick-title">{t('dash.quick.title')}</h2>
      </div>
      {QUICK_ACTIONS.map(([kind, key, icon]) => (
        // Le nom accessible inclut la description : il reste distinct
        // du bouton principal « Inscrire un élève » (tests e2e).
        <button key={kind} type="button" className="db-action" disabled={disabled} onClick={() => onCreate(kind)}>
          <span className="db-action-icon"><Icon name={icon} /></span>
          <span className="db-action-text">
            <strong>{t(`dash.quick.${key}Title`)}</strong>
            <small>{t(`dash.quick.${key}Text`)}</small>
          </span>
          <ArrowIcon size={17} />
        </button>
      ))}
    </section>
  )
}

/** Journal des dernières opérations enregistrées. */
function ActivityFeed({ data, loading, error }) {
  const { t, formatDate } = useI18n()

  let content
  if (loading) content = <p className="db-panel-note">{t('dash.loading')}</p>
  else if (error) content = <p className="db-panel-note">{t('dash.activity.unavailable')}</p>
  else if (!data?.activites.length) content = <p className="db-panel-note">{t('dash.activity.empty')}</p>
  else {
    content = (
      <ol className="db-timeline">
        {data.activites.map(activity => (
          <li key={activity.id}>
            <span className="db-timeline-dot" aria-hidden="true" />
            <div>
              <strong>{ACTIVITY_KEYS[activity.action] ? t(`dash.activity.${ACTIVITY_KEYS[activity.action]}`) : activity.action}</strong>
              <small>
                {t('dash.activity.item', {
                  id: activity.entity_id,
                  date: formatDate(activity.created_at, { dateStyle: 'medium', timeStyle: 'short' }),
                })}
              </small>
            </div>
          </li>
        ))}
      </ol>
    )
  }

  return (
    <section className="db-panel db-activity" aria-labelledby="db-activity-title">
      <div className="db-panel-heading">
        <div>
          <h2 id="db-activity-title">{t('dash.activity.title')}</h2>
          <p>{t('dash.activity.subtitle')}</p>
        </div>
      </div>
      {content}
    </section>
  )
}

/**
 * Liste paginée de la rubrique (élèves, classes ou comptes) :
 * en-tête, recherche, tableau et pagination.
 */
function RecordsPanel({ overview, tableSection, data, loading, error, search, draft, page, onDraftChange, onSearch, onClearSearch, onPrevious, onNext, onCreate, year, actions, archives, onToggleArchives }) {
  const { t } = useI18n()
  // Raccourci vers les textes de la liste courante, ex. list('create') -> « Inscrire un élève »
  const list = (key, params) => t(`dash.lists.${tableSection}.${key}`, params)

  // Contenu sous la barre de recherche : chargement, erreur, tableau ou liste vide
  let body
  if (loading) {
    body = <div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loadingData')}</div>
  } else if (error) {
    body = <EmptyState title={t('dash.unavailable.title')} description={t('dash.unavailable.text')} />
  } else if (data?.items.length) {
    body = (
      <>
        <div className="db-table-scroll"><RecordsTable section={tableSection} records={data.items} actions={actions} /></div>
        <div className="db-pagination">
          {/* Texte vérifié par les tests e2e, ex. « 12 élève(s) · Page 1 / 2 » */}
          <span>{list('count', { total: data.pagination.total, page: data.pagination.page, last: data.pagination.last_page })}</span>
          <div>
            <button type="button" className="db-button db-button--secondary" disabled={page <= 1} onClick={onPrevious}>{t('dash.pagination.previous')}</button>
            <button type="button" className="db-button db-button--secondary" disabled={page >= data.pagination.last_page} onClick={onNext}>{t('dash.pagination.next')}</button>
          </div>
        </div>
      </>
    )
  } else {
    let description = list('emptyText')
    if (search) description = t('dash.search.noResultText')
    else if (year) description = t('dash.search.noYearText')
    body = <EmptyState title={search ? t('dash.search.noResultTitle') : list('emptyTitle')} description={description} />
  }

  // Bouton de création (élève, classe ou compte)
  const createButton = (
    <button type="button" className="db-button" disabled={!data || loading || Boolean(error)} onClick={() => onCreate(LIST_FORMS[tableSection])}>
      <Icon name="plus" size={17} />{list('create')}
    </button>
  )

  // Recherche par nom, matricule ou téléphone
  const searchForm = (
    <form className="db-search" role="search" onSubmit={onSearch}>
      <Icon name="search" size={18} />
      <input
        aria-label={list('searchLabel')}
        placeholder={list('placeholder')}
        maxLength={120}
        value={draft}
        onChange={event => onDraftChange(event.target.value)}
      />
      {search && (
        <button type="button" className="db-search-clear" aria-label={t('dash.search.clear')} onClick={onClearSearch}>
          <Icon name="close" size={16} />
        </button>
      )}
      <button type="submit" className="db-search-submit" disabled={loading}>{t('dash.search.submit')}</button>
    </form>
  )

  return (
    <section className="db-panel db-records" aria-busy={loading}>
      {overview ? (
        // Tableau de bord : titre de la liste, puis recherche
        <>
          <div className="db-panel-heading">
            <div>
              <h2>{list('title')}</h2>
              <p>{list('description')}</p>
            </div>
            {createButton}
          </div>
          <div className="db-toolbar">{searchForm}</div>
        </>
      ) : (
        // Rubrique : le titre de page suffit, recherche et création sur une seule ligne
        <div className="db-toolbar db-toolbar--top">
          {searchForm}
          {/* Dossiers archivés : masqués par défaut, consultables par l'administration */}
          <label className="db-archives-toggle">
            <input type="checkbox" checked={archives} onChange={event => onToggleArchives(event.target.checked)} />
            {t('details.showArchived')}
          </label>
          {createButton}
        </div>
      )}

      {body}
    </section>
  )
}

/* ==========================================================================
   Espace personnel (tuteur, oustaz)
   ========================================================================== */

/** Élèves du tuteur ou classes de l'oustaz, sous forme de cartes. */
/** Raccourcis de l'Oustaz vers l'espace pédagogique. */
function OustazShortcuts({ onSelect }) {
  const { t } = useI18n()
  return (
    <section className="db-panel db-quick-actions db-oustaz-shortcuts" aria-labelledby="db-oustaz-title">
      <div className="db-panel-heading">
        <h2 id="db-oustaz-title">{t('dash.quick.title')}</h2>
      </div>
      {PEDAGOGY_KEYS.map(key => (
        <button key={key} type="button" className="db-action" onClick={() => onSelect(key)}>
          <span className="db-action-icon"><Icon name={SECTION_ICONS[key]} /></span>
          <span className="db-action-text">
            <strong>{t(`dash.sections.${key}`)}</strong>
            <small>{t(`dash.sectionIntros.${key}`)}</small>
          </span>
          <ArrowIcon size={17} />
        </button>
      ))}
    </section>
  )
}

function PersonalRecords({ user, records, loading, error, onOpenSynthese }) {
  const { t } = useI18n()
  const tuteur = user?.role === 'tuteur'

  let body
  if (loading) body = <div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loading')}</div>
  else if (error) body = <EmptyState title={t('dash.unavailable.title')} description={t('dash.unavailable.personalText')} />
  else if (!records.length) body = <EmptyState title={t('dash.personal.emptyTitle')} description={t('dash.personal.emptyText')} />
  else {
    body = (
      <div className="db-personal-records">
        {records.map(record => (
          <article key={record.id} className="db-record-card">
            <header>
              {tuteur
                ? <Avatar person={record} className="db-avatar--large" />
                : <span className="db-avatar db-avatar--large db-avatar--square" aria-hidden="true"><Icon name="book" /></span>}
              <div>
                <h3>{tuteur ? fullName(record) : record.nom}</h3>
                <p>{tuteur ? <bdi>{record.matricule}</bdi> : `${record.niveau} · ${record.annee_scolaire}`}</p>
              </div>
              {!tuteur && <span className="db-badge db-badge--success">{t('dash.personal.students', { count: record.eleves.length })}</span>}
            </header>

            {tuteur ? (
              // Inscriptions de l'élève, par année scolaire
              <>
                <ul>
                  {record.inscriptions.map(inscription => (
                    <li key={inscription.id}>
                      <span>{t('dash.personal.year', { year: inscription.annee_scolaire })}{inscription.classe ? ` · ${inscription.classe}` : ''}</span>
                      <StatusBadge value={inscription.statut} />
                    </li>
                  ))}
                </ul>
                {/* Diplômes délivrés : imprimables dans un nouvel onglet */}
                {record.diplomes?.length > 0 && (
                  <ul className="db-diplomas">
                    {record.diplomes.map(diplome => (
                      <li key={diplome.id}>
                        <span><Icon name="award" size={16} />{diplome.intitule}</span>
                        <a className="db-text-button" href={`/diplomes/${diplome.id}`} target="_blank" rel="noopener noreferrer" aria-label={t('dip.printFor', { title: diplome.intitule })}>
                          <Icon name="printer" size={15} />{t('dip.print')}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {/* Progression : récitation, présences, comportement, fiches */}
                <button type="button" className="db-button db-button--secondary db-record-action" onClick={() => onOpenSynthese(record)} aria-label={t('synth.openFor', { name: fullName(record) })}>
                  <Icon name="book" size={16} />{t('synth.open')}
                </button>
              </>
            ) : (
              // Élèves affectés à la classe
              <ul>
                {record.eleves.map(eleve => (
                  <li key={eleve.id}>
                    {/* Photo de l'élève : aide l'oustaz à reconnaître chacun (appel) */}
                    <span className="db-person">
                      <Avatar person={eleve} />
                      <span>{fullName(eleve)}<small><bdi>{eleve.matricule}</bdi></small></span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    )
  }

  return (
    <section className="db-panel" aria-labelledby="db-personal-title">
      <div className="db-panel-heading">
        <div>
          <h2 id="db-personal-title">{tuteur ? t('dash.personal.tuteurTitle') : t('dash.personal.oustazTitle')}</h2>
          <p>{tuteur ? t('dash.personal.tuteurText') : t('dash.personal.oustazText')}</p>
        </div>
      </div>
      {body}
    </section>
  )
}

/* ==========================================================================
   Page
   ========================================================================== */

export default function DashboardPage() {
  const navigate = useNavigate()
  const { t, formatDate, serverMessage } = useI18n()
  const { confirm, alert } = useDialogs()
  const [user, setUser] = useState(getUtilisateur)
  const [verified, setVerified] = useState(false)
  const [section, setSection] = useState('overview')
  const [year, setYear] = useState('')
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState(null)
  const [myRecords, setMyRecords] = useState([])
  const [loading, setLoading] = useState(true)
  // Erreur de chargement : message + code HTTP (pour la traduire au moment de l'affichage)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState(null)
  // Fenêtre « Changer la photo » : { kind: 'eleve'|'user', record }
  const [photoTarget, setPhotoTarget] = useState(null)
  // Compte dont le mot de passe est en cours de réinitialisation
  const [resettingId, setResettingId] = useState(null)
  // Fiche de détail ouverte : { kind: 'eleve'|'user'|'classe', record } ; synthèse d'un enfant (tuteur)
  const [detail, setDetail] = useState(null)
  const [synthese, setSynthese] = useState(null)
  // Listes : inclure les dossiers archivés
  const [archives, setArchives] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const token = getToken()
  const passwordRequired = user?.must_change_password
  const admin = user?.role === 'admin'
  // Onglet ouvert dans chaque rubrique regroupée de l'administration
  const [tabs, setTabs] = useState({ finances: 'paiements', pedagogie: 'suivi' })
  // Vue réellement affichée : l'onglet choisi pour Finances / Pédagogie, sinon la rubrique elle-même
  const view = admin && ADMIN_TABS[section] ? tabs[section] : section
  // Le tableau de bord administrateur affiche la liste des élèves
  const tableSection = listFor(section)

  // Session expirée : retour à la connexion (fonction stable, utilisée par les rubriques enfants)
  const sessionExpired = useCallback(() => { clearSession(); navigate('/login', { replace: true }) }, [navigate])

  // 1. Vérifie la session auprès du serveur (GET /v1/auth/me)
  useEffect(() => {
    if (!token || passwordRequired || verified) return
    let cancelled = false
    getCurrentUser().then(current => { if (!cancelled) { setUser(current); setVerified(true) } }).catch(err => {
      if (cancelled) return
      if (err.status === 401) { clearSession(); navigate('/login', { replace: true }) }
      else { setError({ message: err.message, status: err.status }); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [token, passwordRequired, verified, navigate, revision])

  // 2. Charge les données : tableau de bord (admin) ou dossiers personnels (tuteur, oustaz)
  useEffect(() => {
    if (!verified || passwordRequired) return
    let cancelled = false
    const request = admin ? getDashboard({ section: tableSection, q: search, annee: year, page, archives }) : getMyRecords(user.role)
    request.then(response => {
      if (cancelled) return
      if (admin) setData(response)
      else setMyRecords(response)
      setLoading(false)
      setError(null)
    }).catch(err => {
      if (cancelled) return
      if (err.status === 401) { clearSession(); navigate('/login', { replace: true }) }
      else { setError({ message: err.message, status: err.status }); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [verified, passwordRequired, admin, user?.role, tableSection, search, year, page, archives, revision, navigate])

  // 3. Menu mobile ouvert : la touche Échap le referme
  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = event => { if (event.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  if (!token) return <Navigate to="/login" replace />

  /** Change de rubrique et remet recherche et pagination à zéro. */
  function selectSection(next) {
    setSection(next); setPage(1); setSearch(''); setDraft(''); setMenuOpen(false); setError(null)
    if (listFor(next) !== tableSection || search || page !== 1) setLoading(true)
  }

  /** Recharge la session et les données. */
  function refresh() { setLoading(true); setError(null); setRevision(r => r + 1) }

  async function signOut() {
    setLoggingOut(true)
    try { await logout(); navigate('/login', { replace: true }) }
    catch (err) { setError({ message: err.message, status: err.status }); setLoggingOut(false) }
  }

  /**
   * Fermeture d'un formulaire après enregistrement réussi.
   * @param {string} message      Message de confirmation (déjà traduit)
   * @param {string} [messageKey] Clé de traduction à transmettre à la page de connexion
   */
  function saved(message, messageKey) {
    setForm(null)
    if (passwordRequired) { navigate('/login', { replace: true, state: { message, messageKey } }); return }
    setNotice(message); setPage(1); refresh()
  }

  /** Réinitialise le mot de passe d'un compte (« passer »), après confirmation. */
  async function resetAccount(account) {
    const ok = await confirm({
      title: t('users.reset.confirmTitle', { name: `${account.prenom} ${account.nom}` }),
      message: t('users.reset.confirmText'),
      confirmLabel: t('users.reset.button'),
      tone: 'warning',
    })
    if (!ok) return
    setResettingId(account.id)
    try {
      const response = await resetPassword(account.id)
      setNotice(`${serverMessage(response.message, 200, { fallback: 'original' })} ${t('users.reset.done', { name: `${account.prenom} ${account.nom}` })}`)
      refresh()
    } catch (err) {
      if (err.status === 401) { sessionExpired(); return }
      const detail = err.errors?.user?.[0]
      await alert({ title: t('dialogs.failed'), message: serverMessage(detail || err.message, err.status || 0, { fallback: 'original' }), tone: 'danger' })
    } finally {
      setResettingId(null)
    }
  }

  /** Archive un élève ou un compte depuis la liste : fenêtre de confirmation avec motif facultatif. */
  async function archiveRecord(kind, record) {
    const name = `${record.prenom} ${record.nom}`
    const motif = await confirm({
      title: t(`actions.archiveTitle.${kind}`, { name }),
      message: t(kind === 'eleve' ? 'details.eleve.archiveHelp' : 'details.user.archiveHelp'),
      confirmLabel: t(`details.${kind === 'eleve' ? 'eleve' : 'user'}.submit.archive`),
      tone: 'danger',
      input: { label: t('details.reason'), placeholder: t('details.reasonPlaceholder') },
    })
    if (motif === false) return
    try {
      const response = kind === 'eleve' ? await archiveEleve(record.id, motif) : await archiveUser(record.id, motif)
      setNotice(serverMessage(response.message, 200, { fallback: 'original' }))
      refresh()
    } catch (err) {
      if (err.status === 401) { sessionExpired(); return }
      await alert({ title: t('dialogs.failed'), message: serverMessage(Object.values(err.errors || {})[0]?.[0] || err.message, err.status || 0, { fallback: 'original' }), tone: 'danger' })
    }
  }

  // Actions des lignes de tableau (menu « ⋮ ») ; mode : 'edit' ouvre directement la modification
  const rowActions = {
    currentUserId: user?.id,
    resettingId,
    onPhoto: (kind, record) => setPhotoTarget({ kind, record }),
    onReset: resetAccount,
    onArchive: archiveRecord,
    onDetail: (kind, record, mode) => setDetail({ kind, record, mode }),
  }

  /** Ouvre la fiche d'un élève depuis une autre fiche (classe…) : « Fermer » revient à la fiche d'origine. */
  const openEleveFrom = previous => eleve => setDetail({ kind: 'eleve', record: eleve, from: previous })

  /** Modification faite depuis une fiche de détail : message + liste rechargée, la fiche reste ouverte. */
  function detailChanged(message) { setNotice(message); refresh() }

  // Recherche dans la liste
  function submitSearch(event) {
    event.preventDefault(); setSearch(draft.trim()); setPage(1); setLoading(true); setRevision(r => r + 1)
  }
  function clearSearch() { setSearch(''); setDraft(''); setPage(1); setLoading(true) }

  // Filtre par année scolaire
  function changeYear(event) { setYear(event.target.value); setPage(1); setLoading(true) }

  // Date du jour en toutes lettres, avec majuscule en français : « Jeudi 8 octobre 2026 »
  const todayText = formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const today = todayText.charAt(0).toUpperCase() + todayText.slice(1)
  const overview = section === 'overview'
  const actionsDisabled = !data || loading || Boolean(error)
  // Erreur affichée : message du serveur, traduit si l'interface est en arabe (le réseau est déjà traduit)
  const errorText = error ? (error.status ? serverMessage(error.message, error.status) : error.message) : ''

  return (
    <div className="db-shell">
      <a className="db-skip" href="#dashboard-content">{t('dash.skip')}</a>

      {/* Voile derrière le menu ouvert sur mobile */}
      {menuOpen && <button type="button" className="db-menu-backdrop" aria-label={t('dash.menu.close')} onClick={() => setMenuOpen(false)} />}

      <Sidebar user={user} section={section} menuOpen={menuOpen} onSelect={selectSection} />

      <div className="db-workspace">
        <Topbar
          section={section}
          menuOpen={menuOpen}
          today={today}
          loggingOut={loggingOut}
          onOpenMenu={() => setMenuOpen(true)}
          onSignOut={signOut}
        />

        <main id="dashboard-content" className="db-main">
          {/* ---------- Titre de la page et outils ---------- */}
          <div className="db-page-heading">
            <div>
              {overview ? (
                <>
                  {/* Ligne « السلام عليكم » au-dessus du titre (seulement en français) */}
                  {t('dash.greetingLine') && <span className="db-greeting-arabic" lang="ar" dir="rtl">{t('dash.greetingLine')}</span>}
                  <h1>{user?.prenom ? t('dash.greetingWithName', { name: user.prenom }) : t('dash.greeting')}</h1>
                  <p>{t(`dash.welcome.${['admin', 'tuteur', 'oustaz'].includes(user?.role) ? user.role : 'fallback'}`)}</p>
                </>
              ) : (
                <>
                  <h1>{t(`dash.sections.${section}`)}</h1>
                  <p>{t(`dash.sectionIntros.${view}`)}</p>
                </>
              )}
            </div>

            <div className="db-page-tools">
              {admin && !passwordRequired && !OWN_DATA_SECTIONS.includes(section) && (
                <div className="db-year">
                  <label htmlFor="dashboard-year">{t('dash.year.label')}</label>
                  <select id="dashboard-year" value={year} onChange={changeYear}>
                    <option value="">{t('dash.year.all')}</option>
                    {data?.annees.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              )}
              <button type="button" className="db-button db-button--secondary" onClick={refresh} disabled={loading || passwordRequired}>
                <Icon name="refresh" size={17} />{t('dash.refresh')}
              </button>
            </div>
          </div>

          {/* ---------- Onglets d'une rubrique regroupée (Finances, Pédagogie) ---------- */}
          {admin && ADMIN_TABS[section] && (
            <div className="db-tabs" role="tablist" aria-label={t(`dash.sections.${section}`)}>
              {ADMIN_TABS[section].map(key => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={view === key}
                  className={`db-tab ${view === key ? 'db-tab--active' : ''}`}
                  onClick={() => { setTabs(previous => ({ ...previous, [section]: key })); setNotice('') }}
                >
                  <Icon name={SECTION_ICONS[key]} size={17} />{t(`dash.sections.${key}`)}
                </button>
              ))}
            </div>
          )}

          {/* ---------- Messages ---------- */}
          {notice && (
            <div className="db-alert db-alert--success" role="status">
              <Icon name="check" />
              <span>{notice}</span>
              <button type="button" className="db-icon-button" aria-label={t('dash.dismiss')} onClick={() => setNotice('')}>
                <Icon name="close" size={18} />
              </button>
            </div>
          )}
          {error && (
            <div className="db-alert db-alert--error" role="alert">
              <span>{errorText}</span>
              <button type="button" className="db-button db-button--secondary" onClick={refresh}>{t('dash.retry')}</button>
            </div>
          )}

          {/* ---------- Contenu (rubriques chargées à la demande : Suspense) ---------- */}
          <Suspense fallback={<div className="db-loading" role="status"><span className="db-spinner" />{t('dash.loadingData')}</div>}>
          {passwordRequired ? (
            <>
              <div className="db-panel">
                <EmptyState title={t('dash.passwordStep.title')} description={t('dash.passwordStep.text')} />
              </div>
              <RecordForm kind="password" onClose={signOut} onSaved={saved} onSessionExpired={sessionExpired} />
            </>
          ) : admin && view === 'paiements' ? (
            // Rubrique Paiements : données et fenêtres propres (voir paiements/PaymentsSection.jsx)
            <PaymentsSection refreshKey={revision} onNotice={setNotice} onSessionExpired={sessionExpired} />
          ) : admin && view === 'depenses' ? (
            // Rubrique Dépenses : données et fenêtres propres (voir depenses/DepensesSection.jsx)
            <DepensesSection refreshKey={revision} onNotice={setNotice} onSessionExpired={sessionExpired} />
          ) : admin && view === 'eleveDuMois' ? (
            <EleveDuMoisSection
              refreshKey={revision}
              onSessionExpired={sessionExpired}
              onOpenEleve={eleve => setDetail({ kind: 'eleve', record: eleve })}
              onOpenClasse={classe => setDetail({ kind: 'classe', record: classe })}
            />
          ) : admin && view === 'diplomes' ? (
            <DiplomesSection
              refreshKey={revision}
              onNotice={setNotice}
              onSessionExpired={sessionExpired}
              onOpenEleve={eleve => setDetail({ kind: 'eleve', record: eleve })}
            />
          ) : (admin || user?.role === 'oustaz') && PEDAGOGY_KEYS.includes(view) ? (
            // Espace pédagogique : suivi coranique, appel, planning, exemplarité (voir pedagogie/)
            <Pedagogie section={view} admin={admin} refreshKey={revision} onNotice={setNotice} onSessionExpired={sessionExpired} />
          ) : admin ? (
            <>
              {overview && <MetricCards data={data} loading={loading} year={year} onSelect={selectSection} />}

              <div className={`db-content-grid ${overview ? '' : 'db-content-grid--full'}`}>
                <RecordsPanel
                  overview={overview}
                  tableSection={tableSection}
                  data={data}
                  loading={loading}
                  error={error}
                  search={search}
                  draft={draft}
                  page={page}
                  year={year}
                  onDraftChange={setDraft}
                  onSearch={submitSearch}
                  onClearSearch={clearSearch}
                  onPrevious={() => { setPage(p => p - 1); setLoading(true) }}
                  onNext={() => { setPage(p => p + 1); setLoading(true) }}
                  onCreate={setForm}
                  actions={rowActions}
                  archives={archives}
                  onToggleArchives={value => { setArchives(value); setPage(1); setLoading(true) }}
                />

                {overview && (
                  <aside className="db-right-column">
                    <QuickActions disabled={actionsDisabled} onCreate={setForm} />
                    <ActivityFeed data={data} loading={loading} error={error} />
                  </aside>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Oustaz : accès direct à son travail quotidien */}
              {user?.role === 'oustaz' && <OustazShortcuts onSelect={selectSection} />}
              <PersonalRecords user={user} records={myRecords} loading={loading} error={error} onOpenSynthese={setSynthese} />
              {/* Tuteur : mensualités de ses enfants */}
              {user?.role === 'tuteur' && <TuteurPaiements refreshKey={revision} />}
            </>
          )}

          </Suspense>

          <footer className="db-footer">
            <span>© {new Date().getFullYear()} {t('common.instituteName')}</span>
            <span>
              {t('common.developedBy')}{' '}
              <a href="https://xelltekk.com/" target="_blank" rel="noopener noreferrer">XELLTEKK</a>
            </span>
          </footer>
        </main>
      </div>

      {form && (
        <RecordForm
          kind={form}
          options={data.options}
          year={data.annee_scolaire_courante}
          onClose={() => setForm(null)}
          onSaved={saved}
          onSessionExpired={sessionExpired}
        />
      )}
      <Suspense fallback={null}>
      {detail?.kind === 'eleve' && (
        <EleveDetail
          key={detail.record.id}
          id={detail.record.id}
          year={data?.annee_scolaire_courante}
          classes={data?.options.classes ?? []}
          modes={data?.options.paiement?.modes ?? ['especes']}
          onClose={() => setDetail(detail.from ?? null)}
          onChanged={detailChanged}
          onSessionExpired={sessionExpired}
        />
      )}
      {detail?.kind === 'user' && (
        <UserDetail id={detail.record.id} currentUserId={user?.id} onClose={() => setDetail(null)} onChanged={detailChanged} onSessionExpired={sessionExpired} />
      )}
      {detail?.kind === 'classe' && (
        <ClasseDetail
          key={detail.record.id}
          classe={detail.record}
          initialMode={detail.mode}
          oustazs={data?.options.oustazs ?? []}
          onClose={() => setDetail(null)}
          onChanged={detailChanged}
          onOpenEleve={openEleveFrom(detail)}
          onSessionExpired={sessionExpired}
        />
      )}
      {synthese && <SyntheseDialog eleve={synthese} onClose={() => setSynthese(null)} onSessionExpired={sessionExpired} />}
      </Suspense>
      {photoTarget && (
        <PhotoDialog
          kind={photoTarget.kind}
          record={photoTarget.record}
          onClose={() => setPhotoTarget(null)}
          onSaved={message => { setPhotoTarget(null); setNotice(message); refresh() }}
          onSessionExpired={sessionExpired}
        />
      )}
    </div>
  )
}
