import { useCallback } from 'react'
import { useI18n } from '../../../i18n/useI18n'

/**
 * Formats communs aux écrans de paiement.
 * @returns {{ amount: (value: number) => string, monthLabel: (mois: string) => string }}
 *   amount(15000)          -> « 15 000 FCFA »
 *   monthLabel('2026-10')  -> « octobre 2026 » (ou en arabe)
 */
export function usePaymentFormat() {
  const { t, formatNumber, formatDate } = useI18n()

  const amount = useCallback((value) => t('pay.amount', { amount: formatNumber(Math.round(Number(value) || 0)) }), [t, formatNumber])

  // Midi : évite tout décalage de jour lié au fuseau horaire
  const monthLabel = useCallback((mois) => formatDate(`${mois}-01T12:00:00`, { month: 'long', year: 'numeric' }), [formatDate])

  return { amount, monthLabel }
}
