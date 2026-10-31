// «Теория» → «Ритм» (plan step 17): the rhythm levels Р1–Р10, the tempo ladder inside a level,
// when an attempt passes, and what to tell the child about it. Pure code, no Vue, no UI text
// (hints are ids for the i18n file).

import { barQuarters, generateBar, generateCellBar, noteQuarters, type Duration, type Rhythm, type RhythmCell, type RhythmNote, type RhythmScore } from './rhythm'
import type { TimeSignature } from './song'

/** What a level shows first: a new value or a new idea, with a small example to look at and hear. */
export type IntroId = Duration | 'dottedHalf' | 'dottedQuarter' | 'tie' | 'meters' | 'accent' | 'pickup' | 'syncopation' | 'triplet' | 'sixEight' | 'twoHands'

export interface RhythmLevel {
  id: number
  /** Plain values for the free generator. */
  durations: Duration[]
  /** Ready-made figures instead of plain values, where free values would not read well. */
  cells?: RhythmCell[]
  rests: boolean
  /** Meters to choose from for each task. */
  meters: TimeSignature[]
  /** Sometimes tie the last note of the first bar to the first note of the second. */
  ties?: boolean
  /** Sometimes start with a pickup quarter before the first bar. */
  pickup?: boolean
  /** The strong beat of each bar is accented; on the MK4 it should be played louder. */
  accents?: boolean
  /** 6/8 is counted in eighths: the tempo steps are twice as fast in beats per minute. */
  tempoScale?: number
  /** Every third task is for two hands: «2 против 3». */
  twoHands?: boolean
  introduces: IntroId[]
}

const FOUR: TimeSignature = { numerator: 4, denominator: 4 }
const THREE: TimeSignature = { numerator: 3, denominator: 4 }
const TWO: TimeSignature = { numerator: 2, denominator: 4 }
const SIX_EIGHT: TimeSignature = { numerator: 6, denominator: 8 }

const q = (extra: Partial<RhythmNote> = {}): RhythmNote => ({ duration: 'quarter', ...extra })
const e = (extra: Partial<RhythmNote> = {}): RhythmNote => ({ duration: 'eighth', ...extra })
const h = (extra: Partial<RhythmNote> = {}): RhythmNote => ({ duration: 'half', ...extra })
const TRIPLET = { actual: 3, normal: 2 }

/** Cells of 4/4 every level from Р6 on may use. */
const BASIC_CELLS: RhythmCell[] = [{ notes: [q()] }, { notes: [e(), e()] }, { notes: [h()], starts: [0, 2] }]

export const RHYTHM_LEVELS: readonly RhythmLevel[] = [
  { id: 1, durations: ['whole', 'half'], introduces: ['whole', 'half'], rests: false, meters: [FOUR] },
  { id: 2, durations: ['whole', 'half', 'quarter'], introduces: ['quarter'], rests: false, meters: [FOUR] },
  { id: 3, durations: ['whole', 'half', 'quarter'], introduces: [], rests: true, meters: [FOUR] },
  { id: 4, durations: ['half', 'quarter', 'eighth'], introduces: ['eighth'], rests: true, meters: [FOUR] },
  { id: 5, durations: ['quarter', 'eighth', 'sixteenth'], introduces: ['sixteenth'], rests: false, meters: [FOUR] },
  {
    id: 6,
    durations: ['half', 'quarter', 'eighth'],
    cells: [...BASIC_CELLS, { notes: [h({ dots: 1 }), q()], starts: [0] }, { notes: [q({ dots: 1 }), e()], starts: [0, 2] }],
    ties: true,
    introduces: ['dottedHalf', 'dottedQuarter', 'tie'],
    rests: false,
    meters: [FOUR],
  },
  { id: 7, durations: ['half', 'quarter', 'eighth'], introduces: ['meters', 'accent'], rests: true, meters: [TWO, THREE], accents: true },
  {
    id: 8,
    durations: ['quarter', 'eighth'],
    cells: [...BASIC_CELLS, { notes: [e(), q(), e()], starts: [0, 2] }, { notes: [q(), h(), q()], starts: [0] }],
    pickup: true,
    introduces: ['pickup', 'syncopation'],
    rests: false,
    meters: [FOUR],
  },
  {
    id: 9,
    durations: ['quarter', 'eighth'],
    cells: [...BASIC_CELLS, { notes: [e({ tuplet: TRIPLET }), e({ tuplet: TRIPLET }), e({ tuplet: TRIPLET })] }],
    introduces: ['triplet'],
    rests: false,
    meters: [FOUR],
  },
  {
    id: 10,
    durations: ['quarter', 'eighth'],
    cells: [
      { notes: [q({ dots: 1 })], starts: [0, 1.5] },
      { notes: [q(), e()], starts: [0, 1.5] },
      { notes: [e(), e(), e()], starts: [0, 1.5] },
      { notes: [h({ dots: 1 })], starts: [0] },
    ],
    tempoScale: 2,
    twoHands: true,
    introduces: ['sixEight', 'twoHands'],
    rests: false,
    meters: [SIX_EIGHT],
  },
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

/** Levels open one by one: the next after all stars in the one before. */
export function isOpen(id: number, progress: Readonly<Record<number, RhythmLevelProgress>>): boolean {
  if (!RHYTHM_LEVELS.some((level) => level.id === id)) return false
  if (id === 1) return true
  return starsOf(progress[id - 1]?.passes ?? 0) >= RHYTHM_TEMPOS.length
}

/** Where to open: the first open level that still lacks stars, or the last open one. */
export function currentLevel(progress: Readonly<Record<number, RhythmLevelProgress>>): number {
  const open = RHYTHM_LEVELS.filter((level) => isOpen(level.id, progress))
  return (open.find((level) => starsOf(progress[level.id]?.passes ?? 0) < RHYTHM_TEMPOS.length) ?? open[open.length - 1] ?? RHYTHM_LEVELS[0]!).id
}

/** The tempo of a level at this many passed rhythms (6/8 counts eighths, so its steps are doubled). */
export function levelTempo(level: RhythmLevel, passes: number): number {
  return tempoOf(passes) * (level.tempoScale ?? 1)
}

/**
 * A task: TASK_BARS bars of the level's values or cells, in one of its meters. Ties, a pickup and
 * accents come in only on the levels that teach them.
 */
export function makeTask(level: RhythmLevel, random: () => number = Math.random): Rhythm {
  const meter = level.meters[Math.floor(random() * level.meters.length)]!
  const bars: RhythmNote[][] = []
  for (let bar = 0; bar < TASK_BARS; bar++) {
    bars.push(level.cells ? generateCellBar(meter, level.cells, random) : generateBar(meter, { durations: level.durations, rests: level.rests, random }))
  }
  if (level.accents) {
    for (const bar of bars) if (bar[0] && !bar[0].rest) bar[0] = { ...bar[0], accent: true }
  }
  if (level.ties && random() < 0.5) {
    const last = bars[0]![bars[0]!.length - 1]!
    if (!last.rest && !bars[1]![0]!.rest) bars[0]![bars[0]!.length - 1] = { ...last, tie: true }
  }
  const pickup = level.pickup && random() < 0.5
  return { meter, notes: [...(pickup ? [q()] : []), ...bars.flat()], pickup: pickup ? 1 : 0 }
}

/** The example shown for a new value or idea. */
export function introRhythm(id: IntroId): Rhythm {
  switch (id) {
    case 'dottedHalf': return { meter: FOUR, notes: [h({ dots: 1 }), q()] }
    case 'dottedQuarter': return { meter: FOUR, notes: [q({ dots: 1 }), e(), q({ dots: 1 }), e()] }
    case 'tie': return { meter: FOUR, notes: [h(), h({ tie: true }), h(), h()] }
    case 'meters': return { meter: THREE, notes: [q({ accent: true }), q(), q(), q({ accent: true }), q(), q()] }
    case 'accent': return { meter: FOUR, notes: [q({ accent: true }), q(), q(), q(), q({ accent: true }), q(), q(), q()] }
    case 'pickup': return { meter: FOUR, pickup: 1, notes: [q(), h(), h(), h({ dots: 1 }), q()] }
    case 'syncopation': return { meter: FOUR, notes: [e(), q(), e(), e(), q(), e()] }
    case 'triplet': return { meter: FOUR, notes: [...Array.from({ length: 3 }, () => e({ tuplet: TRIPLET })), q(), ...Array.from({ length: 3 }, () => e({ tuplet: TRIPLET })), q()] }
    case 'sixEight': return { meter: SIX_EIGHT, notes: [e(), e(), e(), q({ dots: 1 })] }
    case 'twoHands': return { meter: TWO, notes: [e({ tuplet: TRIPLET }), e({ tuplet: TRIPLET }), e({ tuplet: TRIPLET }), e({ tuplet: TRIPLET }), e({ tuplet: TRIPLET }), e({ tuplet: TRIPLET })] }
    default: {
      const count = Math.round(barQuarters(FOUR) / noteQuarters({ duration: id }))
      return { meter: FOUR, notes: Array.from({ length: count }, () => ({ duration: id })) }
    }
  }
}

/**
 * An attempt passes with no note missed, at most one extra tap, and three quarters of the notes good: on time and,
 * on keys, held for their length (a 1/32 tap is not a half note; pads have no length and are judged on time only).
 */
export function passes(score: RhythmScore): boolean {
  const missed = score.results.filter((result) => result.verdict === 'missed').length
  const good = score.results.filter((result) => result.verdict === 'onTime' && result.hold !== 'short').length
  return missed === 0 && score.extra <= 1 && good >= Math.ceil(score.total * 0.75)
}

export type RhythmHint = 'rushing' | 'dragging' | 'missed' | 'extra' | 'holdLonger' | 'letGo' | 'accent' | 'slowDown' | 'noTaps' | 'great'

/**
 * One or two things to tell the child, most important first, in the order a teacher would:
 * a missed note, taps in a rest, then hurrying or dragging, then how long notes are held.
 */
/** An accented note should be this much louder (velocity) than the others, on average. */
const ACCENT_MARGIN = 12

/** Whether accents were played louder; null when there is nothing to tell (no accents, or no velocity). */
export function accentsPlayed(score: RhythmScore, rhythm: Rhythm): boolean | null {
  const accented: number[] = []
  const others: number[] = []
  for (const result of score.results) {
    if (result.velocity === null) continue
    if (rhythm.notes[result.index]?.accent) accented.push(result.velocity)
    else others.push(result.velocity)
  }
  if (accented.length === 0 || others.length === 0) return null
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  return mean(accented) >= mean(others) + ACCENT_MARGIN
}

export function hintsFor(score: RhythmScore, rhythm?: Rhythm): RhythmHint[] {
  const hints: RhythmHint[] = []
  const results = score.results
  if (results.some((result) => result.verdict === 'missed')) hints.push('missed')
  if (score.extra > 0) hints.push('extra')
  // Let go too soon before timing: the red notes say why, even when the time was right.
  if (results.some((result) => result.verdict !== 'missed' && result.hold === 'short')) hints.push('holdLonger')
  const early = results.filter((result) => result.verdict === 'early').length
  const late = results.filter((result) => result.verdict === 'late').length
  if (early > late) hints.push('rushing')
  else if (late > early) hints.push('dragging')
  if (!hints.includes('holdLonger') && results.some((result) => result.hold === 'long')) hints.push('letGo')
  if (rhythm && accentsPlayed(score, rhythm) === false) hints.push('accent')
  return hints.length ? hints.slice(0, 2) : ['great']
}

/** Indexes of the written notes the child got wrong in an attempt: missed, early or late. */
export function troubleNotes(score: RhythmScore): number[] {
  return score.results.filter((result) => result.verdict !== 'onTime').map((result) => result.index)
}

/** Attempts in a row with the same note wrong before the app offers to slow down. */
export const TROUBLE_ATTEMPTS = 3
/** Practice tempo when the child slows down: three quarters of the level's tempo. */
export const SLOW_FACTOR = 0.75

/**
 * The note that went wrong in each of the last TROUBLE_ATTEMPTS attempts of one task (a teacher would
 * say «this place is hard, let's go slower»), or null.
 */
export function troubleSpot(history: readonly (readonly number[])[]): number | null {
  if (history.length < TROUBLE_ATTEMPTS) return null
  const [first, ...rest] = history.slice(-TROUBLE_ATTEMPTS)
  return first!.find((index) => rest.every((attempt) => attempt.includes(index))) ?? null
}

/** The slow practice tempo, rounded to 5 like the metronome steps. */
export function slowTempo(bpm: number): number {
  return Math.max(40, Math.round((bpm * SLOW_FACTOR) / 5) * 5)
}

/** What kind of rhythm a note is, for the weak spots: its value, or the figure it belongs to. */
export type RhythmKind = Duration | 'dotted' | 'triplet' | 'tie' | 'rest'

export function kindOf(note: RhythmNote, previous?: RhythmNote): RhythmKind {
  if (note.rest) return 'rest'
  if (note.tuplet) return 'triplet'
  if (note.dots) return 'dotted'
  if (previous?.tie) return 'tie'
  return note.duration
}

export interface KindStats {
  tries: number
  misses: number
}

/** Adds one attempt to the stats: every note is a try, every note not on time a miss. */
export function addKindStats(stats: Readonly<Partial<Record<RhythmKind, KindStats>>>, rhythm: Rhythm, score: RhythmScore): Partial<Record<RhythmKind, KindStats>> {
  const next: Partial<Record<RhythmKind, KindStats>> = { ...stats }
  for (const result of score.results) {
    const note = rhythm.notes[result.index]
    if (!note) continue
    const kind = kindOf(note, rhythm.notes[result.index - 1])
    const old = next[kind] ?? { tries: 0, misses: 0 }
    next[kind] = { tries: old.tries + 1, misses: old.misses + (result.verdict === 'onTime' ? 0 : 1) }
  }
  return next
}

/** At least this many tries before a kind can be called weak, so one bad day does not count. */
const WEAK_MIN_TRIES = 6
const WEAK_SHARE = 0.25

/** The kinds the child misses most (a quarter of the time or more), worst first. */
export function weakKinds(stats: Readonly<Partial<Record<RhythmKind, KindStats>>>, limit = 3): { kind: RhythmKind, tries: number, misses: number }[] {
  return (Object.entries(stats) as [RhythmKind, KindStats][])
    .filter(([, item]) => item.tries >= WEAK_MIN_TRIES && item.misses / item.tries >= WEAK_SHARE)
    .sort((a, b) => b[1].misses / b[1].tries - a[1].misses / a[1].tries)
    .slice(0, limit)
    .map(([kind, item]) => ({ kind, ...item }))
}

const KINDS: readonly RhythmKind[] = ['whole', 'half', 'quarter', 'eighth', 'sixteenth', 'dotted', 'triplet', 'tie', 'rest']

/** Stored stats; anything broken is dropped. */
export function parseKindStats(value: unknown): Partial<Record<RhythmKind, KindStats>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const stats: Partial<Record<RhythmKind, KindStats>> = {}
  for (const [kind, item] of Object.entries(value)) {
    const { tries, misses } = (item ?? {}) as Partial<KindStats>
    if (KINDS.includes(kind as RhythmKind) && typeof tries === 'number' && typeof misses === 'number' && tries >= misses && misses >= 0) {
      stats[kind as RhythmKind] = { tries, misses }
    }
  }
  return stats
}

/** Two hands at once (Р10, «2 против 3»): the right hand plays triplets while the left plays eighths. */
export interface TwoHands {
  right: Rhythm
  left: Rhythm
}

export type Hand = 'left' | 'right'

/** Beats of a two-hand task that are «2 против 3»; the others are a quarter in both hands, to breathe. */
const POLY_SHARE = 0.75

export function makeTwoHands(random: () => number = Math.random): TwoHands {
  const right: RhythmNote[] = []
  const left: RhythmNote[] = []
  const beats = TASK_BARS * barQuarters(TWO)
  for (let beat = 0; beat < beats; beat++) {
    // The first beat is always the polyrhythm: it is what the level is about.
    if (beat === 0 || random() < POLY_SHARE) {
      right.push(e({ tuplet: TRIPLET }), e({ tuplet: TRIPLET }), e({ tuplet: TRIPLET }))
      left.push(e(), e())
    } else {
      right.push(q())
      left.push(q())
    }
  }
  return { right: { meter: TWO, notes: right }, left: { meter: TWO, notes: left } }
}

/** The first key of the right hand: the left hand plays the lower octave of the window (C to B). */
export function handSplit(keys: readonly number[]): number {
  if (keys.length === 0) return 60
  const lowest = Math.min(...keys)
  return lowest - (((lowest % 12) + 12) % 12) + 12
}

/** Pads 1-4 are the left hand, 5-8 the right (plan: «пэды 1–4 против 5–8»). */
export function padHand(pad: number): Hand {
  return pad <= 4 ? 'left' : 'right'
}
