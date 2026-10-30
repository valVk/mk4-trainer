// Where notes live (plan step 19): octave names of the piano, the place of a note on the staff, and which
// octaves the 25 keys of the MK4 cover right now. Pure code, no Vue, no UI text.

import { KEYBOARD_KEYS, isBlackKey } from './keyboard'
import { pitchClass } from './theory'

/** Russian octave names from the lowest piano octave up; the index is the scientific octave (C4 is in «первая»). */
export const OCTAVE_NAMES = ['subContra', 'contra', 'great', 'small', 'first', 'second', 'third', 'fourth', 'fifth'] as const
export type OctaveName = typeof OCTAVE_NAMES[number]

/** The 88 keys of a piano: A0 to C8. */
export const PIANO_LOW = 21
export const PIANO_HIGH = 108

/** Notes in scientific pitch: C4 is middle C (60). */
const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
export function pitch(name: string): number {
  const match = /^([A-G])(#|b)?(-?\d)$/.exec(name)
  if (!match) throw new Error(`Bad note ${name}`)
  const [, letter, accidental, octave] = match
  return (Number(octave) + 1) * 12 + NOTE_INDEX[letter!]! + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0)
}

/** Scientific octave of a key: C4 (middle C, 60) is in octave 4. */
export function octaveOf(key: number): number {
  return Math.floor(key / 12) - 1
}

export function octaveName(key: number): OctaveName | null {
  return OCTAVE_NAMES[octaveOf(key)] ?? null
}

/** Octaves the window holds whole (a 25-key window from C holds two, plus the next C). */
export function windowOctaves(start: number): OctaveName[] {
  const names: OctaveName[] = []
  for (let first = start; first + 11 < start + KEYBOARD_KEYS; first += 12) {
    const name = octaveName(first)
    if (name && pitchClass(first) === 0) names.push(name)
  }
  return names
}

/** Octave buttons to press so the key is in the window: positive is «Octave +», 0 when it already fits. */
export function octaveShift(key: number, start: number): number {
  const high = start + KEYBOARD_KEYS - 1
  if (key > high) return Math.ceil((key - high) / 12)
  if (key < start) return -Math.ceil((start - key) / 12)
  return 0
}

export type StaffClef = 'treble' | 'bass'

/** Letter index of white keys inside an octave (C D E F G A B); black keys share the letter below (written with a sharp). */
const LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6] as const
/** Diatonic steps from C0 of the bottom line: E4 for the treble clef, G2 for the bass clef. */
const BOTTOM_LINE: Record<StaffClef, number> = { treble: 4 * 7 + 2, bass: 2 * 7 + 4 }
/** The top line is four lines (eight steps) above the bottom one. */
const TOP_LINE = 8

export interface StaffPlace {
  clef: StaffClef
  /** Steps from the bottom line: 0 is the bottom line, 1 the first space, 8 the top line, -2 the first ledger line below. */
  step: number
  onLine: boolean
  /** Ledger lines the note needs: positive above the staff, negative below. */
  ledgers: number
  sharp: boolean
}

/** Diatonic steps from C0: one per white key. */
export function diatonicStep(key: number): number {
  return octaveOf(key) * 7 + LETTER[pitchClass(key)]!
}

export function staffPlace(key: number, clef: StaffClef): StaffPlace {
  const step = diatonicStep(key) - BOTTOM_LINE[clef]
  const ledgers = step > TOP_LINE ? Math.floor((step - TOP_LINE) / 2) : step < -1 ? -Math.floor(-step / 2) : 0
  return { clef, step, onLine: step % 2 === 0, ledgers, sharp: isBlackKey(key) }
}

/** More ledger lines than this are written with 8va or 15ma instead. */
export const MAX_LEDGERS = 3

/** How the note is written so it stays readable: as it is, an octave higher than written (8va) or two (15ma); the same below with 8vb. */
export function octaveSign(key: number, clef: StaffClef): '8va' | '15ma' | '8vb' | null {
  const { ledgers } = staffPlace(key, clef)
  if (ledgers > MAX_LEDGERS) return staffPlace(key - 12, clef).ledgers > MAX_LEDGERS ? '15ma' : '8va'
  if (ledgers < -MAX_LEDGERS) return '8vb'
  return null
}

/** The clef a single note is read in: middle C and up in the treble clef, below it in the bass clef. */
export function clefOf(key: number): StaffClef {
  return key >= 60 ? 'treble' : 'bass'
}

// The octave map (plan step 19, owner's addition): the grand staff from C2 to C6 laid out by pitch, one column per
// white key, the name of each octave under its C, and the MK4 window as a band over the columns it covers.

export const MAP_LOW = 36
export const MAP_HIGH = 84

export interface MapColumn {
  key: number
  /** The octave name, on the C that starts it. */
  octave: OctaveName | null
}

export function mapColumns(): MapColumn[] {
  const columns: MapColumn[] = []
  for (let key = MAP_LOW; key <= MAP_HIGH; key++) {
    if (!isBlackKey(key)) columns.push({ key, octave: pitchClass(key) === 0 ? octaveName(key) : null })
  }
  return columns
}

/** Column of a key on the map (a black key shares the column of the white key below); null off the map. */
export function mapColumn(key: number): number | null {
  if (key < MAP_LOW || key > MAP_HIGH) return null
  return diatonicStep(key) - diatonicStep(MAP_LOW)
}

/** First and last column the 25-key window covers, clipped to the map. */
export function mapBand(start: number): { from: number, to: number } {
  const last = diatonicStep(MAP_HIGH) - diatonicStep(MAP_LOW)
  const clip = (key: number) => Math.max(0, Math.min(last, diatonicStep(key) - diatonicStep(MAP_LOW)))
  return { from: clip(start), to: clip(start + KEYBOARD_KEYS - 1) }
}

/** The window goes past the top or bottom of the map: what the notes would be written with. */
export function mapSign(start: number): '8va' | '8vb' | null {
  if (start + KEYBOARD_KEYS - 1 > MAP_HIGH) return '8va'
  if (start < MAP_LOW) return '8vb'
  return null
}
