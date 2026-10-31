// «Теория» → «Ноты» (plan step 19): read a note, press its key. First the names on the keys, then the
// landmarks of the treble and bass clefs, then exact octaves inside the 25 keys of the MK4, then ledger
// lines that need the octave buttons. Pure code, no Vue, no UI text.

import { isGraze, type Press } from './ladder'
import type { Rhythm, RhythmScore } from './rhythm'
import { RHYTHM_LEVELS, makeTask, passes } from './rhythmLevels'
import { STAR_THRESHOLDS, starsFor } from './levels'
import { barKeys, keyOf, spelled, stepTarget, type Alter, type BarNote, type KeySignature, type Letter, type Spelled, type StepTask } from './accidentals'
import { interval, type IntervalId } from './intervals'
import { circleChain, type CircleChord } from './circle'
import { chordTask, degreeChord, functionChord, type ChordTask, type FunctionId } from './functions'
import type { ChordType } from './theory'
import { KEYS, KEY_INFO, RESOLUTION, parallelKey, relativeKey, spellScale, transpose, type KeyName, type ScaleKind } from './scales'
import { pitch } from './staff'
import { pitchClass } from './theory'

export type NoteIntroId = 'keyboard' | 'names' | 'treble' | 'bass' | 'grand' | 'ledgers' | 'timed' | 'reading'
  | 'semitone' | 'sharpFlat' | 'natural' | 'double' | 'enharmonic' | 'keySignature'
  | 'perfect' | 'thirds' | 'sixths' | 'byEar' | 'harmonic' | 'byNotes'
  | 'majorSteps' | 'minorSteps' | 'scaleVariants' | 'circle' | 'stable' | 'transpose'
  | 'mainTriads' | 'inversions' | 'degrees' | 'minorDominant' | 'symbols' | 'harmonize' | 'chain' | 'chainNoHints' | 'allChains'

/** How the task is shown: the note's name only, a step from a key on the keyboard, or the note on a staff. */
/** `ear` and `read`: an interval to name with buttons, heard or read from the staff (plan step 21). */
export type NoteShow = 'name' | 'step' | 'bar' | 'ear' | 'read' | 'treble' | 'bass' | 'grand'
  /** Plan step 22: build a scale, name a key, finish a melody, move a melody up. */
  | 'scale' | 'keyChoice' | 'resolve' | 'transpose'
  /** Plan step 23: play a chord, choose T/S/D for a bar, play a chain around the circle. */
  | 'chord' | 'harmony' | 'chain'

export interface NoteLevel {
  id: number
  show: NoteShow
  keys: readonly number[]
  /** Any octave counts (first levels); otherwise the very key on the staff. */
  anyOctave: boolean
  introduces: NoteIntroId[]
  /** Upper levels: only an answer within this many ms earns its star (plan step 19: «на время только на верхних уровнях»). */
  timed?: number
  /** Short melodies read in rhythm with the metronome, at this tempo, instead of single notes. */
  readingBpm?: number
  /** Stars at this many right answers (melodies count fewer than single notes). */
  stars?: readonly [number, number, number]
  /** Notes written with accidentals (plan step 20): the staff shows the writing, the key is where it sounds. */
  written?: readonly Spelled[]
  /** Intervals of the level (plan step 21): built from a key (`step`), heard (`ear`) or read (`read`). */
  intervals?: readonly IntervalId[]
  /** Heard together, not one after the other. */
  harmonic?: boolean
  /** Buttons to choose from on `ear` and `read` levels, the right one among them. */
  options?: number
  /** Scales to build on a `scale` level. */
  scales?: readonly ScaleKind[]
  /** `chord` levels: how the chord is asked, in which keys, in which inversions. */
  chordMode?: 'function' | 'degree' | 'symbol'
  chordKeys?: readonly KeyName[]
  inversions?: readonly number[]
  /** `chain` levels: the inner-ring positions the chains start from, and whether the keys light up. */
  chainStarts?: readonly number[]
  chainHints?: boolean
}

/** Sections of «Теория» built from note-finding levels. */
export type NoteSectionId = 'notes' | 'accidentals' | 'intervals' | 'scales' | 'functions'

const keys = (names: string) => names.trim().split(/\s+/).map(pitch)
const writtenAs = (names: string) => names.trim().split(/\s+/).map(spelled)
/** A level of written notes: the keys are where they sound. */
const writtenLevel = (level: Omit<NoteLevel, 'keys' | 'written'>, names: string): NoteLevel => ({ ...level, written: writtenAs(names), keys: writtenAs(names).map(keyOf) })

export const NOTE_LEVELS: readonly NoteLevel[] = [
  { id: 1, show: 'name', keys: keys('C4 D4 E4 F4 G4 A4 B4'), anyOctave: true, introduces: ['keyboard', 'names'] },
  // Landmarks of the treble clef (соль on the 2nd line, до on the 1st ledger line below, соль above the 5th) and their neighbours.
  { id: 2, show: 'treble', keys: keys('C4 D4 F4 G4 A4 F5 G5'), anyOctave: true, introduces: ['treble'] },
  { id: 3, show: 'treble', keys: keys('C4 D4 E4 F4 G4 A4 B4 C5'), anyOctave: false, introduces: [] },
  // Landmarks of the bass clef (фа on the 4th line, фа under the 1st, до on the 1st ledger line above) and their neighbours.
  { id: 4, show: 'bass', keys: keys('F2 G2 E3 F3 G3 B3 C4'), anyOctave: true, introduces: ['bass'] },
  { id: 5, show: 'bass', keys: keys('C3 D3 E3 F3 G3 A3 B3 C4'), anyOctave: false, introduces: [] },
  // With the MK4 at C3-C5 both clefs fit without moving the octave (plan step 19).
  { id: 6, show: 'grand', keys: keys('C3 E3 G3 B3 D4 F4 A4 C5 D3 F3 A3 C4 E4 G4 B4'), anyOctave: false, introduces: ['grand'] },
  // Ledger lines past the 25 keys: the child moves the octave on the MK4, which is what 8va means.
  { id: 7, show: 'grand', keys: keys('D5 E5 G5 A5 C6 C2 E2 G2 B2'), anyOctave: false, introduces: ['ledgers'] },
  // Reading at sight: every note of both clefs inside C3-C5, a few seconds each. No key hint here: it would give the answer.
  { id: 8, show: 'grand', keys: keys('C3 D3 E3 F3 G3 A3 B3 C4 D4 E4 F4 G4 A4 B4 C5'), anyOctave: false, introduces: ['timed'], timed: 4000 },
  // Read a short melody in rhythm (the rhythm of Р4), one hand on C4-G4 like the «Ода» that follows.
  { id: 9, show: 'treble', keys: keys('C4 D4 E4 F4 G4'), anyOctave: false, introduces: ['reading'], readingBpm: 60, stars: [3, 6, 9] },
]

// «Теория» → «Полутоны и знаки» (plan step 20): steps on the keyboard, then sharps and flats, naturals and doubles,
// then one key written two ways. All inside C4-C5, so the MK4 out of the box needs no octave press.
export const ACCIDENTAL_LEVELS: readonly NoteLevel[] = [
  { id: 1, show: 'step', keys: keys('C4 C#4 D4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 B4'), anyOctave: false, introduces: ['semitone'] },
  writtenLevel({ id: 2, show: 'treble', anyOctave: false, introduces: ['sharpFlat'] }, 'C#4 D#4 F#4 G#4 A#4 Db4 Eb4 Gb4 Ab4 Bb4'),
  writtenLevel({ id: 3, show: 'treble', anyOctave: false, introduces: ['natural', 'double'] }, 'Fn4 Bn4 Fx4 Cx4 Gx4 Bbb4 Ebb4 Abb4'),
  writtenLevel({ id: 4, show: 'treble', anyOctave: false, introduces: ['enharmonic'] }, 'E#4 B#4 Fb4 Cb5 C#4 Db4 F#4 Gb4 A#4 Bb4'),
  // A bar under a key signature, played note by note; a whole bar counts as one answer.
  { id: 5, show: 'bar', keys: keys('C4 C#4 D4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 B4 C5'), anyOctave: false, introduces: ['keySignature'], stars: [3, 6, 10] },
]

/** A bar to play under a key signature, and the keys it sounds on. */
export interface KeyBar {
  key: KeySignature
  notes: BarNote[]
  keys: number[]
}

/** The letter each key signature alters: F in G major, B in F major. */
const KEY_LETTER: Record<'G' | 'F', Letter> = { G: 3, F: 6 }
/** Signs that make a usual black key on each letter (no E♯ or C♭ here: those are for П4). */
const PLAIN_SIGNS: Record<Letter, (1 | -1)[]> = { 0: [1], 1: [1, -1], 2: [-1], 3: [1], 4: [1, -1], 5: [1, -1], 6: [-1] }

/**
 * A bar of four notes on C4-B4 (C5 at most) that teaches one of two things: the key-signature letter played
 * altered, then cancelled by a natural that holds to the end of the bar; or a sign that holds for the same note
 * later in the bar. The key-signature letter is always in it.
 */
export function makeKeyBar(random: () => number = Math.random): KeyBar {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!
  const key = pick(['G', 'F'] as const)
  const marked = KEY_LETTER[key]
  const others = ([0, 1, 2, 3, 4, 5, 6] as Letter[]).filter((letter) => letter !== marked)
  const plain = (letter: Letter): BarNote => ({ letter, octave: 4, sign: null })
  let notes: BarNote[]
  if (random() < 0.5) {
    notes = [plain(marked), plain(pick(others)), { letter: marked, octave: 4, sign: 'natural' }, plain(marked)]
  } else {
    const letter = pick(others)
    const sign = pick(PLAIN_SIGNS[letter])
    notes = [{ letter, octave: 4, sign }, plain(letter), plain(pick(others.filter((other) => other !== letter))), plain(marked)]
  }
  return { key, notes, keys: barKeys(key, notes) }
}

// «Теория» → «Интервалы» (plan step 21): build from a key, then hear, then read. Built intervals land on C4-C5, inside
// the 25 keys of the MK4 out of the box; heard ones are played from C4-G4.
const WHITE_KEYS = keys('C4 D4 E4 F4 G4 A4 B4 C5')
export const INTERVAL_LEVELS: readonly NoteLevel[] = [
  { id: 1, show: 'step', keys: WHITE_KEYS, anyOctave: false, introduces: ['perfect'], intervals: ['P4', 'P5', 'P8'] },
  { id: 2, show: 'step', keys: WHITE_KEYS, anyOctave: false, introduces: ['thirds'], intervals: ['m2', 'M2', 'm3', 'M3'] },
  { id: 3, show: 'step', keys: WHITE_KEYS, anyOctave: false, introduces: ['sixths'], intervals: ['m6', 'M6', 'm7', 'M7', 'A4'] },
  { id: 4, show: 'ear', keys: WHITE_KEYS, anyOctave: false, introduces: ['byEar'], intervals: ['M2', 'M3', 'P5', 'P8'], options: 3 },
  { id: 5, show: 'ear', keys: WHITE_KEYS, anyOctave: false, introduces: ['harmonic'], intervals: ['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'm6', 'M6', 'P8'], options: 4, harmonic: true },
  { id: 6, show: 'read', keys: WHITE_KEYS, anyOctave: false, introduces: ['byNotes'], intervals: ['m2', 'M2', 'm3', 'M3', 'P4', 'A4', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'], options: 4 },
]

// «Теория» → «Гаммы» (plan step 22): build scales one octave up (up and down was too long a row for a child),
// name keys by their signature, finish a melody on its stable note, move a melody up. Everything inside C3-C5.
export const SCALE_LEVELS: readonly NoteLevel[] = [
  { id: 1, show: 'scale', keys: [], anyOctave: false, introduces: ['majorSteps'], scales: ['major'] },
  { id: 2, show: 'scale', keys: [], anyOctave: false, introduces: ['minorSteps'], scales: ['minor'] },
  { id: 3, show: 'scale', keys: [], anyOctave: false, introduces: ['scaleVariants'], scales: ['harmonicMinor', 'melodicMinor', 'harmonicMajor'] },
  { id: 4, show: 'keyChoice', keys: [], anyOctave: false, introduces: ['circle'], options: 4 },
  { id: 5, show: 'resolve', keys: [], anyOctave: false, introduces: ['stable'] },
  { id: 6, show: 'transpose', keys: [], anyOctave: false, introduces: ['transpose'], stars: [3, 6, 10] },
]

// «Теория» → «Функции» (plan step 23): main triads and their inversions, triads on the degrees, D in minor, chord
// symbols, choosing T/S/D for a melody, and the owner's «Цепочка по кругу». Every chord inside C3-C5.
export const FUNCTION_LEVELS: readonly NoteLevel[] = [
  { id: 1, show: 'chord', keys: [], anyOctave: true, introduces: ['mainTriads'], chordMode: 'function', chordKeys: ['C', 'G', 'F'], inversions: [0] },
  { id: 2, show: 'chord', keys: [], anyOctave: true, introduces: ['inversions'], chordMode: 'function', chordKeys: ['C', 'G', 'F'], inversions: [1, 2] },
  { id: 3, show: 'chord', keys: [], anyOctave: true, introduces: ['degrees'], chordMode: 'degree', chordKeys: ['C', 'G', 'Am', 'Em'], inversions: [0] },
  { id: 4, show: 'chord', keys: [], anyOctave: true, introduces: ['minorDominant'], chordMode: 'function', chordKeys: ['Am', 'Em', 'Dm'], inversions: [0] },
  { id: 5, show: 'chord', keys: [], anyOctave: true, introduces: ['symbols'], chordMode: 'symbol', inversions: [0, 1] },
  { id: 6, show: 'harmony', keys: [], anyOctave: true, introduces: ['harmonize'] },
  { id: 7, show: 'chain', keys: [], anyOctave: false, introduces: ['chain'], chainStarts: [0], chainHints: true, stars: [3, 6, 10] },
  { id: 8, show: 'chain', keys: [], anyOctave: false, introduces: ['chainNoHints'], chainStarts: [0], chainHints: false, stars: [3, 6, 10] },
  { id: 9, show: 'chain', keys: [], anyOctave: false, introduces: ['allChains'], chainStarts: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], chainHints: false, stars: [6, 12, 24] },
]

export const NOTE_SECTIONS: Readonly<Record<NoteSectionId, readonly NoteLevel[]>> = { notes: NOTE_LEVELS, accidentals: ACCIDENTAL_LEVELS, intervals: INTERVAL_LEVELS, scales: SCALE_LEVELS, functions: FUNCTION_LEVELS }

/** A chord to play, and how it was asked: a function or a degree in a key, or a symbol. */
export interface ChordQuestion {
  chord: ChordTask
  key?: KeyName
  fn?: FunctionId
  degree?: number
  inversion: number
}

/** Symbols asked on the symbol level: chords of C, G, F and A minor, some as slash chords (their 6 chords). */
const SYMBOL_CHORDS: readonly { root: number, type: ChordType }[] = [
  { root: 0, type: 'maj' }, { root: 7, type: 'maj' }, { root: 5, type: 'maj' }, { root: 9, type: 'min' }, { root: 2, type: 'min' }, { root: 4, type: 'min' },
]

export function makeChordQuestion(level: NoteLevel, previous: ChordQuestion | null, random: () => number = Math.random): ChordQuestion {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!
  const inversion = pick(level.inversions ?? [0])
  if (level.chordMode === 'symbol') {
    const options = SYMBOL_CHORDS.filter((item) => item.root !== previous?.chord.target.root || item.type !== previous.chord.target.type)
    const chosen = pick(options)
    return { chord: chordTask(chosen.root, chosen.type, inversion), inversion }
  }
  const key = pick<KeyName>(level.chordKeys ?? ['C'])
  if (level.chordMode === 'degree') {
    const degree = pick([1, 2, 3, 4, 5, 6, 7].filter((item) => item !== previous?.degree))
    return { chord: degreeChord(key, degree, inversion), key, degree, inversion }
  }
  const fn = pick((['T', 'S', 'D'] as FunctionId[]).filter((item) => item !== previous?.fn || key !== previous?.key))
  return { chord: functionChord(key, fn, inversion), key, fn, inversion }
}

/** A bar of a known melody to harmonise with T, S or D (the chord the piece really uses there). */
export interface HarmonyQuestion {
  key: KeyName
  written: Spelled[]
  answer: FunctionId
}

const HARMONY_BARS: readonly { key: KeyName, notes: string, answer: FunctionId }[] = [
  { key: 'C', notes: 'E4 E4 F4 G4', answer: 'T' },
  { key: 'C', notes: 'G4 F4 E4 D4', answer: 'D' },
  { key: 'C', notes: 'C4 C4 D4 E4', answer: 'T' },
  { key: 'C', notes: 'E4 D4 D4', answer: 'D' },
  { key: 'F', notes: 'A4 A4 G4 A4', answer: 'T' },
  { key: 'F', notes: 'A4 A4 Bb4 G4', answer: 'D' },
  { key: 'F', notes: 'D4 D4 Bb4 Bb4', answer: 'S' },
  { key: 'F', notes: 'A4 G4 F4 F4', answer: 'T' },
]

export function makeHarmony(previous: HarmonyQuestion | null, random: () => number = Math.random): HarmonyQuestion {
  const bars = HARMONY_BARS.filter((bar) => bar.notes !== previous?.written.map((note) => `${'CDEFGAB'[note.letter]}${note.alter === -1 ? 'b' : ''}${note.octave}`).join(' '))
  const bar = bars[Math.floor(random() * bars.length)]!
  return { key: bar.key, written: bar.notes.split(' ').map(spelled), answer: bar.answer }
}

/** Whether exactly these keys are down (a voicing), a neighbour brushed with them forgiven. */
export function checkVoicing(expected: readonly number[], held: readonly Press[]): 'empty' | 'right' | 'partial' | 'wrong' {
  if (held.length === 0) return 'empty'
  const hits = held.filter((item) => expected.includes(item.key))
  const others = held.filter((item) => !expected.includes(item.key))
  const allIn = expected.every((key) => held.some((item) => item.key === key))
  if (allIn && others.every((item) => isGraze(item, hits, 1))) return 'right'
  return others.length === 0 ? 'partial' : 'wrong'
}

/** Notes played one after the other (a scale, a melody moved up), with what the staff shows for them. */
export interface NoteSequence {
  keys: number[]
  /** Written notes on the staff: the scale itself (shown as it is played), or the melody to move. */
  written: Spelled[]
  /** Key signature of the written notes. */
  signature: number
  /** The scale is revealed note by note; a melody to move stands whole from the start. */
  reveal: boolean
  /** What is asked: the key and kind of the scale, or how far to move the melody. */
  scale?: { key: KeyName, kind: ScaleKind }
  shift?: number
}

/** A key to name by its signature and a last bar that ends on its tonic. */
export interface KeyChoice {
  answer: KeyName
  options: KeyName[]
  written: Spelled[]
  signature: number
}

/** A short melody that stops on an unstable degree; the key it pulls to is the answer. */
export interface Resolution {
  key: KeyName
  written: Spelled[]
  /** The note it resolves to, shown once found. */
  resolution: Spelled
}

const MAJORS: KeyName[] = ['C', 'G', 'D', 'F']
const MINORS: KeyName[] = ['Am', 'Em', 'Bm', 'Dm']

/** A scale to build: the key fits its kind (minor kinds on minor keys), the tonic low enough to end by C5. */
export function makeScaleSequence(level: NoteLevel, previous: NoteSequence | null, random: () => number = Math.random): NoteSequence {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!
  const kind: ScaleKind = pick<ScaleKind>(level.scales ?? ['major'])
  const keys = (kind === 'major' || kind === 'harmonicMajor' ? MAJORS : MINORS).filter((name) => name !== previous?.scale?.key || (level.scales?.length ?? 1) > 1)
  const key = pick(keys)
  const written = spellScale(KEY_INFO[key].tonic, kind)
  return { keys: written.map(keyOf), written, signature: 0, reveal: true, scale: { key, kind } }
}

/**
 * A key to name: its signature and the last bar, degrees 3-2-7-1 (in minor the raised 7th, the sign that tells it
 * from the major with the same signature). The choices are the key, its relative and parallel keys, and others.
 */
export function makeKeyChoice(level: NoteLevel, previous: KeyName | null, random: () => number = Math.random): KeyChoice {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!
  const answer = pick(KEYS.filter((name) => name !== previous))
  const info = KEY_INFO[answer]
  const options = new Set<KeyName>([answer])
  for (const near of [relativeKey(answer), parallelKey(answer)]) if (near) options.add(near)
  while (options.size < (level.options ?? 4)) options.add(pick(KEYS))
  // Written an octave up when the tonic is low: easier to read on the treble staff.
  const tonic = { ...info.tonic, octave: info.tonic.octave < 4 ? info.tonic.octave + 1 : info.tonic.octave }
  const scale = spellScale(tonic, info.minor ? 'harmonicMinor' : 'major')
  const below = (note: Spelled): Spelled => ({ ...note, octave: note.octave - 1 })
  return { answer, options: [...options].sort(() => random() - 0.5), written: [scale[2]!, scale[1]!, below(scale[6]!), scale[0]!], signature: info.signature }
}

/** Short melodies that stop on an unstable degree (2, 4, 6, 7), by the degree they stop on. */
const PULLS: Record<number, number[]> = { 2: [1, 3, 2], 4: [5, 3, 4], 6: [3, 5, 6], 7: [5, 6, 7] }

export function makeResolution(previous: Resolution | null, random: () => number = Math.random): Resolution {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!
  const key = pick(MAJORS.filter((name) => name !== previous?.key))
  const scale = spellScale(KEY_INFO[key].tonic, 'major')
  const degree = pick([2, 4, 6, 7])
  return { key, written: PULLS[degree]!.map((step) => scale[step - 1]!), resolution: scale[RESOLUTION[degree]! - 1]! }
}

/** Melodies the child knows, written in their key, to move up a semitone or a tone (Ёлочка a tone: F to G major). */
const PHRASES: { notes: string, signature: number, shifts: number[] }[] = [
  { notes: 'C4 A4 A4 G4 A4 F4 C4 C4', signature: -1, shifts: [2] },
  { notes: 'E4 E4 F4 G4 G4 F4 E4 D4', signature: 0, shifts: [1, 2] },
  { notes: 'A4 F4 A4 F4 Bb4 A4 G4', signature: -1, shifts: [1, 2] },
]

export function makeTransposition(previous: NoteSequence | null, random: () => number = Math.random): NoteSequence {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!
  const choices = PHRASES.flatMap((phrase) => phrase.shifts.map((shift) => ({ phrase, shift }))).filter(({ phrase, shift }) => !(previous && previous.shift === shift && previous.written.length === phrase.notes.split(' ').length))
  const { phrase, shift } = pick(choices)
  const written = phrase.notes.split(' ').map(spelled)
  return { keys: transpose(written.map(keyOf), shift), written, signature: phrase.signature, reveal: false, shift }
}

/** The rhythm level the melodies of «Читаем с ритмом» take their values from: halves, quarters, eighths, rests. */
const READING_RHYTHM = RHYTHM_LEVELS.find((item) => item.id === 4)!

/**
 * A melody to read: a rhythm of Р4 with keys of the level, moving by step or a third the way a beginner's
 * tune does, from and back to the lowest note. Tied notes keep their key; rests have none.
 */
export function makeMelody(level: NoteLevel, random: () => number = Math.random): Rhythm {
  const rhythm = makeTask(READING_RHYTHM, random)
  const scale = [...level.keys].sort((a, b) => a - b)
  let place = 0
  const sounding = rhythm.notes.map((note, i) => ({ note, i })).filter(({ note }) => !note.rest)
  const keyAt = new Map<number, number>()
  sounding.forEach(({ i }, n) => {
    const tiedFrom = i > 0 && rhythm.notes[i - 1]!.tie && !rhythm.notes[i - 1]!.rest
    if (n > 0 && !tiedFrom) {
      // A step or a third that stays on the five keys and never further from home than the notes left can come
      // back by such steps: the last note is home, because a tune that ends on its first note sounds finished.
      const left = sounding.length - 1 - n
      const highest = Math.min(scale.length - 1, 2 * left)
      const moves = [-2, -1, 1, 2].map((step) => place + step).filter((to) => to >= 0 && to <= highest)
      place = moves.length ? moves[Math.floor(random() * moves.length)]! : 0
    }
    keyAt.set(i, scale[place]!)
  })
  return { ...rhythm, notes: rhythm.notes.map((note, i) => (keyAt.has(i) ? { ...note, key: keyAt.get(i)! } : note)) }
}

export type ReadMark = 'right' | 'wrongKey' | 'off' | 'missed'

/** Each note after an attempt: the right key on time, the right key off time, a wrong key, or not played. */
export function readMarks(melody: Rhythm, score: RhythmScore): Record<number, ReadMark> {
  return Object.fromEntries(score.results.map((result) => {
    const want = melody.notes[result.index]?.key
    const mark: ReadMark = result.verdict === 'missed' ? 'missed' : result.key !== want ? 'wrongKey' : result.verdict === 'onTime' ? 'right' : 'off'
    return [result.index, mark]
  }))
}

/** Passed: the rhythm passes as in «Ритм» and every note was played on its own key. */
export function readingPasses(melody: Rhythm, score: RhythmScore): boolean {
  return passes(score) && Object.values(readMarks(melody, score)).every((mark) => mark !== 'wrongKey')
}

/** Whether a right answer counts towards the stars: on a timed level only a quick one does. */
export function countsForStars(level: NoteLevel, answerMs: number): boolean {
  return level.timed === undefined || answerMs <= level.timed
}

export interface NoteLevelProgress {
  correct: number
}

export function parseNoteProgress(value: unknown, levels: readonly NoteLevel[] = NOTE_LEVELS): Record<number, NoteLevelProgress> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const progress: Record<number, NoteLevelProgress> = {}
  for (const [key, item] of Object.entries(value)) {
    const correct = (item as Partial<NoteLevelProgress> | null)?.correct
    if (levels.some((level) => level.id === Number(key)) && typeof correct === 'number' && correct >= 0) progress[Number(key)] = { correct: Math.floor(correct) }
  }
  return progress
}

/** Stars as in «Аккорды»: 5, 10 and 20 notes found; a level of melodies sets its own counts. */
export function noteStars(progress: Readonly<Record<number, NoteLevelProgress>>, id: number, levels: readonly NoteLevel[] = NOTE_LEVELS): number {
  const correct = progress[id]?.correct ?? 0
  const own = levels.find((level) => level.id === id)?.stars
  return own ? own.filter((threshold) => correct >= threshold).length : starsFor(correct)
}

export function isNoteLevelOpen(id: number, progress: Readonly<Record<number, NoteLevelProgress>>, levels: readonly NoteLevel[] = NOTE_LEVELS): boolean {
  if (!levels.some((level) => level.id === id)) return false
  return id === 1 || noteStars(progress, id - 1, levels) >= STAR_THRESHOLDS.length
}

/** Where to open: the first open level that still lacks stars, or the last open one. */
export function currentNoteLevel(progress: Readonly<Record<number, NoteLevelProgress>>, levels: readonly NoteLevel[] = NOTE_LEVELS): number {
  const open = levels.filter((level) => isNoteLevelOpen(level.id, progress, levels))
  return (open.find((level) => noteStars(progress, level.id, levels) < STAR_THRESHOLDS.length) ?? open[open.length - 1] ?? levels[0]!).id
}

/** One task: the key to press, and how it was asked (written with accidentals, or a step from a key). */
export interface NoteTask {
  key: number
  written?: Spelled
  step?: StepTask
  /** A bar under a key signature: its keys are played one after the other; `key` is the first. */
  bar?: KeyBar
  /** An interval to name with buttons: the two notes (lower first), heard or read, and the choices. */
  choice?: IntervalChoice
  /** Notes played one after the other: a scale to build, a melody to move up. `key` is the first. */
  sequence?: NoteSequence
  /** A key to name with buttons. */
  keyChoice?: KeyChoice
  /** A melody to finish: `key` is where it resolves. */
  resolution?: Resolution
  /** A chord to play (plan step 23). */
  chordQuestion?: ChordQuestion
  /** A bar to harmonise with a button. */
  harmony?: HarmonyQuestion
  /** Four chords around the circle, played one after the other in the fixed voicing. */
  chain?: CircleChord[]
}

export interface IntervalChoice {
  answer: IntervalId
  options: IntervalId[]
  low: Spelled
  high: Spelled
  harmonic: boolean
}

/**
 * An interval to name: the answer (never the one before), a few other choices, and two notes for it — the lower on
 * a white key of C4-G4, the upper written with the letter the interval needs (a third above D is F♯, not G♭).
 */
export function makeChoice(level: NoteLevel, previous: IntervalId | null, random: () => number = Math.random): IntervalChoice {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!
  const pool = level.intervals ?? []
  const answer = pick(pool.filter((id) => id !== previous))
  const others = pool.filter((id) => id !== answer && interval(id).semitones !== interval(answer).semitones)
  const chosen: IntervalId[] = []
  while (chosen.length < Math.min((level.options ?? 3) - 1, others.length)) {
    const next = pick(others.filter((id) => !chosen.includes(id)))
    chosen.push(next)
  }
  const options = [answer, ...chosen].sort((a, b) => interval(a).semitones - interval(b).semitones)
  const { steps, semitones } = interval(answer)
  // Lower notes whose upper note needs at most one sharp or flat and stays inside C4-C5.
  const lows = (['C4', 'D4', 'E4', 'F4', 'G4'] as const).map(spelled).filter((low) => {
    const letter = (low.letter + steps - 1) % 7
    const octave = low.octave + Math.floor((low.letter + steps - 1) / 7)
    const alter = keyOf(low) + semitones - keyOf({ letter: letter as Letter, octave, alter: 0 })
    return Math.abs(alter) <= 1 && keyOf(low) + semitones <= 72
  })
  const low = pick(lows)
  const letter = ((low.letter + steps - 1) % 7) as Letter
  const octave = low.octave + Math.floor((low.letter + steps - 1) / 7)
  const high: Spelled = { letter, octave, alter: (keyOf(low) + semitones - keyOf({ letter, octave, alter: 0 })) as Alter }
  return { answer, options, low, high, harmonic: Boolean(level.harmonic) }
}

/** The next task: never the same as the one before, so the child sees that the task changed. */
export function nextTask(level: NoteLevel, previous: NoteTask | null, random: () => number = Math.random): NoteTask {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] ?? items[0]!
  if (level.show === 'scale' || level.show === 'transpose') {
    const sequence = level.show === 'scale' ? makeScaleSequence(level, previous?.sequence ?? null, random) : makeTransposition(previous?.sequence ?? null, random)
    return { key: sequence.keys[0]!, sequence }
  }
  if (level.show === 'chord') return { key: 0, chordQuestion: makeChordQuestion(level, previous?.chordQuestion ?? null, random) }
  if (level.show === 'harmony') return { key: 0, harmony: makeHarmony(previous?.harmony ?? null, random) }
  if (level.show === 'chain') {
    const starts = (level.chainStarts ?? [0]).filter((start) => start !== previous?.chain?.[0]?.position || (level.chainStarts?.length ?? 1) === 1)
    return { key: 0, chain: circleChain(starts[Math.floor(random() * starts.length)]!) }
  }
  if (level.show === 'keyChoice') return { key: 0, keyChoice: makeKeyChoice(level, previous?.keyChoice?.answer ?? null, random) }
  if (level.show === 'resolve') {
    const resolution = makeResolution(previous?.resolution ?? null, random)
    return { key: keyOf(resolution.resolution), resolution }
  }
  if (level.show === 'ear' || level.show === 'read') return { key: 0, choice: makeChoice(level, previous?.choice?.answer ?? null, random) }
  if (level.show === 'step') {
    // A step or an interval up or down from a key, landing between the lowest key and the highest (C4-C5 at most):
    // inside the 25 keys both of the MK4 out of the box and of the screen.
    const low = Math.min(...level.keys)
    const high = Math.max(...level.keys) + (level.intervals ? 0 : 1)
    const sizes: { semitones: number, interval?: IntervalId }[] = level.intervals ? level.intervals.map((id) => ({ semitones: interval(id).semitones, interval: id })) : [{ semitones: 1 }, { semitones: 2 }]
    const steps = level.keys.filter((from) => from !== previous?.step?.from).flatMap((from) => sizes.flatMap((size) => [true, false].map((up): StepTask => ({ from, up, ...size }))))
    const step = pick(steps.filter((item) => stepTarget(item) >= low && stepTarget(item) <= high))
    return { key: stepTarget(step), step }
  }
  if (level.show === 'bar') {
    const bar = makeKeyBar(random)
    return { key: bar.keys[0]!, bar }
  }
  if (level.written) {
    const index = level.written.indexOf(pick(level.written.filter((note) => note !== previous?.written)))
    return { key: level.keys[index]!, written: level.written[index]! }
  }
  return { key: pick(level.keys.filter((key) => key !== previous?.key)) }
}

/**
 * What the held keys say about the task. `right`: the key (or, with any octave, the same note in another
 * octave) is down, and every other key is a brushed neighbour. `octave`: the right note in the wrong octave on
 * an exact level. `wrong`: anything else. Pressing many keys at once is never right.
 */
export function checkNote(target: number, held: readonly Press[], anyOctave: boolean): 'empty' | 'right' | 'octave' | 'wrong' {
  if (held.length === 0) return 'empty'
  const hit = held.find((item) => (anyOctave ? pitchClass(item.key) === pitchClass(target) : item.key === target))
  const others = held.filter((item) => item !== hit)
  if (hit && others.every((item) => isGraze(item, [hit], 1))) return 'right'
  if (!anyOctave && held.length === 1 && pitchClass(held[0]!.key) === pitchClass(target)) return 'octave'
  return 'wrong'
}
