// The teacher's ladder for the «Песня» mode: units to practise (new phrases, then sections, then the
// whole part), the rungs of each unit, pass rules and scoring. Pure code, no Vue, no UI text.

import type { Phrase, Section } from './phrases'
import { holdVerdict } from './rhythm'
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

// After listening, the speed only goes up: first with the song waiting for the child, then in time.
const PHRASE_RUNGS: Rung[] = [
  { mode: 'listen', rate: 1 },
  { mode: 'wait', rate: 0.6 },
  { mode: 'tempo', rate: 0.6 },
  { mode: 'tempo', rate: 0.8 },
  { mode: 'tempo', rate: 1 },
]
const SECTION_RUNGS: Rung[] = [
  { mode: 'wait', rate: 0.8 },
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

/** Rungs the child may open: the ones passed and the next one; later rungs open by passing. */
export function openRungs(unit: Pick<Unit, 'rungs'>, passedRungs: number): number {
  return Math.min(unit.rungs.length, passedRungs + 1)
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

/** Wrong presses allowed: a share of the steps, at least one. */
export function allowedMistakes(steps: number): number {
  return Math.max(1, Math.floor(steps * WAIT_MISTAKE_SHARE))
}

export function waitPasses(steps: number, mistakes: number): boolean {
  return mistakes <= allowedMistakes(steps)
}

export interface Press {
  key: number
  /** Song time of the press, in seconds, already moved back to the moment the child heard. */
  time: number
  /** Song time the key was let go; null or left out while it is still held (it is then held long enough). */
  end?: number | null
}

/**
 * Whether a press held its note long enough: the same rule as in «Теория» (lib/rhythm holdVerdict, 60 % of the
 * note), so a 1/32 tap on a half note is not a half note. A key still down is held long enough.
 */
export function heldLongEnough(press: Press, length: number | undefined): boolean {
  if (length === undefined || press.end === undefined || press.end === null) return true
  return holdVerdict(press.end - press.time, length) !== 'short'
}

/**
 * A finger on a 25-key mini keyboard often brushes the next key together with the right one.
 * A wrong key this close (semitones) to a right press and this close in real time is not a mistake.
 */
export const GRAZE_SEMITONES = 2
export const GRAZE_REAL_S = 0.08

/** Whether a wrong press is only a neighbour brushed together with one of the right presses. */
export function isGraze(press: Press, rightPresses: readonly Press[], rate: number): boolean {
  const window = GRAZE_REAL_S * rate
  return rightPresses.some((right) => Math.abs(right.key - press.key) <= GRAZE_SEMITONES && Math.abs(right.time - press.time) <= window)
}

export interface WaitPress extends Press {
  /** Whether the press was wrong for the step the song waited on. */
  wrong: boolean
  /** The note it stands for, how long it lasts (seconds), when it was a right key. */
  length?: number
}

/**
 * Wait mode: wrong presses, not counting neighbours brushed together with a right key; and with `checkHold`, right
 * keys let go too soon (a note is a note only when it is held).
 */
export function countMistakes(presses: readonly WaitPress[], rate: number, checkHold = false): number {
  const right = presses.filter((press) => !press.wrong)
  const wrong = presses.filter((press) => press.wrong && !isGraze(press, right, rate)).length
  const short = checkHold ? right.filter((press) => !heldLongEnough(press, press.length)).length : 0
  return wrong + short
}

export interface TempoScore {
  hits: number
  total: number
  accuracy: number
  /** Presses that belong to no step (not counting brushed neighbours and doubled notes). */
  extra: number
  /** Steps pressed in time but let go too soon. */
  short: number
  /** Per step: hit in time and held, pressed in time but let go too soon, or missed. */
  results: ('hit' | 'short' | 'miss')[]
}

const sameNote = (a: number, b: number, anyOctave: boolean) => (anyOctave ? pitchClass(a) === pitchClass(b) : a === b)

/** How long the note a key stands for lasts in a step (the same note, or on «any octave» the same pitch class). */
export function stepLength(step: Step, key: number, anyOctave: boolean): number | undefined {
  const index = step.keys.findIndex((own) => sameNote(own, key, anyOctave))
  return index === -1 ? undefined : step.lengths?.[index]
}

/**
 * Tempo mode, graded like a teacher listens: a step is hit when each of its keys has its own press
 * within the window around the step. A press counts once, for the step it is closest to, so one
 * press cannot cover two repeated notes. The window is TEMPO_WINDOW_REAL_S of real time, so it is
 * narrower in song time at lower speeds. Presses that belong to nothing count as extra, so pressing
 * every key does not pass.
 */
export function scoreTempo(steps: readonly Step[], presses: readonly Press[], rate: number, anyOctave: boolean, checkHold = false): TempoScore {
  const window = TEMPO_WINDOW_REAL_S * rate
  const used = new Set<number>()
  // The step a press belongs to for one of its keys: the closest step holding that note.
  const closestStep = (press: Press) => {
    let best = -1
    steps.forEach((step, index) => {
      if (!step.keys.some((key) => sameNote(key, press.key, anyOctave))) return
      if (best === -1 || Math.abs(step.time - press.time) < Math.abs(steps[best]!.time - press.time)) best = index
    })
    return best
  }
  const owner = presses.map(closestStep)
  const results = steps.map((step, index) => {
    const picks: number[] = []
    for (const key of step.keys) {
      let pick = -1
      presses.forEach((press, i) => {
        if (used.has(i) || picks.includes(i) || owner[i] !== index || !sameNote(key, press.key, anyOctave)) return
        if (Math.abs(press.time - step.time) > window) return
        if (pick === -1 || Math.abs(press.time - step.time) < Math.abs(presses[pick]!.time - step.time)) pick = i
      })
      if (pick === -1) return 'miss' as const
      picks.push(pick)
    }
    picks.forEach((i) => used.add(i))
    // In time but let go too soon: not this note (its length is part of it).
    // Picks follow the step's keys, so the k-th pick holds the k-th key's note.
    const held = !checkHold || picks.every((i, k) => heldLongEnough(presses[i]!, step.lengths?.[k]))
    return held ? 'hit' as const : 'short' as const
  })
  const first = (steps[0]?.time ?? 0) - window
  const last = (steps[steps.length - 1]?.time ?? 0) + window
  const matched = presses.filter((_, i) => used.has(i))
  const extra = presses.filter((press, i) => {
    if (used.has(i) || press.time < first || press.time > last) return false
    // The same note doubled in another octave, or struck twice, next to a step that has it.
    const doubled = steps.some((step) => Math.abs(step.time - press.time) <= window && step.keys.some((key) => pitchClass(key) === pitchClass(press.key)))
    return !doubled && !isGraze(press, matched, rate)
  }).length
  const hits = results.filter((result) => result === 'hit').length
  const short = results.filter((result) => result === 'short').length
  return { hits, short, total: steps.length, accuracy: steps.length ? hits / steps.length : 0, extra, results }
}

export function tempoPasses(score: TempoScore): boolean {
  return score.accuracy >= TEMPO_PASS_ACCURACY && score.extra <= allowedMistakes(score.total)
}

export interface AttemptScore {
  passed: boolean
  mode: RungMode
  /** Steps hit in time (tempo) or played (wait). */
  hits: number
  /** Wait mode: wrong presses, not counting brushed neighbours. */
  mistakes: number
  /** Tempo mode: presses that belong to no step. */
  extra: number
  total: number
  /** Tempo mode: share of steps hit; 0 otherwise. */
  accuracy: number
  /** Notes let go too soon (tempo: steps, wait: presses). */
  short: number
}

export interface Attempt {
  mode: RungMode
  steps: readonly Step[]
  /** Tempo mode: every press. */
  presses: readonly Press[]
  /** Wait mode: every press while a step was due. */
  waitPresses: readonly WaitPress[]
  /** Wait mode: steps played before the attempt ended. */
  played: number
  rate: number
  anyOctave: boolean
  /** Judge how long notes are held (keys); not for drums and pads, a hit has no length. */
  checkHold?: boolean
}

/** The verdict on one attempt at a unit, by the rules of its mode. */
export function scoreAttempt(attempt: Attempt): AttemptScore {
  const total = attempt.steps.length
  const checkHold = attempt.checkHold ?? false
  if (attempt.mode === 'tempo') {
    const score = scoreTempo(attempt.steps, attempt.presses, attempt.rate, attempt.anyOctave, checkHold)
    return { passed: tempoPasses(score), mode: 'tempo', hits: score.hits, mistakes: 0, extra: score.extra, total, accuracy: score.accuracy, short: score.short }
  }
  if (attempt.mode === 'wait') {
    const mistakes = countMistakes(attempt.waitPresses, attempt.rate, checkHold)
    const short = checkHold ? attempt.waitPresses.filter((press) => !press.wrong && !heldLongEnough(press, press.length)).length : 0
    return { passed: attempt.played >= total && waitPasses(total, mistakes), mode: 'wait', hits: attempt.played, mistakes, extra: 0, total, accuracy: 0, short }
  }
  return { passed: true, mode: 'listen', hits: 0, mistakes: 0, extra: 0, total, accuracy: 0, short: 0 }
}
