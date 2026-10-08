import { languagePreference, setLanguage, t, type LanguagePreference } from '../i18n/language'
import { Globe } from './icons'

export function LanguagePicker() {
  return (
    <label class="list-row">
      <Globe size={20} class="muted" />
      <span class="grow row-title">{t('Interface language')}</span>
      <select aria-label={t('Interface language')} value={languagePreference.value}
        onChange={(e) => setLanguage(e.currentTarget.value as LanguagePreference)}>
        <option value="system">{t('System')}</option>
        <option value="en">English</option>
        <option value="es">Español</option>
      </select>
    </label>
  )
}
