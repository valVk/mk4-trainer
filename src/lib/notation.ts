// A song part as written music (plan step 16, owner's addition): MIDI notes snapped to the bars of
// the song, chords, rests, values with dots and ties, clef and accidentals. Pure code, no Vue.

import { drumKind, type DrumKind } from './padLayout'
import type { Duration } from './rhythm'
import type { SongNote, TimeSignature } from './song'

/** Grid of the snapping: sixteenth notes. */
const SLOTS_PER_QUARTER = 4

export interface WrittenNote {
  /** MIDI keys of the chord, low to high; empty for a rest. */
  keys: number[]
  duration: Duration
  dots: number
  /** Tied to the next written note (same keys). */
  tie: boolean
  /** A rest filling a whole empty bar: drawn as a centred bar rest. */
  barRest: boolean
  /** Song time where the note starts, seconds. */
  time: number
}

export interface WrittenBar {
  /** Bar number from 0. */
  index: number
  start: number
  end: number
  notes: WrittenNote[]
}

/** Treble and bass for melodic parts; percussion for drums (each drum on its own place, no pitch). */
export type Clef = 'treble' | 'bass' | 'percussion'

/** Treble when most of the part sits at middle C or above, bass otherwise. */
export function clefFor(notes: readonly Pick<SongNote, 'key'>[]): Clef {
  if (notes.length === 0) return 'treble'
  const keys = notes.map((note) => note.key).sort((a, b) => a - b)
  return keys[Math.floor(keys.length / 2)]! >= 60 ? 'treble' : 'bass'
}

/** Below this, a treble staff needs more than two ledger lines (A3). */
const TREBLE_LOW = 57
/** Above this, a bass staff needs more than two ledger lines (E4). */
const BASS_HIGH = 64
/** Share of notes on each side that makes one staff unreadable. */
const GRAND_SHARE = 0.15
/** Middle C: the treble staff of a grand staff takes this note and above. */
export const MIDDLE_C = 60

/**
 * Whether the part needs a grand staff (treble and bass together, like piano music): enough notes
 * sit too low for the treble clef and enough too high for the bass clef.
 */
export function needsGrandStaff(notes: readonly Pick<SongNote, 'key'>[]): boolean {
  if (notes.length === 0) return false
  const low = notes.filter((note) => note.key < TREBLE_LOW).length / notes.length
  const high = notes.filter((note) => note.key > BASS_HIGH).length / notes.length
  return low >= GRAND_SHARE && high >= GRAND_SHARE
}

/** Sixteenths in one bar of the meter. */
export function slotsPerBar(meter: TimeSignature): number {
  return (meter.numerator * 4 * SLOTS_PER_QUARTER) / meter.denominator
}

/** Written values in sixteenths, longest first, with the grid each may start on. */
interface Value {
  slots: number
  duration: Duration
  dots: number
}
const VALUES: Value[] = [
  { slots: 16, duration: 'whole', dots: 0 },
  { slots: 12, duration: 'half', dots: 1 },
  { slots: 8, duration: 'half', dots: 0 },
  { slots: 6, duration: 'quarter', dots: 1 },
  { slots: 4, duration: 'quarter', dots: 0 },
  { slots: 3, duration: 'eighth', dots: 1 },
  { slots: 2, duration: 'eighth', dots: 0 },
  { slots: 1, duration: 'sixteenth', dots: 0 },
]

/**
 * Where a value may start inside a bar, so the beats stay readable: a quarter on a beat, a half on
 * beat 1 or 3 of 4/4, short values inside one beat, nothing (but a whole-bar note) across the middle
 * of 4/4 or 6/8.
 */
function fits(value: Value, at: number, room: number, meter: TimeSignature): boolean {
  if (value.slots > room) return false
  const bar = slotsPerBar(meter)
  const compound = meter.denominator === 8
  const beat = compound ? 6 : 4
  const align = value.slots <= 2 ? value.slots : value.slots === 3 ? 2 : value.slots >= bar ? bar : beat
  // The 16-8-16 figure: an eighth may start on the second sixteenth of a beat in a simple meter.
  const syncopated = !compound && value.slots === 2 && value.dots === 0 && at % beat === 1
  if (at % align !== 0 && !syncopated) return false
  // Values shorter than a beat stay inside one beat, so the beat stays visible.
  if (value.slots < beat && Math.floor(at / beat) !== Math.floor((at + value.slots - 1) / beat)) return false
  const middle = meter.numerator === 4 && meter.denominator === 4 ? 8 : meter.numerator === 6 && meter.denominator === 8 ? 6 : null
  const crosses = middle !== null && at < middle && at + value.slots > middle
  return !crosses || (at === 0 && value.slots >= bar - (compound ? 0 : 4))
}

/** Splits a span inside one bar into written values; the last value has no tie of its own. */
export function spellSpan(at: number, length: number, meter: TimeSignature): { duration: Duration, dots: number, slots: number }[] {
  const pieces: { duration: Duration, dots: number, slots: number }[] = []
  let position = at
  let room = length
  while (room > 0) {
    const value = VALUES.find((item) => fits(item, position, room, meter)) ?? VALUES[VALUES.length - 1]!
    pieces.push({ duration: value.duration, dots: value.dots, slots: value.slots })
    position += value.slots
    room -= value.slots
  }
  return pieces
}

interface Event {
  start: number
  end: number
  keys: number[]
}

/**
 * The part as bars of written notes. Notes are snapped to sixteenths inside the song's own bars (so a
 * tempo change or a played-in file still lines up), notes starting together become one chord, and a
 * chord lasts until its notes end or the next chord starts, whichever comes first. With `drums`, a hit
 * lasts until the next hit (at most to the end of its beat), as drummers write it.
 */
export function writePart(notes: readonly SongNote[], bars: readonly number[], meter: TimeSignature, drums = false): WrittenBar[] {
  const perBar = slotsPerBar(meter)
  const beat = meter.denominator === 8 ? 6 : 4
  const barCount = Math.max(0, bars.length - 1)
  const slotAt = (time: number) => {
    let bar = 0
    while (bar < barCount - 1 && bars[bar + 1]! <= time) bar++
    const start = bars[bar]!
    const length = (bars[bar + 1] ?? start + 1) - start
    return bar * perBar + Math.round(((time - start) / length) * perBar)
  }
  const timeAt = (slot: number) => {
    const bar = Math.min(barCount - 1, Math.floor(slot / perBar))
    const start = bars[bar]!
    return start + (((bars[bar + 1] ?? start + 1) - start) * (slot - bar * perBar)) / perBar
  }

  const byStart = new Map<number, { keys: Set<number>, end: number }>()
  for (const note of notes) {
    const start = slotAt(note.start)
    const end = Math.max(start + 1, slotAt(note.start + note.length))
    const group = byStart.get(start) ?? { keys: new Set<number>(), end }
    group.keys.add(note.key)
    group.end = Math.max(group.end, end)
    byStart.set(start, group)
  }
  const starts = [...byStart.keys()].sort((a, b) => a - b)
  const events: Event[] = starts.map((start, i) => {
    const group = byStart.get(start)!
    const next = starts[i + 1] ?? Infinity
    // A drum hit is written as lasting until the next hit, at most to the end of its beat: drum notes in MIDI are tiny.
    const end = drums ? Math.min(next, (Math.floor(start / beat) + 1) * beat) : Math.min(group.end, next)
    return { start, end, keys: [...group.keys].sort((a, b) => a - b) }
  })

  const written: WrittenBar[] = Array.from({ length: barCount }, (_, index) => ({ index, start: bars[index]!, end: bars[index + 1]!, notes: [] }))
  const write = (start: number, end: number, keys: number[]) => {
    for (let slot = start; slot < end;) {
      const bar = Math.floor(slot / perBar)
      if (bar >= barCount) return
      const barEnd = Math.min(end, (bar + 1) * perBar)
      const pieces = spellSpan(slot - bar * perBar, barEnd - slot, meter)
      let at = slot
      pieces.forEach((piece, i) => {
        const last = i === pieces.length - 1 && barEnd === end
        written[bar]!.notes.push({
          keys,
          duration: piece.duration,
          dots: piece.dots,
          tie: keys.length > 0 && !last,
          barRest: false,
          time: timeAt(at),
        })
        at += piece.slots
      })
      slot = barEnd
    }
  }
  let cursor = 0
  for (const event of events) {
    if (event.start > cursor) write(cursor, event.start, [])
    write(event.start, event.end, event.keys)
    cursor = event.end
  }
  if (cursor < barCount * perBar) write(cursor, barCount * perBar, [])

  // A bar with nothing but rests is written as one bar rest.
  for (const bar of written) {
    if (bar.notes.length > 0 && bar.notes.every((note) => note.keys.length === 0)) {
      bar.notes = [{ keys: [], duration: 'whole', dots: 0, tie: false, barRest: true, time: bar.start }]
    }
  }
  return written
}

const NAMES = ['c', 'c', 'd', 'd', 'e', 'f', 'f', 'g', 'g', 'a', 'a', 'b'] as const
/** Black keys written as flats: D♭ E♭ G♭ A♭ B♭ sit on the line of the letter above. */
const FLAT_NAMES = ['c', 'd', 'd', 'e', 'e', 'f', 'g', 'g', 'a', 'a', 'b', 'b'] as const
const BLACK = [false, true, false, true, false, false, true, false, true, false, true, false]
/** The order sharps are added to a key signature: F C G D A E B; flats go the other way, B E A D G C F. */
const SHARP_ORDER = ['f', 'c', 'g', 'd', 'a', 'e', 'b'] as const
const FLAT_ORDER = ['b', 'e', 'a', 'd', 'g', 'c', 'f'] as const
/** VexFlow's names of the major keys by sharps (positive) and flats (negative). */
export const SHARP_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'] as const
export const FLAT_KEYS = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'] as const

/** VexFlow's name of a key signature: 2 is D major, −1 F major. */
export function keySignatureName(signature: number): string {
  return signature >= 0 ? SHARP_KEYS[signature] ?? 'C' : FLAT_KEYS[-signature] ?? 'C'
}

export interface SpelledKey {
  /** VexFlow key, e.g. "c#/5" (octave 4 is the one of middle C). */
  key: string
  /** Accidental to print: sharp, flat, natural, or none when the bar already says it. */
  accidental: '#' | 'b' | 'n' | null
}

/**
 * Spells the keys of one bar. A sign holds for the rest of the bar on that line, so it is printed once; going
 * back to the plain note on the same line prints a natural. `signature` is the key signature: sharps
 * (positive) are written as sharps, flats (negative) as flats, and the signature's own signs hold already:
 * F♯ in D major prints no sign, F prints a natural; B♭ in F major prints none, B a natural.
 */
export function spellBar(chords: readonly (readonly number[])[], signature = 0): SpelledKey[][] {
  const flats = signature < 0
  const names = flats ? FLAT_NAMES : NAMES
  const sign = flats ? 'b' : '#'
  const state = new Map<string, boolean>()
  // Letters altered by the key signature are altered from the start of every bar.
  const inKey = new Set<string>(flats ? FLAT_ORDER.slice(0, -signature) : SHARP_ORDER.slice(0, Math.max(0, signature)))
  return chords.map((keys) => keys.map((midi) => {
    const pc = ((midi % 12) + 12) % 12
    // A flat is written on the octave of its letter: C♭ would be the only exception, and it is not used here.
    const octave = Math.floor(midi / 12) - 1
    const letter = names[pc]!
    const line = `${letter}${octave}`
    const altered = BLACK[pc]!
    const before = state.get(line) ?? inKey.has(letter)
    state.set(line, altered)
    const accidental = altered ? (before ? null : sign) : before ? 'n' : null
    return { key: `${letter}${altered ? sign : ''}/${octave}`, accidental }
  }))
}

/** The bar playing at `time` (song seconds); 0 before the first bar, the last one after the end. */
export function barAt(bars: readonly WrittenBar[], time: number): number {
  let index = 0
  while (index < bars.length - 1 && bars[index + 1]!.start <= time) index++
  return index
}

/** A key the child played, in song seconds (already moved back to what the child heard). */
export interface PlayedKey {
  key: number
  start: number
  /** Release; null while the key is still held. */
  end: number | null
}

/** The child's keys as written notes on the same bar grid as the part; a held key grows until `now`. */
export function writePlayed(played: readonly PlayedKey[], bars: readonly number[], meter: TimeSignature, now: number): WrittenBar[] {
  return writePart(played.map((item) => ({ key: item.key, start: item.start, length: Math.max(0, (item.end ?? now) - item.start), velocity: 100 })), bars, meter)
}

/**
 * How a played note compares with the part at the same moment, like a teacher reading along:
 * `right` (same keys, starts with the note, same length), `off` (same keys, but too short, too long
 * or not on the note's start), `wrong` (other keys, or a note where the part rests).
 */
export type PlayedMark = 'right' | 'off' | 'wrong'

const SLOT_OF: Record<Duration, number> = { whole: 16, half: 8, quarter: 4, eighth: 2, sixteenth: 1 }
const slotsOfNote = (note: WrittenNote) => SLOT_OF[note.duration] * (note.dots ? 1.5 : 1)

interface Chain {
  keys: number[]
  time: number
  slots: number
  /** "bar:note" of every written piece of the sound. */
  ids: string[]
}

/** Written notes joined back into sounds: tied pieces are one sound. */
function chains(bars: readonly WrittenBar[]): Chain[] {
  const result: Chain[] = []
  let open: Chain | null = null
  for (const bar of bars) {
    bar.notes.forEach((note, i) => {
      const id = `${bar.index}:${i}`
      if (open) {
        open.slots += slotsOfNote(note)
        open.ids.push(id)
      } else {
        open = { keys: note.keys, time: note.time, slots: slotsOfNote(note), ids: [id] }
        result.push(open)
      }
      if (!note.tie) open = null
    })
  }
  return result
}

/**
 * Marks keyed "bar:note" for every played (non-rest) piece. A held key is one sound however it is
 * written, so all its tied pieces get the same mark. Octaves count when `anyOctave`.
 */
export function markPlayed(target: readonly WrittenBar[], played: readonly WrittenBar[], anyOctave = false): Record<string, PlayedMark> {
  const norm = (keys: readonly number[]) => [...new Set(keys.map((key) => (anyOctave ? ((key % 12) + 12) % 12 : key)))].sort((a, b) => a - b).join(',')
  const wanted = chains(target)
  const marks: Record<string, PlayedMark> = {}
  for (const sound of chains(played)) {
    if (sound.keys.length === 0) continue
    // The part's sound going on when this one starts.
    let at: Chain | null = null
    for (const item of wanted) if (item.time <= sound.time + 1e-6) at = item
    const mark: PlayedMark = !at || at.keys.length === 0 || norm(at.keys) !== norm(sound.keys)
      ? 'wrong'
      : Math.abs(at.time - sound.time) < 1e-6 && at.slots === sound.slots ? 'right' : 'off'
    for (const id of sound.ids) marks[id] = mark
  }
  return marks
}

/**
 * Where each drum sits on the five-line percussion staff, as drummers read it: kick at the bottom,
 * snare in the middle, toms around it, cymbals above with cross heads.
 */
const DRUM_PLACES: Record<DrumKind, string> = {
  kick: 'f/4',
  snare: 'c/5',
  clap: 'c/5/x2',
  hihatClosed: 'g/5/x2',
  hihatPedal: 'd/4/x2',
  hihatOpen: 'g/5/x3',
  crash: 'a/5/x2',
  ride: 'f/5/x2',
  rideBell: 'f/5/d2',
  tom: 'e/5',
  tambourine: 'b/5/x2',
  cowbell: 'e/5/x2',
  other: 'b/4/x2',
}

/** Toms by height: high, middle and floor sit on different places. */
const TOM_PLACES: Record<number, string> = { 50: 'e/5', 48: 'e/5', 47: 'd/5', 45: 'd/5', 43: 'a/4', 41: 'a/4' }

/** VexFlow key of a GM drum note on the percussion staff. */
export function drumPlace(midi: number): string {
  return TOM_PLACES[midi] ?? DRUM_PLACES[drumKind(midi)]
}
