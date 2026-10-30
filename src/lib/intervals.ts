// Intervals (plan step 21): the simple ones from the unison to the octave, as the video teaches them. An interval
// has a size in steps (letters: a third is three letters, C-D-E) and in semitones; together they give its quality.
// Pure code, no UI text.

import { keyOf, type Spelled } from './accidentals'

export type IntervalQuality = 'perfect' | 'major' | 'minor' | 'augmented' | 'diminished'

/** The intervals taught, by id: «m3» is a minor third, «A4» the augmented fourth (the tritone). */
export const INTERVAL_IDS = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'A4', 'd5', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'] as const
export type IntervalId = typeof INTERVAL_IDS[number]

export interface Interval {
  id: IntervalId
  /** Size in letters: 1 unison, 3 third, 8 octave. */
  steps: number
  semitones: number
  quality: IntervalQuality
}

/** Semitones of the perfect (1 4 5 8) or major (2 3 6 7) interval of each size. */
const BASE: Record<number, { semitones: number, perfect: boolean }> = {
  1: { semitones: 0, perfect: true },
  2: { semitones: 2, perfect: false },
  3: { semitones: 4, perfect: false },
  4: { semitones: 5, perfect: true },
  5: { semitones: 7, perfect: true },
  6: { semitones: 9, perfect: false },
  7: { semitones: 11, perfect: false },
  8: { semitones: 12, perfect: true },
}

/** Quality from size and semitones: perfect and major intervals are the base; one less is minor (or diminished), one more augmented. */
export function qualityOf(steps: number, semitones: number): IntervalQuality | null {
  const base = BASE[steps]
  if (!base) return null
  const diff = semitones - base.semitones
  if (base.perfect) return diff === 0 ? 'perfect' : diff === 1 ? 'augmented' : diff === -1 ? 'diminished' : null
  return diff === 0 ? 'major' : diff === -1 ? 'minor' : diff === 1 ? 'augmented' : diff === -2 ? 'diminished' : null
}

const ID_OF: Record<string, IntervalId> = Object.fromEntries(INTERVAL_IDS.map((id) => {
  const quality = { P: 'perfect', m: 'minor', M: 'major', A: 'augmented', d: 'diminished' }[id[0]!]!
  return [`${quality}${id.slice(1)}`, id]
}))

export const INTERVALS: readonly Interval[] = INTERVAL_IDS.map((id) => {
  const steps = Number(id.slice(1))
  const shift = { P: 0, M: 0, m: -1, A: 1, d: BASE[steps]!.perfect ? -1 : -2 }[id[0]!]!
  const semitones = BASE[steps]!.semitones + shift
  return { id, steps, semitones, quality: qualityOf(steps, semitones)! }
})

export function interval(id: IntervalId): Interval {
  return INTERVALS.find((item) => item.id === id)!
}

/** The interval between two written notes, the lower first: D-F♯ is a major third, D-G♭ a diminished fourth. */
export function intervalBetween(low: Spelled, high: Spelled): Interval | null {
  const steps = (high.octave * 7 + high.letter) - (low.octave * 7 + low.letter) + 1
  const semitones = keyOf(high) - keyOf(low)
  const quality = qualityOf(steps, semitones)
  const id = quality ? ID_OF[`${quality}${steps}`] : undefined
  return id ? interval(id) : null
}
