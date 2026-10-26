// The teacher's ladder for the «Песня» mode: units to practise (new phrases, then sections, then the
// whole part), the rungs of each unit, pass rules and scoring. Pure code, no Vue, no UI text.

import type { Phrase, Section } from './phrases'
import { coversStep } from './practice'
import type { Step } from './song'
import { pitchClass } from './theory'

export type RungMode = 'listen' | 'wait' | 'tempo'

export interface Rung {
  mode: RungMode
  /** Playback speed. */
  rate: number
}

export type UnitKind = 'phrase' | 'section' | 'part'

export interface Unit {
  /** Stable id for saved progress: "p3" (phrase 3), "s2" (section 2), "all". */
  id: string
  kind: UnitKind
  /** Phrase or section number (1-based) for display; 0 for the whole part. */
  number: number
  start: number
  end: number
  steps: Step[]
  rungs: Rung[]
}

const PHRASE_RUNGS: Rung[] = [
  { mode: 'listen', rate: 1 },
  { mode: 'wait', rate: 0.6 },
  { mode: 'wait', rate: 1 },
  { mode: 'tempo', rate: 0.7 },
  { mode: 'tempo', rate: 1 },
]
const SECTION_RUNGS: Rung[] = [
  { mode: 'wait', rate: 1 },
  { mode: 'tempo', rate: 0.8 },
  { mode: 'tempo', rate: 1 },
]
const PART_RUNGS: Rung[] = [
  { mode: 'tempo', rate: 0.8 },
  { mode: 'tempo', rate: 1 },
]

/** Wrong presses allowed in wait mode, as a share of the steps (at least one). */
export const WAIT_MISTAKE_SHARE = 0.2
/** Steps to hit in tempo mode. */
export const TEMPO_PASS_ACCURACY = 0.8
/** Timing window around a step in tempo mode, in real seconds (scaled by the speed in song time). */
export const TEMPO_WINDOW_REAL_S = 0.2

/**
 * The units of a part in learning order: each new phrase (repeats are learned once),
 * then each section the part plays in, then the whole part.
 */
export function buildUnits(phrases: readonly Phrase[], sections: readonly Section[]): Unit[] {
  const units: Unit[] = phrases.filter((phrase) => phrase.isNew).map((phrase) => ({
    id: `p${phrase.index}`,
    kind: 'phrase' as const,
    number: phrase.index + 1,
    start: phrase.start,
    end: phrase.end,
    steps: phrase.steps,
    rungs: PHRASE_RUNGS,
  }))
  for (const section of sections) {
    const inside = phrases.filter((phrase) => phrase.start >= section.start - 1e-6 && phrase.end <= section.end + 1e-6)
    if (inside.length < 2) continue
    units.push({
      id: `s${section.index}`,
      kind: 'section',
      number: section.index + 1,
      start: inside[0]!.start,
      end: inside[inside.length - 1]!.end,
      steps: inside.flatMap((phrase) => phrase.steps),
      rungs: SECTION_RUNGS,
    })
  }
  if (phrases.length > 0) {
    units.push({
      id: 'all',
      kind: 'part',
      number: 0,
      start: phrases[0]!.start,
      end: phrases[phrases.length - 1]!.end,
      steps: phrases.flatMap((phrase) => phrase.steps),
      rungs: PART_RUNGS,
    })
  }
  return units
}

/** Stars from passed rungs: the last three rungs of a unit give one star each. */
export function starsFor(unit: Pick<Unit, 'rungs'>, passedRungs: number): number {
  return Math.max(0, Math.min(3, passedRungs - (unit.rungs.length - 3)))
}

/** The first unit that still has rungs to pass (the next thing the teacher suggests), or null when all are done. */
export function nextUnit(units: readonly Unit[], passed: Readonly<Record<string, number>>): Unit | null {
  return units.find((unit) => (passed[unit.id] ?? 0) < unit.rungs.length) ?? null
}

/** A press that cannot belong to the step: none of its keys (or note names, in «любая октава»). */
export function isWrongPress(step: Step, key: number, anyOctave: boolean): boolean {
  return anyOctave ? !step.keys.some((k) => pitchClass(k) === pitchClass(key)) : !step.keys.includes(key)
}

export function waitPasses(steps: number, mistakes: number): boolean {
  return mistakes <= Math.max(1, Math.floor(steps * WAIT_MISTAKE_SHARE))
}

export interface Press {
  key: number
  /** Song time of the press, in seconds. */
  time: number
}

export interface TempoScore {
  hits: number
  total: number
  accuracy: number
  /** Per step: hit in time, or missed. */
  results: ('hit' | 'miss')[]
}

/**
 * Tempo mode: a step is hit when all its keys were pressed within the window around its time.
 * The window is TEMPO_WINDOW_REAL_S of real time, so it is narrower in song time at lower speeds.
 */
export function scoreTempo(steps: readonly Step[], presses: readonly Press[], rate: number, anyOctave: boolean): TempoScore {
  const window = TEMPO_WINDOW_REAL_S * rate
  const results = steps.map((step) => {
    const near = presses.filter((press) => Math.abs(press.time - step.time) <= window).map((press) => press.key)
    return coversStep(step, near, anyOctave) ? 'hit' as const : 'miss' as const
  })
  const hits = results.filter((result) => result === 'hit').length
  return { hits, total: steps.length, accuracy: steps.length ? hits / steps.length : 0, results }
}

export function tempoPasses(score: TempoScore): boolean {
  return score.accuracy >= TEMPO_PASS_ACCURACY
}
