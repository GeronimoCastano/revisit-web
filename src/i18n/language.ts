import { computed, signal } from '@preact/signals'
import spanish from './es.json'

export type LanguagePreference = 'system' | 'en' | 'es'
export function resolveLanguage(preference: string, languages: readonly string[]): 'en' | 'es' {
  if (preference === 'en' || preference === 'es') return preference
  // Match the primary device language; unsupported languages fall back to English.
  return languages[0]?.toLowerCase().split(/[-_]/)[0] === 'es' ? 'es' : 'en'
}
const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem('revisit.interfaceLanguage')
export const languagePreference = signal<LanguagePreference>(saved === 'en' || saved === 'es' ? saved : 'system')
const deviceLanguages = signal(typeof navigator === 'undefined' ? ['en'] : [...navigator.languages])
export const interfaceLanguage = computed(() => resolveLanguage(languagePreference.value, deviceLanguages.value))

export function setLanguage(preference: LanguagePreference) {
  languagePreference.value = preference
  localStorage.setItem('revisit.interfaceLanguage', preference)
  document.documentElement.lang = interfaceLanguage.value
}
if (typeof window !== 'undefined') {
  window.addEventListener('languagechange', () => {
    deviceLanguages.value = [...navigator.languages]
    document.documentElement.lang = interfaceLanguage.value
  })
  document.documentElement.lang = interfaceLanguage.value
}
export function translate(key: string, args: readonly (string | number | undefined)[] = [], language: 'en' | 'es' = 'en'): string {
  const template = language === 'es' ? (spanish as Record<string, string>)[key] ?? key : key
  return template.replace(/\{(\d+)\}/g, (match, index) => String(args[Number(index)] ?? match))
}
export function t(key: string, args: readonly (string | number | undefined)[] = []): string {
  return translate(key, args, interfaceLanguage.value)
}
