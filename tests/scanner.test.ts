import { describe, expect, it } from 'vitest'
import {
  courseName,
  coverage,
  guideName,
  levelNumber,
  placeLooseFile,
  scan,
  trackNumber,
  uniqueNumbers,
} from '../src/model/scanner'
import { readingForLesson, readingsBeginAtLesson, trackTitle } from '../src/model/types'

const files = (paths: string[]) => paths.map((path) => ({ source: 'idb' as const, path }))
const range = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i + 1))
const pad = (n: number) => String(n).padStart(2, '0')

describe('file names', () => {
  it('finds track numbers', () => {
    expect(trackNumber('9781442382848_Russian1_U01_Lesson.mp3')).toBe(1)
    expect(trackNumber('Russian_5_Reading_Lesson_07.mp3')).toBe(7)
    expect(trackNumber('9781508236030_Russian4_Unit02_Reading.mp3')).toBe(2)
    expect(trackNumber('Pimsleur Italian 5 - Unit 12.mp3')).toBe(12)
    expect(trackNumber('Unit 12.mp3')).toBe(12)
    expect(trackNumber('Spanish I - 05.mp3')).toBe(5)
  })

  it('finds level numbers', () => {
    expect(levelNumber('Level 3')).toBe(3)
    expect(levelNumber('Level IV')).toBe(4)
    expect(levelNumber('Russian II')).toBe(2)
    expect(levelNumber('Nivel 2')).toBe(2)
    expect(courseName('Russian Level 1')).toBe('Russian')
    expect(courseName('Level 1')).toBeUndefined()
  })

  it('reads recordings that cover several readings', () => {
    expect(coverage('Pimsleur Italian 5 - Reading 01-10.mp3')).toEqual([1, 10])
    expect(coverage('Pimsleur Italian 4 - Reading 04.mp3')).toBeUndefined()
  })

  it('names guides and numbers duplicates by order', () => {
    expect(guideName('Pimsleur Italian - User’s Guide', 'Italian')).toBe('User’s Guide')
    expect(uniqueNumbers([3, 1, 2])).toEqual([3, 1, 2])
    expect(uniqueNumbers([1, 1, undefined])).toEqual([1, 2, 3])
  })

  it('places files picked without folders', () => {
    expect(placeLooseFile('Pimsleur Italian 5 - Unit 12.mp3')).toBe('Italian/Level 5/Pimsleur Italian 5 - Unit 12.mp3')
    expect(placeLooseFile('9781442382831_Russian2_U10_Lesson.mp3')).toBe('Russian/Level 2/9781442382831_Russian2_U10_Lesson.mp3')
    expect(placeLooseFile('Russian_2_Bklt_9781442312838.pdf')).toBe('Russian/Level 2/Readings/Russian_2_Bklt_9781442312838.pdf')
    expect(placeLooseFile("User's Guide.mp3", 'Italian')).toBe("Italian/User's Guide.mp3")
  })
})

describe('scan', () => {
  it('reads the current layout: a reading per lesson in a Readings folder', () => {
    const courses = scan(
      files([
        ...range(30, (i) => `Russian/Level 1/9781442382848_Russian1_U${pad(i)}_Lesson.mp3`),
        ...range(16, (i) => `Russian/Level 1/Readings/9781442382848_Russian1_Unit${pad(i)}_Reading.mp3`),
        'Russian/Level 1/Readings/Russian_1_Bklt.pdf',
      ]),
    )
    expect(courses).toHaveLength(1)
    const level = courses[0].levels[0]
    expect(level.id).toBe('russian|L1')
    expect(level.lessons).toHaveLength(30)
    expect(level.readings).toHaveLength(16)
    expect(level.booklets).toHaveLength(1)
    expect(readingsBeginAtLesson(level)).toBe(15)
    expect(readingForLesson(level, 15)?.id).toBe('russian|L1|reading|1')
    expect(readingForLesson(level, 14)).toBeUndefined()
  })

  it('reads the older layout: long reading recordings and a course guide', () => {
    const courses = scan(
      files([
        "Languages/Italian/User's Guide.mp3",
        'Languages/Italian/The Pimsleur Guide.pdf',
        ...range(30, (i) => `Languages/Italian/Level 1/Pimsleur Italian 1 - Unit ${pad(i)}.mp3`),
        'Languages/Italian/Level 1/Reading/Pimsleur Italian 1 - Reading 1.mp3',
        'Languages/Italian/Level 1/Reading/Pimsleur Italian 1 - Reading 2.mp3',
        ...range(30, (i) => `Languages/Italian/Level 5/Pimsleur Italian 5 - Unit ${pad(i)}.mp3`),
        'Languages/Italian/Level 5/Reading/Pimsleur Italian 5 - Reading 01-10.mp3',
        'Languages/Italian/Level 5/Reading/Pimsleur Italian 5 - Reading 11-20.mp3',
      ]),
    )
    expect(courses.map((c) => c.name)).toEqual(['Italian'])
    const [one, five] = courses[0].levels
    expect(one.readings.map(trackTitle)).toEqual(['Readings, Part 1', 'Readings, Part 2'])
    expect(readingsBeginAtLesson(one)).toBeUndefined()
    expect(five.readings.map(trackTitle)).toEqual(['Readings 1–10', 'Readings 11–20'])
    expect(one.guides.map((g) => g.name)).toEqual(["User's Guide"])
    expect(one.guideDocuments).toHaveLength(1)
  })

  it('merges levels of the same course imported separately', () => {
    const courses = scan(
      files([
        ...range(3, (i) => `Russian Level 1/Unit ${i}.mp3`),
        ...range(3, (i) => `Russian Level 2/Unit ${i}.mp3`),
      ]),
    )
    expect(courses).toHaveLength(1)
    expect(courses[0].levels.map((l) => l.number)).toEqual([1, 2])
  })

  it('treats loose files at the top as one level', () => {
    const courses = scan(files(range(3, (i) => `Pimsleur Italian 3 - Unit ${pad(i)}.mp3`)))
    expect(courses[0].name).toBe('Italian')
    expect(courses[0].levels[0].number).toBe(3)
  })
})
