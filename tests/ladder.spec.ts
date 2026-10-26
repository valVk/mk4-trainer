import { describe, expect, it } from 'vitest'

import { buildUnits, isWrongPress, nextUnit, scoreTempo, starsFor, tempoPasses, waitPasses } from '@/lib/ladder'
import type { Phrase, Section } from '@/lib/phrases'
import type { Step } from '@/lib/song'

const step = (time: number, ...keys: number[]): Step => ({ time, keys })

function phrase(index: number, start: number, isNew: boolean): Phrase {
  return { index, startBar: index * 4, endBar: index * 4 + 4, start, end: start + 8, steps: [step(start, 60), step(start + 2, 64)], group: isNew ? index : 0, transpose: 0, isNew }
}

const phrases = [phrase(0, 0, true), phrase(1, 8, false), phrase(2, 16, true), phrase(3, 24, false)]
const sections: Section[] = [
  { index: 0, startBar: 0, endBar: 8, start: 0, end: 16, channels: [0] },
  { index: 1, startBar: 8, endBar: 12, start: 16, end: 24, channels: [0] },
  { index: 2, startBar: 12, endBar: 16, start: 24, end: 32, channels: [0] },
]

describe('buildUnits', () => {
  const units = buildUnits(phrases, sections)

  it('lists new phrases, then sections with 2+ phrases, then the whole part', () => {
    expect(units.map((unit) => unit.id)).toEqual(['p0', 'p2', 's0', 'all'])
    expect(units.map((unit) => unit.kind)).toEqual(['phrase', 'phrase', 'section', 'part'])
  })

  it('gives each unit its time span, steps and rungs', () => {
    const section = units.find((unit) => unit.id === 's0')!
    expect([section.start, section.end, section.steps.length]).toEqual([0, 16, 4])
    expect(units[0]!.rungs.map((rung) => `${rung.mode}@${rung.rate}`)).toEqual(['listen@1', 'wait@0.6', 'wait@1', 'tempo@0.7', 'tempo@1'])
    expect(section.rungs).toHaveLength(3)
    expect(units[units.length - 1]!.rungs.map((rung) => rung.mode)).toEqual(['tempo', 'tempo'])
    expect(units[units.length - 1]!.steps).toHaveLength(8)
  })
})

describe('stars and next unit', () => {
  const units = buildUnits(phrases, sections)

  it('gives a star for each of the last three rungs', () => {
    const phraseUnit = units[0]!
    expect([0, 1, 2, 3, 4, 5].map((passed) => starsFor(phraseUnit, passed))).toEqual([0, 0, 0, 1, 2, 3])
    const part = units[units.length - 1]!
    expect([0, 1, 2].map((passed) => starsFor(part, passed))).toEqual([1, 2, 3])
  })

  it('suggests the first unit with rungs left', () => {
    expect(nextUnit(units, {})!.id).toBe('p0')
    expect(nextUnit(units, { p0: 5 })!.id).toBe('p2')
    expect(nextUnit(units, { p0: 5, p2: 5, s0: 3, all: 2 })).toBeNull()
  })
})

describe('wait mode', () => {
  it('spots presses that are not in the step', () => {
    const chord = step(0, 60, 64, 67)
    expect(isWrongPress(chord, 64, false)).toBe(false)
    expect(isWrongPress(chord, 62, false)).toBe(true)
    expect(isWrongPress(chord, 76, false)).toBe(true)
    expect(isWrongPress(chord, 76, true)).toBe(false)
  })

  it('passes with up to 20% wrong presses, at least one allowed', () => {
    expect(waitPasses(10, 2)).toBe(true)
    expect(waitPasses(10, 3)).toBe(false)
    expect(waitPasses(3, 1)).toBe(true)
  })
})

describe('scoreTempo', () => {
  const steps = [step(1, 60), step(2, 64, 67), step(3, 65)]

  it('hits steps pressed within the window', () => {
    const score = scoreTempo(steps, [{ key: 60, time: 1.05 }, { key: 64, time: 1.98 }, { key: 67, time: 2.03 }, { key: 65, time: 3.4 }], 1, false)
    expect(score.results).toEqual(['hit', 'hit', 'miss'])
    expect(score.accuracy).toBeCloseTo(2 / 3)
    expect(tempoPasses(score)).toBe(false)
  })

  it('narrows the window in song time at lower speeds', () => {
    // 0.15 s off: inside 0.2 s at full speed, outside 0.2 * 0.5 = 0.1 s at half speed.
    expect(scoreTempo([step(1, 60)], [{ key: 60, time: 1.15 }], 1, false).hits).toBe(1)
    expect(scoreTempo([step(1, 60)], [{ key: 60, time: 1.15 }], 0.5, false).hits).toBe(0)
  })

  it('needs every key of a chord and accepts any octave when asked', () => {
    expect(scoreTempo([step(2, 64, 67)], [{ key: 64, time: 2 }], 1, false).hits).toBe(0)
    expect(scoreTempo([step(2, 64, 67)], [{ key: 76, time: 2 }, { key: 79, time: 2 }], 1, true).hits).toBe(1)
  })

  it('passes at 80% or more', () => {
    const steps5 = [1, 2, 3, 4, 5].map((t) => step(t, 60))
    const presses = [1, 2, 3, 4].map((t) => ({ key: 60, time: t }))
    expect(tempoPasses(scoreTempo(steps5, presses, 1, false))).toBe(true)
  })
})
