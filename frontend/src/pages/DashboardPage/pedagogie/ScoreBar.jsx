import { useI18n } from '../../../i18n/useI18n'

/** Niveau d'un score sur 100 : sert à la couleur et au libellé (Excellent, Bien…). */
function scoreLevel(value) {
  if (value === null || value === undefined) return 'none'
  if (value >= 85) return 'excellent'
  if (value >= 70) return 'good'
  if (value >= 50) return 'fair'
  return 'low'
}

/**
 * Barre de score sur 100, colorée selon le niveau, avec la valeur lisible à côté.
 * Une composante absente (null) affiche un tiret.
 *
 * @param {{ value: number|null, label?: string, size?: 'small'|'large', showLevel?: boolean }} props
 *   label : nom accessible, ex. « Exemplarité »
 */
export default function ScoreBar({ value, label, size = 'small', showLevel = false }) {
  const { t } = useI18n()
  const level = scoreLevel(value)
  if (level === 'none') return <span className="score-bar score-bar--none">—</span>
  const rounded = Math.round(value * 10) / 10
  return (
    <span className={`score-bar score-bar--${size} score-bar--${level}`}>
      <span
        className="score-bar-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        aria-label={label ? t('edm.scoreOf', { label, value: rounded }) : undefined}
      >
        <span className="score-bar-fill" style={{ inlineSize: `${Math.min(100, Math.max(0, value))}%` }} />
      </span>
      <span className="score-bar-value">{rounded}</span>
      {showLevel && <span className="score-bar-level">{t(`edm.levels.${level}`)}</span>}
    </span>
  )
}
