import { describe, expect, it } from 'vitest'
import { resolveLanguage, translate } from '../src/i18n/language'
import spanish from '../src/i18n/es.json'

describe('interface language', () => {
  it('follows the primary device language, including regional Spanish', () => {
    expect(resolveLanguage('system', ['es-CO', 'en-US'])).toBe('es')
    expect(resolveLanguage('system', ['es_ES'])).toBe('es')
    expect(resolveLanguage('system', ['en-US', 'es'])).toBe('en')
    expect(resolveLanguage('system', ['fr-FR', 'es'])).toBe('en')
    expect(resolveLanguage('system', [])).toBe('en')
  })
  it('lets an explicit preference override the device', () => {
    expect(resolveLanguage('en', ['es-ES'])).toBe('en')
    expect(resolveLanguage('es', ['en-US'])).toBe('es')
  })
  it('keeps course names and numbers intact within translated labels', () => {
    expect(translate('{0} Level {1}', ['English for Spanish Speakers', 3], 'es'))
      .toBe('English for Spanish Speakers Nivel 3')
    expect(translate('Reading Lesson {0}', [9], 'es')).toBe('Lección de lectura 9')
    expect(translate('Reading Lesson {0}', [9], 'en')).toBe('Reading Lesson 9')
    expect(translate('I like Ike.', [], 'es')).toBe('I like Ike.')
  })
  it('preserves every parameter in every translated message', () => {
    const parameters = (s: string) => [...s.matchAll(/\{\d+\}/g)].map(m => m[0]).sort()
    for (const [key, value] of Object.entries(spanish)) expect(parameters(value), key).toEqual(parameters(key))
  })
})
