import { describe, expect, it } from 'vitest'

import { buildUnits, countMistakes, isWrongPress, nextUnit, openRungs, scoreAttempt, scoreTempo, starsFor, tempoPasses, waitPasses } from '@/lib/ladder'
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
    expect(units[0]!.rungs.map((rung) => `${rung.mode}@${rung.rate}`)).toEqual(['listen@1', 'wait@0.6', 'tempo@0.6', 'tempo@0.8', 'tempo@1'])
    expect(section.rungs).toHaveLength(3)
    expect(units[units.length - 1]!.rungs.map((rung) => rung.mode)).toEqual(['tempo', 'tempo'])
    expect(units[units.length - 1]!.steps).toHaveLength(8)
  })
})

describe('stars and next unit', () => {
  const units = buildUnits(phrases, sections)

  it('never slows down after listening, in every kind of unit', () => {
    const units = buildUnits(phrases, sections)
    for (const unit of units) {
      const rates = unit.rungs.filter((rung) => rung.mode !== 'listen').map((rung) => rung.rate)
      expect(rates).toEqual([...rates].sort((a, b) => a - b))
    }
  })

  it('opens the passed rungs and the next one', () => {
    const unit = buildUnits(phrases, sections)[0]!
    expect(openRungs(unit, 0)).toBe(1)
    expect(openRungs(unit, 2)).toBe(3)
    expect(openRungs(unit, 5)).toBe(5)
  })

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

  it('forgives a neighbour key brushed together with the right one', () => {
    // D brushed 30 ms before the right E, in either order; a lone wrong G a second later counts.
    const presses = [
      { key: 62, time: 1.0, wrong: true },
      { key: 64, time: 1.03, wrong: false },
      { key: 65, time: 1.05, wrong: true },
      { key: 67, time: 2.0, wrong: true },
    ]
    expect(countMistakes(presses, 1)).toBe(1)
    // Far keys are real mistakes even when struck together.
    expect(countMistakes([{ key: 72, time: 1, wrong: true }, { key: 64, time: 1, wrong: false }], 1)).toBe(1)
  })
})

describe('holding notes', () => {
  // A half note at 1 s: 1 s long.
  const half = { time: 1, keys: [60], lengths: [1] }

  it('in tempo a note is hit only when held for most of its length, not tapped', () => {
    expect(scoreTempo([half], [{ key: 60, time: 1, end: 1.9 }], 1, false, true).results).toEqual(['hit'])
    expect(scoreTempo([half], [{ key: 60, time: 1, end: 1.05 }], 1, false, true).results).toEqual(['short'])
    // Still held when the attempt ends: held long enough.
    expect(scoreTempo([half], [{ key: 60, time: 1, end: null }], 1, false, true).results).toEqual(['hit'])
    // Drums and pads: a hit has no length.
    expect(scoreTempo([half], [{ key: 60, time: 1, end: 1.05 }], 1, false, false).results).toEqual(['hit'])
  })

  it('a tapped melody does not pass, a held one does', () => {
    const steps = [0, 1, 2, 3].map((time) => ({ time, keys: [60 + time], lengths: [1] }))
    const tapped = steps.map((step) => ({ key: step.keys[0]!, time: step.time, end: step.time + 0.05 }))
    const held = steps.map((step) => ({ key: step.keys[0]!, time: step.time, end: step.time + 0.8 }))
    expect(scoreAttempt({ mode: 'tempo', steps, presses: tapped, waitPresses: [], played: 0, rate: 1, anyOctave: false, checkHold: true }).passed).toBe(false)
    expect(scoreAttempt({ mode: 'tempo', steps, presses: held, waitPresses: [], played: 0, rate: 1, anyOctave: false, checkHold: true }).passed).toBe(true)
  })

  it('waiting, a right key let go too soon is a mistake', () => {
    const presses = [{ key: 60, time: 1, end: 1.04, wrong: false, length: 1 }, { key: 62, time: 2, end: 2.9, wrong: false, length: 1 }]
    expect(countMistakes(presses, 1, true)).toBe(1)
    expect(countMistakes(presses, 1, false)).toBe(0)
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

  it('counts a press once, so one press does not cover two repeated notes', () => {
    const repeated = [step(1, 60), step(1.15, 60)]
    expect(scoreTempo(repeated, [{ key: 60, time: 1.08 }], 1, false).hits).toBe(1)
    expect(scoreTempo(repeated, [{ key: 60, time: 1.0 }, { key: 60, time: 1.16 }], 1, false).hits).toBe(2)
  })

  it('does not pass when every key is pressed', () => {
    const steps5 = [1, 2, 3, 4, 5].map((t) => step(t, 60))
    const mash = steps5.flatMap((item) => [60, 64, 67, 71, 74].map((key) => ({ key, time: item.time })))
    const score = scoreTempo(steps5, mash, 1, false)
    expect(score.hits).toBe(5)
    expect(score.extra).toBe(20)
    expect(tempoPasses(score)).toBe(false)
  })

  it('does not count brushed neighbours, doubled octaves or warming up before the start as extra', () => {
    const presses = [{ key: 50, time: 0.2 }, { key: 60, time: 1 }, { key: 61, time: 1.02 }, { key: 72, time: 1.01 }]
    expect(scoreTempo([step(1, 60)], presses, 1, false).extra).toBe(0)
  })

  it('passes at 80% or more', () => {
    const steps5 = [1, 2, 3, 4, 5].map((t) => step(t, 60))
    const presses = [1, 2, 3, 4].map((t) => ({ key: 60, time: t }))
    expect(tempoPasses(scoreTempo(steps5, presses, 1, false))).toBe(true)
  })
})

describe('scoreAttempt', () => {
  const steps = [step(1, 60), step(2, 62)]
  const base = { steps, presses: [], waitPresses: [], played: 0, rate: 1, anyOctave: false }

  it('passes wait mode only when the unit was played to the end', () => {
    expect(scoreAttempt({ ...base, mode: 'wait', played: 2 }).passed).toBe(true)
    expect(scoreAttempt({ ...base, mode: 'wait', played: 1 }).passed).toBe(false)
  })

  it('keeps wrong presses and extra notes apart', () => {
    const wait = scoreAttempt({ ...base, mode: 'wait', played: 2, waitPresses: [{ key: 70, time: 1, wrong: true }] })
    expect([wait.mistakes, wait.extra]).toEqual([1, 0])
    const tempo = scoreAttempt({ ...base, mode: 'tempo', presses: [{ key: 60, time: 1 }, { key: 62, time: 2 }, { key: 70, time: 1.5 }] })
    expect([tempo.hits, tempo.mistakes, tempo.extra, tempo.passed]).toEqual([2, 0, 1, true])
  })

  it('always passes listening', () => {
    expect(scoreAttempt({ ...base, mode: 'listen' })).toMatchObject({ passed: true, mode: 'listen' })
  })
})
