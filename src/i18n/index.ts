import { useCallback } from 'react'
import { create } from 'zustand'
import en from './en'
import ru, { ruPluralExtra } from './ru'

export type Lang = 'en' | 'ru'
export type TKey = keyof typeof en
export type TParams = Record<string, string | number>

const dicts: Record<Lang, Record<string, string>> = {
  en,
  ru: { ...ru, ...ruPluralExtra },
}

interface I18nState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useI18nStore = create<I18nState>((set) => ({
  lang: 'en',
  setLang: (lang) => set({ lang }),
}))

function interpolate(template: string, params?: TParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    params[key] !== undefined ? String(params[key]) : match
  )
}

export function translate(lang: Lang, key: TKey, params?: TParams): string {
  const template = dicts[lang][key] ?? dicts.en[key] ?? key
  return interpolate(template, params)
}

/** Pluralized count: looks up `${key}.${form}` via Intl.PluralRules (one/few/many/other). */
export function translateCount(lang: Lang, key: string, n: number): string {
  const form = new Intl.PluralRules(lang).select(n)
  const dict = dicts[lang]
  const template =
    dict[`${key}.${form}`] ?? dict[`${key}.other`] ?? dicts.en[`${key}.other`] ?? key
  return interpolate(template, { n })
}

/** Non-reactive translate for toasts, formatters and other code outside render. */
export function t(key: TKey, params?: TParams): string {
  return translate(useI18nStore.getState().lang, key, params)
}

/** Non-reactive pluralized count. */
export function tn(key: string, n: number): string {
  return translateCount(useI18nStore.getState().lang, key, n)
}

/** Reactive hook — components re-render when the language changes. */
export function useI18n() {
  const lang = useI18nStore((s) => s.lang)
  const tHook = useCallback(
    (key: TKey, params?: TParams) => translate(lang, key, params),
    [lang]
  )
  const tnHook = useCallback(
    (key: string, n: number) => translateCount(lang, key, n),
    [lang]
  )
  return { t: tHook, tn: tnHook, lang }
}

export const MONTHS_SHORT: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ru: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
}

export const DATE_LOCALE: Record<Lang, string> = { en: 'en-US', ru: 'ru-RU' }
