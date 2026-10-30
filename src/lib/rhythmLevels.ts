// «Теория» → «Ритм» (plan step 17): the rhythm levels Р1–Р10, the tempo ladder inside a level,
// when an attempt passes, and what to tell the child about it. Pure code, no Vue, no UI text
// (hints are ids for the i18n file).

import { generateBar, type Duration, type Rhythm, type RhythmNote, type RhythmScore } from './rhythm'
import type { TimeSignature } from './song'

export interface RhythmLevel {
  id: number
  /** Values the bars are made of. */
  durations: Duration[]
  /** The value this level brings in; shown first, before the tasks. */
  introduces: Duration[]
  rests: boolean
  meter: TimeSignature
  /** Not built yet: needs dots, ties, syncopation or triplets in the generator. */
  soon?: boolean
}

const FOUR: TimeSignature = { numerator: 4, denominator: 4 }

export const RHYTHM_LEVELS: readonly RhythmLevel[] = [
  { id: 1, durations: ['whole', 'half'], introduces: ['whole', 'half'], rests: false, meter: FOUR },
  { id: 2, durations: ['whole', 'half', 'quarter'], introduces: ['quarter'], rests: false, meter: FOUR },
  { id: 3, durations: ['whole', 'half', 'quarter'], introduces: [], rests: true, meter: FOUR },
  { id: 4, durations: ['half', 'quarter', 'eighth'], introduces: ['eighth'], rests: true, meter: FOUR },
  { id: 5, durations: ['quarter', 'eighth', 'sixteenth'], introduces: ['sixteenth'], rests: false, meter: FOUR },
  { id: 6, durations: ['half', 'quarter', 'eighth'], introduces: [], rests: true, meter: FOUR, soon: true },
  { id: 7, durations: ['half', 'quarter', 'eighth'], introduces: [], rests: true, meter: { numerator: 3, denominator: 4 }, soon: true },
  { id: 8, durations: ['quarter', 'eighth'], introduces: [], rests: true, meter: FOUR, soon: true },
  { id: 9, durations: ['quarter', 'eighth'], introduces: [], rests: false, meter: FOUR, soon: true },
  { id: 10, durations: ['quarter', 'eighth'], introduces: [], rests: false, meter: { numerator: 6, denominator: 8 }, soon: true },
]

export function rhythmLevel(id: number): RhythmLevel {
  return RHYTHM_LEVELS.find((level) => level.id === id) ?? RHYTHM_LEVELS[0]!
}

/** Tempo steps inside a level, slow to fast (plan: 60 → 80 → 100, and only then something new). */
export const RHYTHM_TEMPOS = [60, 80, 100] as const
/** Passed rhythms needed on one tempo step before the next; each step passed gives a star. */
export const PASSES_PER_TEMPO = 3
/** Bars in one task: two, so a rhythm is a short phrase. */
export const TASK_BARS = 2

/** Saved progress of one level: passed rhythms in total (stars and tempo follow from it). */
export interface RhythmLevelProgress {
  passes: number
}

/** Stored progress; anything broken is dropped. */
export function parseRhythmProgress(value: unknown): Record<number, RhythmLevelProgress> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const progress: Record<number, RhythmLevelProgress> = {}
  for (const [key, item] of Object.entries(value)) {
    const passes = (item as Partial<RhythmLevelProgress> | null)?.passes
    if (RHYTHM_LEVELS.some((level) => level.id === Number(key)) && typeof passes === 'number' && passes >= 0) progress[Number(key)] = { passes: Math.floor(passes) }
  }
  return progress
}

export function starsOf(passes: number): number {
  return Math.min(RHYTHM_TEMPOS.length, Math.floor(passes / PASSES_PER_TEMPO))
}

/** The tempo the child plays at now: it only goes up as rhythms are passed. */
export function tempoOf(passes: number): number {
  return RHYTHM_TEMPOS[Math.min(RHYTHM_TEMPOS.length - 1, Math.floor(passes / PASSES_PER_TEMPO))]!
}

/** Levels open one by one: the next after all stars in the one before; levels not built yet stay closed. */
export function isOpen(id: number, progress: Readonly<Record<number, RhythmLevelProgress>>): boolean {
  const level = rhythmLevel(id)
  if (level.soon) return false
  if (id === 1) return true
  return starsOf(progress[id - 1]?.passes ?? 0) >= RHYTHM_TEMPOS.length
}

/** Where to open: the first open level that still lacks stars, or the last open one. */
export function currentLevel(progress: Readonly<Record<number, RhythmLevelProgress>>): number {
  const open = RHYTHM_LEVELS.filter((level) => isOpen(level.id, progress))
  return (open.find((level) => starsOf(progress[level.id]?.passes ?? 0) < RHYTHM_TEMPOS.length) ?? open[open.length - 1] ?? RHYTHM_LEVELS[0]!).id
}

/** A task: TASK_BARS bars of the level's values. */
export function makeTask(level: RhythmLevel, random: () => number = Math.random): Rhythm {
  const notes: RhythmNote[] = []
  for (let bar = 0; bar < TASK_BARS; bar++) notes.push(...generateBar(level.meter, { durations: level.durations, rests: level.rests, random }))
  return { meter: level.meter, notes }
}

/** An attempt passes with no note missed, at most one extra tap, and three quarters of the notes on time. */
export function passes(score: RhythmScore): boolean {
  const missed = score.results.filter((result) => result.verdict === 'missed').length
  return missed === 0 && score.extra <= 1 && score.onTime >= Math.ceil(score.total * 0.75)
}

export type RhythmHint = 'rushing' | 'dragging' | 'missed' | 'extra' | 'holdLonger' | 'letGo' | 'great'

/**
 * One or two things to tell the child, most important first, in the order a teacher would:
 * a missed note, taps in a rest, then hurrying or dragging, then how long notes are held.
 */
export function hintsFor(score: RhythmScore): RhythmHint[] {
  const hints: RhythmHint[] = []
  const results = score.results
  if (results.some((result) => result.verdict === 'missed')) hints.push('missed')
  if (score.extra > 0) hints.push('extra')
  const early = results.filter((result) => result.verdict === 'early').length
  const late = results.filter((result) => result.verdict === 'late').length
  if (early > late) hints.push('rushing')
  else if (late > early) hints.push('dragging')
  if (results.some((result) => result.hold === 'short')) hints.push('holdLonger')
  else if (results.some((result) => result.hold === 'long')) hints.push('letGo')
  return hints.length ? hints.slice(0, 2) : ['great']
}
