import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { LANGUAGES, getLanguage, setLanguage, subscribe, translate, translateServerMessage } from './i18n'

/**
 * Hook de traduction : le composant se met à jour dès que la langue change.
 *
 * @example
 *   const { t, formatDate } = useI18n()
 *   <h1>{t('login.title')}</h1>
 *
 * @returns {{
 *   lang: string,                 // « fr » ou « ar »
 *   dir: 'ltr' | 'rtl',
 *   locale: string,               // pour Intl (dates, nombres)
 *   t: (key: string, params?: object) => string,
 *   serverMessage: (message: string, status?: number, options?: object) => string,
 *   formatDate: (value: string | Date, options: Intl.DateTimeFormatOptions) => string,
 *   formatNumber: (value: number) => string,
 *   setLanguage: (code: string) => void,
 * }}
 */
export function useI18n() {
  const lang = useSyncExternalStore(subscribe, getLanguage)
  const { dir, locale } = LANGUAGES[lang]

  const t = useCallback((key, params) => translate(key, params, lang), [lang])
  const serverMessage = useCallback((message, status, options = {}) => translateServerMessage(message, status, { ...options, lang }), [lang])
  const formatDate = useCallback((value, options) => new Intl.DateTimeFormat(locale, options).format(new Date(value)), [locale])
  const formatNumber = useCallback((value) => new Intl.NumberFormat(locale).format(value), [locale])

  return useMemo(
    () => ({ lang, dir, locale, t, serverMessage, formatDate, formatNumber, setLanguage }),
    [lang, dir, locale, t, serverMessage, formatDate, formatNumber],
  )
}
