/**
 * Pastille d'une personne : sa photo si elle existe, sinon ses initiales (ex. « AF »).
 * @param {{ person: { prenom?: string, nom?: string, photo?: string|null }, className?: string }} props
 *   className : variantes du tableau de bord (db-avatar--large, db-avatar--gold…)
 */
export default function Avatar({ person, className = '' }) {
  const initials = `${person?.prenom?.[0] || ''}${person?.nom?.[0] || ''}`.toUpperCase()
  return (
    <span className={`db-avatar ${className}`} aria-hidden="true">
      {person?.photo ? <img src={person.photo} alt="" loading="lazy" /> : initials}
    </span>
  )
}
