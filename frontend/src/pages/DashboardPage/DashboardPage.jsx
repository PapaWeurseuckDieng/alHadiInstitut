import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon'
import { clearSession, getCurrentUser, getToken, getUtilisateur, logout } from '../../services/authService'
import { getDashboard, getMyRecords } from '../../services/dashboardService'
import RecordForm from './RecordForm'
import './DashboardPage.css'

const roles = { admin: 'Direction générale', oustaz: 'Espace Oustaz', tuteur: 'Espace Tuteur' }
const sections = { overview: 'Tableau de bord', eleves: 'Élèves & inscriptions', classes: 'Classes académiques', users: 'Comptes & accès' }
const icons = { overview: 'dashboard', eleves: 'users', classes: 'book', users: 'shield' }
const actions = { 'user.created': 'Compte créé', 'eleve.enrolled': 'Élève inscrit', 'classe.created': 'Classe créée' }
const fullName = record => `${record.prenom} ${record.nom}`
const initials = record => `${record?.prenom?.[0] || ''}${record?.nom?.[0] || ''}`.toUpperCase()
const formatDate = value => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

function Empty({ title, description, action }) {
  return <div className="db-empty"><span className="db-empty-icon"><Icon name="book" size={26} /></span><h3>{title}</h3><p>{description}</p>{action}</div>
}

function Status({ value }) {
  const active = value === 'actif' || value === 'active'
  return <span className={`db-badge ${active ? '' : 'db-badge--neutral'}`}><span />{active ? 'Actif' : value || 'Non renseigné'}</span>
}

function RecordsTable({ section, records }) {
  if (section === 'classes') return <table><caption className="db-sr-only">Classes académiques</caption><thead><tr><th>Classe / niveau</th><th>Oustaz responsable</th><th>Année scolaire</th><th>Effectif</th><th>Statut</th></tr></thead><tbody>{records.map(c => <tr key={c.id}><td><strong>{c.nom}</strong><small>{c.niveau}</small></td><td>{c.oustaz || 'Non renseigné'}</td><td>{c.annee_scolaire}</td><td><span className="db-count">{c.effectif}</span> élèves</td><td><Status value={c.statut} /></td></tr>)}</tbody></table>
  if (section === 'users') return <table><caption className="db-sr-only">Comptes de l’institut</caption><thead><tr><th>Utilisateur</th><th>Rôle</th><th>Téléphone</th><th>Accès</th><th>Statut</th></tr></thead><tbody>{records.map(u => <tr key={u.id}><td><div className="db-person"><span className="db-avatar">{initials(u)}</span><span><strong>{fullName(u)}</strong><small>{u.matricule}</small></span></div></td><td>{u.role === 'admin' ? 'Administrateur' : u.role === 'oustaz' ? 'Oustaz' : 'Tuteur'}</td><td>{u.telephone}</td><td><span className={`db-badge ${u.must_change_password ? 'db-badge--gold' : ''}`}>{u.must_change_password ? 'Mot de passe à changer' : 'Compte configuré'}</span></td><td><Status value={u.statut} /></td></tr>)}</tbody></table>
  return <table><caption className="db-sr-only">Élèves et inscriptions</caption><thead><tr><th>Élève</th><th>Classe / année</th><th>Tuteurs</th><th>Statut</th></tr></thead><tbody>{records.map(e => <tr key={e.id}><td><div className="db-person"><span className="db-avatar">{initials(e)}</span><span><strong>{fullName(e)}</strong><small>{e.matricule}</small></span></div></td><td>{e.inscriptions.length ? e.inscriptions.map(i => <div className="db-inscription" key={i.id}><span className={i.classe ? '' : 'db-unassigned'}>{i.classe || 'Sans classe'}</span><small>{i.annee_scolaire} · {i.statut === 'active' ? 'Inscription active' : i.statut}</small></div>) : 'Aucune inscription'}</td><td>{e.tuteurs.length ? e.tuteurs.map((name, i) => <span className="db-line" key={i}>{name}</span>) : 'Aucun tuteur'}</td><td><Status value={e.statut} /></td></tr>)}</tbody></table>
}

export default function DashboardPage() {
  const navigate = useNavigate()
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
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const token = getToken()
  const passwordRequired = user?.must_change_password
  const admin = user?.role === 'admin'
  const tableSection = section === 'overview' ? 'eleves' : section

  useEffect(() => {
    if (!token || passwordRequired || verified) return
    let cancelled = false
    getCurrentUser().then(current => { if (!cancelled) { setUser(current); setVerified(true) } }).catch(err => {
      if (cancelled) return
      if (err.status === 401) { clearSession(); navigate('/login', { replace: true }) }
      else { setError(err.message); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [token, passwordRequired, verified, navigate, revision])

  useEffect(() => {
    if (!verified || passwordRequired) return
    let cancelled = false
    const request = admin ? getDashboard({ section: tableSection, q: search, annee: year, page }) : getMyRecords(user.role)
    request.then(response => {
      if (cancelled) return
      if (admin) setData(response)
      else setMyRecords(response)
      setLoading(false)
      setError('')
    }).catch(err => {
      if (cancelled) return
      if (err.status === 401) { clearSession(); navigate('/login', { replace: true }) }
      else { setError(err.message); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [verified, passwordRequired, admin, user?.role, tableSection, search, year, page, revision, navigate])

  if (!token) return <Navigate to="/login" replace />

  function selectSection(next) {
    setSection(next); setPage(1); setSearch(''); setDraft(''); setMenuOpen(false); setError('')
    if ((next === 'overview' ? 'eleves' : next) !== tableSection || search || page !== 1) setLoading(true)
  }
  function refresh() { setLoading(true); setError(''); setRevision(r => r + 1) }
  function sessionExpired() { clearSession(); navigate('/login', { replace: true }) }
  async function signOut() {
    setLoggingOut(true)
    try { await logout(); navigate('/login', { replace: true }) }
    catch (err) { setError(err.message); setLoggingOut(false) }
  }
  function saved(message) {
    setForm(null)
    if (passwordRequired) { navigate('/login', { replace: true, state: { message } }); return }
    setNotice(message); setPage(1); refresh()
  }
  const today = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  const metricCards = data ? [
    { name: 'Élèves inscrits', value: data.stats.eleves, hint: year ? `Année ${year}` : 'Toutes les années', icon: 'users', target: 'eleves' },
    { name: 'Classes académiques', value: data.stats.classes, hint: 'Encadrées par les oustazs', icon: 'book', target: 'classes' },
    { name: 'Inscriptions sans classe', value: data.stats.a_affecter, hint: 'Actives et à affecter', icon: 'calendar', target: 'eleves', gold: true },
    { name: 'Comptes actifs', value: data.stats.comptes_actifs, hint: 'Tous rôles et toutes années', icon: 'shield', target: 'users' },
  ] : []

  return <div className="db-shell">
    <a className="db-skip" href="#dashboard-content">Aller au contenu</a>
    {menuOpen && <button className="db-menu-backdrop" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} />}
    <aside className={`db-sidebar ${menuOpen ? 'db-sidebar--open' : ''}`}>
      <a className="db-brand" href="/tableau-de-bord"><img src="/faviconDara.svg" alt="" /><span><strong>Institut Al-Hadi</strong><small>Éducation · Transmission · Excellence</small></span></a>
      <div className="db-space"><span className="db-space-icon"><Icon name="shield" /></span><span><strong>{roles[user?.role] || 'Mon espace'}</strong><small>{admin ? 'Administration de l’institut' : 'Espace personnel'}</small></span></div>
      <p className="db-nav-label">MON ESPACE</p>
      <nav aria-label="Navigation principale">{(admin ? Object.keys(sections) : ['overview']).map(key => <button key={key} className={`db-nav-item ${section === key ? 'db-nav-item--active' : ''}`} aria-current={section === key ? 'page' : undefined} onClick={() => selectSection(key)}><Icon name={icons[key]} /><span>{sections[key]}</span>{section === key && <span className="db-nav-dot" />}</button>)}</nav>
      <div className="db-sidebar-footer"><div className="db-sidebar-note"><Icon name="book" size={22} /><p>Un espace commun.<br /><strong>Une transmission durable.</strong></p></div><span>Institut Al-Hadi <span>FR</span></span></div>
    </aside>
    <div className="db-workspace">
      <header className="db-topbar"><div className="db-breadcrumb"><button className="db-icon-button db-mobile-menu" aria-label="Ouvrir le menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Icon name="menu" /></button><span>Mon espace</span><span className="db-breadcrumb-separator">/</span><strong>{sections[section]}</strong></div><div className="db-topbar-right"><span className="db-header-label">{roles[user?.role]}</span><span className="db-avatar db-avatar--dark" title={user ? fullName(user) : 'Compte'}>{initials(user)}</span><button className="db-icon-button" onClick={signOut} disabled={loggingOut} aria-label="Se déconnecter" title="Se déconnecter"><Icon name="logout" /></button></div></header>
      <main id="dashboard-content" className="db-main">
        <div className="db-page-heading"><div><p className="db-eyebrow">{admin ? 'DIRECTION & ADMINISTRATION' : 'INSTITUT AL-HADI'}</p><h1>{sections[section]}</h1><p>{admin ? 'L’essentiel de votre institut, au même endroit.' : 'Retrouvez les informations qui vous concernent.'}</p></div><button className="db-button db-button--secondary" onClick={refresh} disabled={loading || passwordRequired}><Icon name="refresh" size={17} />Actualiser</button></div>
        {notice && <div className="db-alert db-alert--success" role="status"><Icon name="check" /><span>{notice}</span><button className="db-icon-button" aria-label="Masquer la confirmation" onClick={() => setNotice('')}><Icon name="close" size={18} /></button></div>}
        {error && <div className="db-alert db-alert--error" role="alert"><span>{error}</span><button className="db-button db-button--secondary" onClick={refresh}>Réessayer</button></div>}
        {passwordRequired ? <><div className="db-panel"><Empty title="Un dernier pas avant de commencer" description="Votre compte est prêt. Changez votre mot de passe temporaire pour accéder à votre espace." /></div><RecordForm kind="password" onClose={signOut} onSaved={saved} onSessionExpired={sessionExpired} /></> : <>
          {section === 'overview' && <section className="db-welcome"><div className="db-welcome-main"><span className="db-welcome-icon"><Icon name="book" size={27} /></span><div><span className="db-welcome-arabic" lang="ar" dir="rtl">السلام عليكم</span><h2>Assalamou ’alaykoum{user?.prenom ? `, ${user.prenom}` : ''}.</h2><p>{admin ? 'Accompagnez les élèves, organisez les classes et facilitez le quotidien de votre équipe.' : user?.role === 'tuteur' ? 'Gardez le lien avec la scolarité des élèves qui vous sont rattachés.' : 'Retrouvez vos classes et les élèves que vous accompagnez.'}</p><div className="db-date"><Icon name="calendar" size={16} />{today}</div></div></div><div className="db-welcome-mark" aria-hidden="true"><Icon name="book" size={95} /></div></section>}
          {admin ? <>
            <div className="db-filter-row"><span><span className="db-live-dot" />Données de l’institut</span><label htmlFor="dashboard-year">Année scolaire <select id="dashboard-year" value={year} onChange={e => { setYear(e.target.value); setPage(1); setLoading(true) }}><option value="">Toutes les années</option>{data?.annees.map(y => <option key={y} value={y}>{y}</option>)}</select></label></div>
            {section === 'overview' && <section className="db-metrics" aria-label="Indicateurs de l’institut">{data ? metricCards.map(m => <button key={m.name} className={`db-metric ${m.gold ? 'db-metric--gold' : ''}`} onClick={() => selectSection(m.target)} disabled={loading}><div><span>{m.name}</span><span className="db-metric-icon"><Icon name={m.icon} /></span></div><strong>{loading ? '…' : new Intl.NumberFormat('fr-FR').format(m.value)}</strong><footer><span>{m.hint}</span><Icon name="arrow" size={17} /></footer></button>) : Array.from({ length: 4 }, (_, i) => <div key={i} className="db-metric db-skeleton" aria-label="Chargement des indicateurs" />)}</section>}
            <div className={`db-content-grid ${section !== 'overview' ? 'db-content-grid--full' : ''}`}>
              <section className="db-panel db-records" aria-busy={loading}><div className="db-panel-heading"><div><h2>{section === 'overview' ? 'Élèves & inscriptions' : sections[section]}</h2><p>{tableSection === 'eleves' ? 'Les dossiers et leur affectation en classe.' : tableSection === 'classes' ? 'Les classes et leurs responsables.' : 'Les accès de votre équipe et des tuteurs.'}</p></div><button className="db-button" disabled={!data || loading || Boolean(error)} onClick={() => setForm({ eleves: 'eleve', classes: 'classe', users: 'user' }[tableSection])}><Icon name="plus" size={17} />{tableSection === 'eleves' ? 'Inscrire un élève' : tableSection === 'classes' ? 'Créer une classe' : 'Créer un compte'}</button></div>
                <form className="db-search" role="search" onSubmit={e => { e.preventDefault(); setSearch(draft.trim()); setPage(1); setLoading(true); setRevision(r => r + 1) }}><Icon name="search" size={18} /><input aria-label={tableSection === 'eleves' ? 'Rechercher un élève par nom ou matricule' : tableSection === 'classes' ? 'Rechercher une classe par nom ou niveau' : 'Rechercher un compte par nom ou téléphone'} placeholder={tableSection === 'eleves' ? 'Rechercher un élève, un matricule…' : tableSection === 'classes' ? 'Rechercher une classe, un niveau…' : 'Rechercher un nom, un téléphone…'} maxLength={120} value={draft} onChange={e => setDraft(e.target.value)} /><button type="submit" disabled={loading}>Rechercher</button>{search && <button type="button" aria-label="Effacer la recherche" onClick={() => { setSearch(''); setDraft(''); setPage(1); setLoading(true) }}><Icon name="close" size={16} /></button>}</form>
                {loading ? <div className="db-loading" role="status"><span className="db-spinner" />Chargement des données…</div> : error ? <Empty title="Données indisponibles" description="Réessayez pour afficher les dernières informations." /> : data?.items.length ? <><div className="db-table-scroll"><RecordsTable section={tableSection} records={data.items} /></div><div className="db-pagination"><span>{data.pagination.total} {tableSection === 'users' ? 'compte(s)' : tableSection === 'classes' ? 'classe(s)' : 'élève(s)'} · Page {data.pagination.page} / {data.pagination.last_page}</span><div><button className="db-button db-button--secondary" disabled={page <= 1} onClick={() => { setPage(p => p - 1); setLoading(true) }}>Précédent</button><button className="db-button db-button--secondary" disabled={page >= data.pagination.last_page} onClick={() => { setPage(p => p + 1); setLoading(true) }}>Suivant</button></div></div></> : <Empty title={search ? 'Aucun résultat' : tableSection === 'classes' ? 'Vos premières classes commencent ici' : tableSection === 'users' ? 'Aucun compte à afficher' : 'Chaque parcours commence par une inscription'} description={search ? 'Essayez un autre nom ou effacez votre recherche.' : year ? 'Aucun dossier ne correspond à cette année scolaire.' : tableSection === 'eleves' ? 'Inscrivez un élève et rattachez-le à son tuteur pour commencer.' : 'Utilisez le bouton ci-dessus pour créer votre premier dossier.'} />}
              </section>
              {section === 'overview' && <aside className="db-right-column"><section className="db-panel db-quick-actions"><div className="db-panel-heading"><div><p className="db-eyebrow">AU QUOTIDIEN</p><h2>Actions rapides</h2></div></div>{[['eleve', 'Inscrire un élève', 'Créer le dossier et l’inscription', 'users'], ['classe', 'Créer une classe', 'Choisir l’oustaz et les élèves', 'book'], ['user', 'Créer un compte', 'Tuteur, oustaz ou administrateur', 'shield']].map(([kind, title, text, icon]) => <button key={kind} className="db-action" disabled={!data || loading || Boolean(error)} onClick={() => setForm(kind)}><span className="db-action-icon"><Icon name={icon} /></span><span><strong>{title}</strong><small>{text}</small></span><Icon name="arrow" size={17} /></button>)}</section><section className="db-panel db-activity"><div className="db-panel-heading"><div><h2>Dernières activités</h2><p>Les opérations enregistrées.</p></div><span className="db-live-dot" /></div>{loading ? <p className="db-muted">Chargement…</p> : error ? <p className="db-muted">Activités indisponibles.</p> : data?.activites.length ? <ol>{data.activites.map(a => <li key={a.id}><span className="db-activity-dot" /><div><strong>{actions[a.action]}</strong><small>Dossier n° {a.entity_id} · {formatDate(a.created_at)}</small></div></li>)}</ol> : <p className="db-muted">Vos prochaines opérations apparaîtront ici.</p>}</section></aside>}
            </div>
          </> : <section className="db-panel"><div className="db-panel-heading"><div><h2>{user?.role === 'tuteur' ? 'Mes élèves' : 'Mes classes'}</h2><p>{user?.role === 'tuteur' ? 'Uniquement les élèves rattachés à votre compte.' : 'Uniquement les classes dont vous êtes responsable.'}</p></div></div>{loading ? <div className="db-loading" role="status"><span className="db-spinner" />Chargement…</div> : error ? <Empty title="Données indisponibles" description="Réessayez pour charger votre espace." /> : !myRecords.length ? <Empty title="Aucun dossier rattaché pour le moment" description="Contactez l’administration si vous attendez un rattachement." /> : <div className="db-personal-records">{myRecords.map(record => <article key={record.id}><span className="db-action-icon"><Icon name={user.role === 'tuteur' ? 'users' : 'book'} /></span><h3>{user.role === 'tuteur' ? fullName(record) : record.nom}</h3><p>{record.matricule || `${record.niveau} · ${record.annee_scolaire}`}</p>{user.role === 'tuteur' ? <ul>{record.inscriptions.map(i => <li key={i.id}>{i.annee_scolaire} <Status value={i.statut} /></li>)}</ul> : <><span className="db-badge">{record.eleves.length} élève(s)</span><ul>{record.eleves.map(e => <li key={e.id}><span>{fullName(e)}<small>{e.matricule}</small></span></li>)}</ul></>}</article>)}</div>}</section>}
        </>}
        <footer className="db-footer"><span>© {new Date().getFullYear()} Institut Al-Hadi</span><span>Éducation & transmission</span></footer>
      </main>
    </div>
    {form && <RecordForm kind={form} options={data.options} year={data.annee_scolaire_courante} onClose={() => setForm(null)} onSaved={saved} onSessionExpired={sessionExpired} />}
  </div>
}
