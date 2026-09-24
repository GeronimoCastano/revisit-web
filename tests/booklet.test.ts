import { describe, expect, it } from 'vitest'
import { type PageInfo, boldMask, buildUnits, englishRatio, ordinalValue, runs, sequenced, unitsFor } from '../src/reading/booklet'

describe('headings', () => {
  it('reads lesson numbers in several languages', () => {
    expect(ordinalValue('One')).toBe(1)
    expect(ordinalValue('Twenty-One')).toBe(21)
    expect(ordinalValue('Двенадцать')).toBe(12)
    expect(ordinalValue('dodici')).toBe(12)
    expect(ordinalValue('diciasette: Proverbi Italiani')).toBe(17)
    expect(ordinalValue('One – An Agriturismo')).toBe(1)
    expect(ordinalValue('Twelve:  Checking Out')).toBe(12)
    expect(ordinalValue('One Translations')).toBe(1)
    expect(ordinalValue('12')).toBe(12)
    expect(ordinalValue('Guide')).toBeUndefined()
  })

  it('trusts headings only when they fit the order', () => {
    expect(sequenced([1, 2, 3])).toEqual([1, 2, 3])
    expect(sequenced([10, 2, 3])).toEqual([1, 2, 3]) // "Lezione dieci" misprinted on lesson one
    expect(sequenced([1, undefined, 3])).toEqual([1, 2, 3])
    expect(sequenced([9, 10, 11])).toEqual([9, 10, 11])
  })

  it('spots English', () => {
    expect(englishRatio('Where is the hotel? It is on the left.')).toBeGreaterThan(0.2)
    expect(englishRatio('Где гостиница? Она слева.')).toBe(0)
  })
})

describe('stress marks', () => {
  it('maps bold glyphs onto text and splits runs', () => {
    const glyphs = [...'Мычихаем'].map((c, i) => ({ c, bold: i === 1 || i === 5 }))
    const mask = boldMask('Мы чихаем.', [...glyphs, { c: '.', bold: false }], { value: 0 })
    expect(mask).toEqual([false, true, false, false, false, false, true, false, false, false])
    expect(runs({ number: 1, text: 'Мы чихаем.', bold: mask })).toEqual([
      { text: 'М', bold: false },
      { text: 'ы', bold: true },
      { text: ' чих', bold: false },
      { text: 'а', bold: true },
      { text: 'ем.', bold: false },
    ])
  })
})

describe('units', () => {
  const page = (index: number, ordinal: number | undefined, texts: string[], extra: Partial<PageInfo> = {}): PageInfo => ({
    index,
    ordinal,
    heading: ordinal ? `Урок ${ordinal}` : undefined,
    headingWord: ordinal ? 'урок' : undefined,
    isTranslationTitle: false,
    items: texts.map((text, i) => ({ number: i + 1, text })),
    latinRatio: 0,
    englishRatio: 0,
    ...extra,
  })

  it('pairs interleaved translations line by line', () => {
    const units = buildUnits([
      page(0, 1, ['да', 'нет']),
      page(1, 1, ['yes', 'no'], { heading: 'Lesson One', headingWord: 'lesson', latinRatio: 1, englishRatio: 0.1 }),
      page(2, 2, ['мама', 'папа']),
      page(3, 2, ['mom', 'dad'], { heading: 'Lesson Two', headingWord: 'lesson', latinRatio: 1, englishRatio: 0.1 }),
    ])
    expect(units.map((u) => u.ordinal)).toEqual([1, 2])
    expect(units[1].inlineTranslations).toEqual({ 1: 'mom', 2: 'dad' })
  })

  it('splits long recordings evenly across the booklet', () => {
    const all = buildUnits(Array.from({ length: 20 }, (_, i) => page(i, i + 1, ['a', 'b'])))
    const readings = [{ id: 'r1' }, { id: 'r2' }]
    const first = unitsFor({ id: 'r1', number: 1 }, readings, all)
    expect(first.estimated).toBe(true)
    expect(first.units.map((u) => u.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const ranged = unitsFor({ id: 'r2', number: 11, coverage: [11, 20] }, readings, all)
    expect(ranged.units).toHaveLength(10)
    expect(ranged.estimated).toBe(false)
  })
})
