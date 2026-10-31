// Rhythm model (plan step 16): note values, rests, dots, ties, tuplets, bars, pickup, timing in seconds,
// one-bar rhythm generator and the scoring of an attempt. Pure code, no Vue, no UI text.

import type { TimeSignature } from './song'

export const DURATIONS = ['whole', 'half', 'quarter', 'eighth', 'sixteenth'] as const
export type Duration = (typeof DURATIONS)[number]

/** Length of each value in quarter notes. */
const QUARTERS: Record<Duration, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, sixteenth: 0.25 }

export interface RhythmNote {
  duration: Duration
  /** 0, 1 or 2 dots: each adds half of the previous part. */
  dots?: number
  rest?: boolean
  /** Tied to the next note: they sound as one, only the first is played. */
  tie?: boolean
  /** Tuplet as «actual in the time of normal»: a triplet is 3 in the time of 2, a duplet 2 in the time of 3. */
  tuplet?: { actual: number, normal: number }
  /** Accent (>): played louder than the notes around it. */
  accent?: boolean
  /** The key, for a melody read from the notes (plan step 19); a rhythm alone has none. */
  key?: number
}

export interface Rhythm {
  meter: TimeSignature
  notes: RhythmNote[]
  /** Pickup (anacrusis) before the first full bar, in quarter notes; 0 when the rhythm starts on beat 1. */
  pickup?: number
}

/** Length of a written note in quarter notes, with dots and tuplet. */
export function noteQuarters(note: Pick<RhythmNote, 'duration' | 'dots' | 'tuplet'>): number {
  const base = QUARTERS[note.duration]
  const dots = note.dots ?? 0
  // One dot: 1.5, two dots: 1.75.
  const dotted = base * (2 - 0.5 ** dots)
  return note.tuplet ? (dotted * note.tuplet.normal) / note.tuplet.actual : dotted
}

/** Length of one bar in quarter notes: 4/4 is 4, 3/4 is 3, 6/8 is 3. */
export function barQuarters(meter: TimeSignature): number {
  return (meter.numerator * 4) / meter.denominator
}

/** Seconds of one quarter note. `bpm` counts the beats of the meter, like the metronome: in 6/8 it counts eighths. */
export function quarterSeconds(bpm: number, meter: TimeSignature): number {
  return (60 / bpm) * (meter.denominator / 4)
}

/** Seconds counted down before the first note (owner's rule: «2, 1», plain seconds, whatever the tempo). */
export const COUNTDOWN_S = 2

/**
 * The countdown before the first note: the whole seconds still to wait (2, 1), shown in the last COUNTDOWN_S
 * seconds before it (`position` is real seconds from the first note, negative before it); null otherwise. Every
 * practice starts this way, never straight into the notes (owner's rule).
 */
export function countdown(position: number, from = COUNTDOWN_S): number | null {
  if (position >= 0 || -position > from) return null
  return Math.ceil(-position)
}

/** Bars of count-in so that the wait before the first note is at least the countdown (one bar at least). */
export function countInBars(barSeconds: number, atLeast = COUNTDOWN_S): number {
  return Math.max(1, Math.ceil(atLeast / barSeconds - 1e-9))
}

/** A sound to play or a silence to keep, in seconds from the start of the rhythm. */
export interface Sound {
  start: number
  length: number
  rest: boolean
  /** Index of the first written note of this sound (ties merge several). */
  index: number
  /** The key of a melody note. */
  key?: number
}

/** What is heard: ties merged into one sound, consecutive rests kept separate. */
export function sounds(rhythm: Rhythm, bpm: number): Sound[] {
  const quarter = quarterSeconds(bpm, rhythm.meter)
  const result: Sound[] = []
  let position = 0
  let tied: Sound | null = null
  rhythm.notes.forEach((note, index) => {
    const length = noteQuarters(note) * quarter
    if (tied && !note.rest) tied.length += length
    else result.push(tied = { start: position * quarter, length, rest: Boolean(note.rest), index, ...(note.key === undefined ? {} : { key: note.key }) })
    if (!note.tie || note.rest) tied = null
    position += noteQuarters(note)
  })
  return result
}

/** Total length of the written notes in quarter notes. */
export function totalQuarters(rhythm: Pick<Rhythm, 'notes'>): number {
  return rhythm.notes.reduce((sum, note) => sum + noteQuarters(note), 0)
}

/** Whether the notes fill the pickup and then whole bars exactly. */
export function fillsBars(rhythm: Rhythm): boolean {
  const bars = (totalQuarters(rhythm) - (rhythm.pickup ?? 0)) / barQuarters(rhythm.meter)
  return isMultiple(bars, 1) && bars >= 1 - EPS
}

export interface GeneratorOptions {
  /** Values the child has already learned. */
  durations: readonly Duration[]
  /** Allow rests of the same values. */
  rests?: boolean
  random?: () => number
}

/**
 * One bar from the values the child knows, always exactly one bar. A value starts where it reads
 * naturally: on its own grid (an eighth on an eighth, a half on beat 1 or 3 of 4/4), and it never
 * crosses the middle of the bar (4/4 = 2/4 + 2/4, 6/8 = 3/8 + 3/8), except a note filling the whole bar.
 */
export function generateBar(meter: TimeSignature, options: GeneratorOptions): RhythmNote[] {
  const random = options.random ?? Math.random
  const bar = barQuarters(meter)
  const middle = middleOf(meter)
  const notes: RhythmNote[] = []
  let position = 0
  while (position < bar - EPS) {
    const fits = options.durations.filter((duration) => {
      const length = QUARTERS[duration]
      if (position + length > bar + EPS) return false
      const grid = length <= 1 ? length : middle === null ? 1 : Math.min(length, middle)
      if (!isMultiple(position, grid)) return false
      const crosses = middle !== null && position < middle - EPS && position + length > middle + EPS
      return !crosses || length >= bar - EPS
    })
    // Nothing known fits (only halves in 3/4): fill the rest of the bar so it always adds up.
    const note: RhythmNote = fits.length ? { duration: fits[Math.floor(random() * fits.length)]! } : filler(bar - position)
    const rest = Boolean(options.rests) && notes.length > 0 && random() < 0.2
    notes.push(rest ? { ...note, rest } : note)
    position += noteQuarters(note)
  }
  return notes
}

const EPS = 1e-9
const isMultiple = (value: number, step: number) => Math.abs(value / step - Math.round(value / step)) < EPS

/** Middle of a compound bar in quarter notes (4/4: 2, 6/8: 1.5); null for 2/4 and 3/4. */
function middleOf(meter: TimeSignature): number | null {
  if (meter.numerator === 4 && meter.denominator === 4) return 2
  if (meter.numerator === 6 && meter.denominator === 8) return 1.5
  return null
}

/** The longest plain or dotted value that fits in `remaining` quarter notes. */
function filler(remaining: number): RhythmNote {
  const values = DURATIONS.flatMap((duration): RhythmNote[] => [{ duration }, { duration, dots: 1 }])
    .filter((note) => noteQuarters(note) <= remaining + EPS)
    .sort((a, b) => noteQuarters(b) - noteQuarters(a))
  return values[0] ?? { duration: 'sixteenth' }
}

/** A key or pad press, in seconds, already moved back to what the child heard. */
export interface RhythmPress {
  time: number
  /** Release time; null when the key is still held or for pads (they have no length). */
  end: number | null
  /** How hard the key or pad was hit (1-127); null when the input has no velocity (screen, computer keys). */
  velocity?: number | null
  /** The key pressed, when the input has keys. */
  key?: number | null
}

export type TimingVerdict = 'onTime' | 'early' | 'late' | 'missed'
export type HoldVerdict = 'ok' | 'short' | 'long'

export interface SoundResult {
  index: number
  verdict: TimingVerdict
  /** Seconds the press was off (negative: early); null when missed. */
  offset: number | null
  /** Hold check; null for missed notes, pads, or when the length is not checked. */
  hold: HoldVerdict | null
  /** How long the key was held, seconds. */
  held: number | null
  /** Velocity of the press that played the note, when the input has one. */
  velocity: number | null
  /** Key of the press that played the note, when the input has keys. */
  key: number | null
}

export interface RhythmScore {
  results: SoundResult[]
  /** Presses that belong to no note: a tap in a rest or a double tap. */
  extra: number
  onTime: number
  total: number
}

/** On-time window: the smaller of ±80 ms and a quarter of the shortest note, so fast values are judged fairly. */
export const ON_TIME_S = 0.08
/** A press further than this from a note (and outside its share of the gap) belongs to no note. */
const CAPTURE_S = 0.25
/** A note counts as held when the key stays down this share of its length (songs and the waterfall use it too). */
export const HOLD_SHARE = 0.6
/** Held into the next note's time by more than this share and this many seconds is too long. */
const HOLD_LONG = 1.5
const HOLD_LONG_S = 0.2

export function onTimeWindow(notes: readonly Sound[]): number {
  const shortestNote = Math.min(...notes.filter((note) => !note.rest).map((note) => note.length))
  return Math.min(ON_TIME_S, Number.isFinite(shortestNote) ? shortestNote / 4 : ON_TIME_S)
}

/**
 * Grades an attempt like a teacher listening: each press counts once, for the note it is closest to;
 * within the window it is on time, a bit further it is early or late, further still it is extra.
 * Hold length is checked on keys (`checkHold`), not on pads.
 */
export function scoreRhythm(all: readonly Sound[], presses: readonly RhythmPress[], checkHold = true): RhythmScore {
  const notes = all.filter((note) => !note.rest)
  const window = onTimeWindow(notes)
  const used = new Set<number>()
  // A press may count for a note only within half the gap to its neighbours (and CAPTURE_S at most).
  const zone = (i: number) => {
    const before = i > 0 ? (notes[i]!.start - notes[i - 1]!.start) / 2 : CAPTURE_S
    const after = i < notes.length - 1 ? (notes[i + 1]!.start - notes[i]!.start) / 2 : CAPTURE_S
    return { before: Math.min(before, CAPTURE_S), after: Math.min(after, CAPTURE_S) }
  }
  const results = notes.map((note, i): SoundResult => {
    const { before, after } = zone(i)
    let pick = -1
    presses.forEach((press, p) => {
      if (used.has(p)) return
      const offset = press.time - note.start
      if (offset < -before || offset > after) return
      if (pick === -1 || Math.abs(offset) < Math.abs(presses[pick]!.time - note.start)) pick = p
    })
    if (pick === -1) return { index: note.index, verdict: 'missed', offset: null, hold: null, held: null, velocity: null, key: null }
    used.add(pick)
    const press = presses[pick]!
    const offset = press.time - note.start
    const verdict: TimingVerdict = Math.abs(offset) <= window ? 'onTime' : offset < 0 ? 'early' : 'late'
    const held = press.end === null ? null : press.end - press.time
    return { index: note.index, verdict, offset, hold: checkHold && held !== null ? holdVerdict(held, note.length) : null, held, velocity: press.velocity ?? null, key: press.key ?? null }
  })
  const first = notes[0]?.start ?? 0
  // Warming up before the first note does not count as extra.
  const extra = presses.filter((press, p) => !used.has(p) && press.time >= first - CAPTURE_S).length
  return { results, extra, onTime: results.filter((result) => result.verdict === 'onTime').length, total: notes.length }
}

export function holdVerdict(held: number, length: number): HoldVerdict {
  if (held < length * HOLD_SHARE) return 'short'
  if (held > length * HOLD_LONG && held > length + HOLD_LONG_S) return 'long'
  return 'ok'
}

/** The notes of each bar, with their index in the rhythm; the pickup, when there is one, is its own short bar. */
export function splitBars(rhythm: Rhythm): { index: number, note: RhythmNote }[][] {
  const bar = barQuarters(rhythm.meter)
  const bars: { index: number, note: RhythmNote }[][] = [[]]
  let room = rhythm.pickup || bar
  rhythm.notes.forEach((note, index) => {
    if (room <= EPS) {
      bars.push([])
      room = bar
    }
    bars[bars.length - 1]!.push({ index, note })
    room -= noteQuarters(note)
  })
  return bars
}

/**
 * A rhythm cell: a short figure as music books teach it (a dotted quarter with its eighth, a
 * syncopation, a triplet), to be placed whole. `starts` are the bar positions (quarter notes) where it
 * reads naturally; any beat when missing.
 */
export interface RhythmCell {
  notes: RhythmNote[]
  starts?: number[]
}

export function cellQuarters(cell: RhythmCell): number {
  return totalQuarters(cell)
}

/**
 * One bar made of cells, always exactly one bar. A cell goes only where it reads naturally and fits;
 * when nothing fits, the rest of the bar is filled with the longest plain or dotted value.
 */
export function generateCellBar(meter: TimeSignature, cells: readonly RhythmCell[], random: () => number = Math.random): RhythmNote[] {
  const bar = barQuarters(meter)
  // Beats of the meter in quarter notes: a quarter in x/4, a dotted quarter in 6/8.
  const beat = meter.denominator === 8 ? 1.5 : 1
  const notes: RhythmNote[] = []
  let position = 0
  while (position < bar - EPS) {
    const fits = cells.filter((cell) => {
      const length = cellQuarters(cell)
      if (position + length > bar + EPS) return false
      return cell.starts ? cell.starts.some((start) => Math.abs(start - position) < EPS) : isMultiple(position, beat)
    })
    const cell = fits[Math.floor(random() * fits.length)]
    const piece = cell ? cell.notes.map((note) => ({ ...note })) : [filler(bar - position)]
    notes.push(...piece)
    position += totalQuarters({ notes: piece })
  }
  return notes
}

/**
 * What a child says when a note starts at `position` (quarter notes from the start of the bar), so the
 * staff can show it under the note: the beat number on a beat («1», «2»…; in 6/8 the eighths 1-6),
 * «и» halfway between beats, nothing for finer places (sixteenths, triplets), which the beat shows anyway.
 */
export function countLabel(position: number, meter: TimeSignature): string {
  const beat = meter.denominator === 8 ? 0.5 : 4 / meter.denominator
  const count = position / beat
  if (isMultiple(count, 1)) return String(Math.round(count) + 1)
  if (isMultiple(count, 0.5)) return 'и'
  return ''
}

/** The count label of every written note, by its index; rests get none. */
export function countLabels(rhythm: Rhythm): Map<number, string> {
  const labels = new Map<number, string>()
  const full = barQuarters(rhythm.meter)
  splitBars(rhythm).forEach((bar, b) => {
    const length = bar.reduce((sum, item) => sum + noteQuarters(item.note), 0)
    // A pickup bar ends on the bar line: its notes are counted from the end of a full bar.
    let position = b === 0 && (rhythm.pickup ?? 0) > 0 ? full - length : 0
    for (const { note, index } of bar) {
      if (!note.rest) labels.set(index, countLabel(position, rhythm.meter))
      position += noteQuarters(note)
    }
  })
  return labels
}
