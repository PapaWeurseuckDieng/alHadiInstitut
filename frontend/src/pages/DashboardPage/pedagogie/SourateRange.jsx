import { useI18n } from '../../../i18n/useI18n'
import { sourateLabel } from '../../../utils/coran'

/**
 * Passage du Coran : sourate + verset de début, sourate + verset de fin.
 * @param {{ id: string, value: object, onChange: (value: object) => void, sourates: object[], disabled?: boolean, error?: string }} props
 */
export default function SourateRange({ id, value, onChange, sourates, disabled = false, error }) {
  const { t, lang } = useI18n()
  const set = (name, raw) => onChange({ ...value, [name]: raw === '' ? '' : Number(raw) })
  const max = numero => sourates.find(s => s.numero === Number(numero))?.nombre_versets

  const part = (side) => (
    <div className="ped-range-part">
      <span className="ped-range-side">{t(`ped.range.${side}`)}</span>
      <label className="db-sr-only" htmlFor={`${id}-${side}-sourate`}>{t('ped.range.surahOf', { side: t(`ped.range.${side}`) })}</label>
      <select id={`${id}-${side}-sourate`} value={value[`sourate_${side}_id`] ?? ''} disabled={disabled} onChange={event => set(`sourate_${side}_id`, event.target.value)} aria-invalid={Boolean(error)}>
        <option value="">{t('ped.range.chooseSurah')}</option>
        {sourates.map(s => <option key={s.numero} value={s.numero}>{sourateLabel(s, lang)}</option>)}
      </select>
      <label className="db-sr-only" htmlFor={`${id}-${side}-verset`}>{t('ped.range.verseOf', { side: t(`ped.range.${side}`) })}</label>
      <input
        id={`${id}-${side}-verset`}
        type="number"
        inputMode="numeric"
        min="1"
        max={max(value[`sourate_${side}_id`])}
        placeholder={t('ped.range.verse')}
        value={value[`verset_${side}`] ?? ''}
        disabled={disabled}
        onChange={event => set(`verset_${side}`, event.target.value)}
        aria-invalid={Boolean(error)}
      />
    </div>
  )

  return (
    <div className="ped-range">
      {part('debut')}
      <span className="ped-range-arrow db-flip-rtl" aria-hidden="true">→</span>
      {part('fin')}
      {error && <small className="db-field-error ped-range-error">{error}</small>}
    </div>
  )
}
