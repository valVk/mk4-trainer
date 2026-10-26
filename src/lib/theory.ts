// Music theory core: pure functions, no Vue, no UI text.
// Everything is in MIDI numbers (C4 = 60) and semitones.

export type PitchClass = number

export type ChordType = 'maj' | 'min' | 'dim' | 'aug' | 'sus2' | 'sus4' | '6' | '7' | 'maj7' | 'm7'

// One table drives both building and recognition, so they cannot drift apart.
export const CHORD_FORMULAS: Readonly<Record<ChordType, readonly number[]>> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '6': [0, 4, 7, 9],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
}

export const CHORD_TYPES = Object.keys(CHORD_FORMULAS) as ChordType[]

export const CHORD_SYMBOLS: Readonly<Record<ChordType, string>> = {
  maj: '',
  min: 'm',
  dim: 'dim',
  aug: 'aug',
  sus2: 'sus2',
  sus4: 'sus4',
  '6': '6',
  '7': '7',
  maj7: 'maj7',
  m7: 'm7',
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

export function pitchClass(note: number): PitchClass {
  return ((note % 12) + 12) % 12
}

export function noteName(pc: PitchClass, preferFlats = false): string {
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES
  return names[pitchClass(pc)] as string
}

/** MIDI note to scientific pitch name: 60 -> "C4". */
export function midiName(note: number, preferFlats = false): string {
  return `${noteName(note, preferFlats)}${Math.floor(note / 12) - 1}`
}

export function chordSymbol(root: PitchClass, type: ChordType, preferFlats = false): string {
  return `${noteName(root, preferFlats)}${CHORD_SYMBOLS[type]}`
}

function uniqueSorted(values: Iterable<number>): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
}

/**
 * Chord notes from a MIDI root. Each inversion moves the lowest note up an octave:
 * C E G -> E G C -> G C E.
 */
export function buildChord(root: number, type: ChordType, inversion = 0): number[] {
  const notes = CHORD_FORMULAS[type].map((interval) => root + interval)
  if (!Number.isInteger(inversion) || inversion < 0 || inversion >= notes.length) {
    throw new RangeError(`Inversion ${inversion} is not valid for ${type}`)
  }
  for (let i = 0; i < inversion; i++) {
    notes.push((notes.shift() as number) + 12)
  }
  return notes
}

export function chordPitchClasses(root: PitchClass, type: ChordType): PitchClass[] {
  return uniqueSorted(CHORD_FORMULAS[type].map((interval) => pitchClass(root + interval)))
}

/** Semitones between neighbouring held notes, lowest first: C4 E4 G4 -> [4, 3]. */
export function intervalsBetween(notes: readonly number[]): number[] {
  const sorted = uniqueSorted(notes)
  return sorted.slice(1).map((note, i) => note - (sorted[i] as number))
}

export function findChordType(intervals: readonly number[]): ChordType | null {
  const key = uniqueSorted(intervals.map(pitchClass))
  return CHORD_TYPES.find((type) => sameNumbers(CHORD_FORMULAS[type], key)) ?? null
}

export interface ChordMatch {
  root: PitchClass
  type: ChordType
  /** 0 = root position; index of the bass note in the chord formula. */
  inversion: number
  bass: PitchClass
}

/**
 * Every chord the held notes can be read as. Octaves and doublings are ignored,
 * the lowest note decides the inversion. Ambiguous sets (C6 = Am7, Csus2 = Gsus4)
 * return all readings, root-position ones first.
 */
export function identifyChord(notes: readonly number[]): ChordMatch[] {
  if (notes.length === 0) return []
  const pcs = uniqueSorted(notes.map(pitchClass))
  const bass = pitchClass(Math.min(...notes))
  const matches: ChordMatch[] = []
  for (const root of pcs) {
    const type = findChordType(pcs.map((pc) => pc - root))
    if (!type) continue
    const inversion = CHORD_FORMULAS[type].indexOf(pitchClass(bass - root))
    matches.push({ root, type, inversion, bass })
  }
  return matches.sort((a, b) => Number(a.inversion !== 0) - Number(b.inversion !== 0))
}

export interface ChordTarget {
  root: PitchClass
  type: ChordType
  /** When set, the bass note must match this inversion. */
  inversion?: number
}

export type ChordCheckStatus = 'empty' | 'correct' | 'incomplete' | 'extra' | 'wrong' | 'wrongInversion'

export interface ChordCheck {
  status: ChordCheckStatus
  missing: PitchClass[]
  extra: PitchClass[]
}

/**
 * Compares held notes with the task by pitch class. Call it on every noteOn and noteOff:
 * releasing an extra note can make the chord correct.
 */
export function checkChord(played: readonly number[], target: ChordTarget): ChordCheck {
  if (played.length === 0) return { status: 'empty', missing: [], extra: [] }
  const expected = chordPitchClasses(target.root, target.type)
  const held = uniqueSorted(played.map(pitchClass))
  const missing = expected.filter((pc) => !held.includes(pc))
  const extra = held.filter((pc) => !expected.includes(pc))
  let status: ChordCheckStatus
  if (missing.length > 0 && extra.length > 0) status = 'wrong'
  else if (missing.length > 0) status = 'incomplete'
  else if (extra.length > 0) status = 'extra'
  else if (target.inversion !== undefined) {
    const bass = pitchClass(Math.min(...played) - target.root)
    status = CHORD_FORMULAS[target.type].indexOf(bass) === target.inversion ? 'correct' : 'wrongInversion'
  } else status = 'correct'
  return { status, missing, extra }
}

// Modes are rotations of the major scale: dorian starts on degree 2, aeolian on 6.
export const MODES = ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian'] as const
export type Mode = (typeof MODES)[number]

const MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1] as const
const MAJOR_DEGREES = [0, 2, 4, 5, 7, 9, 11] as const
const FLAT_MAJOR_KEYS: ReadonlySet<PitchClass> = new Set([5, 10, 3, 8, 1, 6])

export function modeSteps(mode: Mode): number[] {
  const offset = MODES.indexOf(mode)
  return [...MAJOR_STEPS.slice(offset), ...MAJOR_STEPS.slice(0, offset)]
}

export function scale(root: PitchClass, mode: Mode = 'ionian'): PitchClass[] {
  const result = [pitchClass(root)]
  for (const step of modeSteps(mode).slice(0, -1)) {
    result.push(pitchClass((result[result.length - 1] as number) + step))
  }
  return result
}

/** Major key that shares notes with the mode: D dorian -> C, A aeolian -> C. */
export function parentMajor(root: PitchClass, mode: Mode): PitchClass {
  return pitchClass(root - MAJOR_DEGREES[MODES.indexOf(mode)]!)
}

/** Spell with flats when the parent major key uses flats (Eb dorian comes from Db major). */
export function prefersFlats(root: PitchClass, mode: Mode = 'ionian'): boolean {
  return FLAT_MAJOR_KEYS.has(parentMajor(root, mode))
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const
const LOWERCASE_TYPES: ReadonlySet<ChordType> = new Set(['min', 'dim', 'm7'])
const ROMAN_SUFFIX: Partial<Record<ChordType, string>> = {
  dim: '°',
  aug: '+',
  '7': '7',
  m7: '7',
  maj7: 'maj7',
  '6': '6',
  sus2: 'sus2',
  sus4: 'sus4',
}

/** Degree is 1-based: (5, '7') -> "V7", (7, 'dim') -> "vii°". */
export function romanNumeral(degree: number, type: ChordType | null): string {
  const base = ROMAN[degree - 1]
  if (!base) throw new RangeError(`Degree ${degree} is out of range`)
  if (!type) return `${base}?`
  const numeral = LOWERCASE_TYPES.has(type) ? base.toLowerCase() : base
  return `${numeral}${ROMAN_SUFFIX[type] ?? ''}`
}

export interface DiatonicChord {
  degree: number
  root: PitchClass
  /** null when the stacked notes are not in the formula table (e.g. half-diminished 7th). */
  type: ChordType | null
  roman: string
}

/**
 * Chords on each scale degree, built by stacking every other scale note.
 * Quality comes from the intervals, not from a hardcoded "ii is minor" list.
 */
export function diatonicChords(root: PitchClass, mode: Mode = 'ionian', size: 3 | 4 = 3): DiatonicChord[] {
  const notes = scale(root, mode)
  return notes.map((chordRoot, i) => {
    const intervals = Array.from({ length: size }, (_, k) => (notes[(i + k * 2) % 7] as number) - chordRoot)
    const type = findChordType(intervals)
    return { degree: i + 1, root: chordRoot, type, roman: romanNumeral(i + 1, type) }
  })
}

/** Degrees are 1-based: [1, 5, 6, 4] in G major -> G D Em C. */
export function progressionChords(root: PitchClass, mode: Mode, degrees: readonly number[]): DiatonicChord[] {
  const chords = diatonicChords(root, mode)
  return degrees.map((degree) => {
    const chord = chords[degree - 1]
    if (!chord) throw new RangeError(`Degree ${degree} is out of range`)
    return chord
  })
}
