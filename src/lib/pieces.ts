// Built-in pieces (plan step 18): public-domain melodies in our own simple arrangements, written here
// as notes and turned into MIDI files, so they open in the song practice with its ladder, stars and staff.
// No MIDI files from elsewhere (plan section 9). Pure code, no Vue, no UI text.

import { MIDIBuilder, MIDIMessageTypes } from 'spessasynth_core'

import { noteQuarters, type Duration } from './rhythm'
import type { TimeSignature } from './song'
import { pitch } from './staff'

/** One written note of a voice; `key` null is a rest. */
export interface PieceNote {
  key: number | null
  duration: Duration
  dots?: number
  /** Held on into the next note (same key): one sound, one tap. */
  tie?: boolean
}

export interface PieceVoice {
  /** 0-based MIDI channel; 9 is the drum kit. */
  channel: number
  /** GM program (ignored on the drum channel). */
  program: number
  notes: PieceNote[]
  velocity?: number
}

/**
 * `melody`: the child plays the tune on the keys (its channel is the melody's).
 * `rhythm`: the child taps the tune's rhythm on a drum pad while the tune plays (plan step 18).
 */
export type PieceKind = 'melody' | 'rhythm'

/** Sections of «Теория» that end their level groups with pieces. */
export type TheorySection = 'rhythm' | 'notes' | 'accidentals' | 'intervals' | 'scales' | 'functions'

export interface Piece {
  /** Stable id; the version goes up whenever the notes change, so saved copies are refreshed. */
  id: string
  version: number
  title: string
  /** Rhythm pieces: the short name on the chip next to the theory levels. */
  short?: string
  kind: PieceKind
  meter: TimeSignature
  /** Quarter notes per minute. */
  bpm: number
  voices: PieceVoice[]
  /** The channel the child plays; for rhythm pieces the drum channel made from the melody. */
  learner: number
  /** Rhythm pieces: the drum part is a groove of its own, not the rhythm of the tune. */
  groove?: boolean
  /** Key signature written into the file (plan steps 20, 22): sharps positive, flats negative. */
  keySignature?: number
  /** The level of «Теория» the piece comes after: it opens with that level's last star. */
  after?: { section: TheorySection, level: number }
}

const DRUMS = 9
/** The drum a rhythm piece is tapped on: the snare, pad 2 on the MK4 layout. */
const RHYTHM_DRUM = 38

export { pitch }

/**
 * A voice written compactly: "E5/16 D#5/16 A4/8 r/16" — note (or r for a rest), slash, value
 * (1 2 4 8 16, a dot after it for a dotted note, a ~ after that to tie it to the next note).
 */
export function voice(text: string): PieceNote[] {
  const VALUES: Record<string, Duration> = { 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth' }
  return text.trim().split(/\s+/).map((token) => {
    const [name, written] = token.split('/') as [string, string]
    const tie = written.endsWith('~')
    const value = written.replace('~', '')
    const dots = value.endsWith('.') ? 1 : 0
    const duration = VALUES[value.replace('.', '')]
    if (!duration) throw new Error(`Bad value ${token}`)
    return { key: name === 'r' ? null : pitch(name), duration, dots, ...(tie ? { tie } : {}) }
  })
}

/** The rhythm of a voice as drum hits: same values, every note on one drum, rests kept. */
export function rhythmVoice(notes: readonly PieceNote[], drum = RHYTHM_DRUM): PieceNote[] {
  return notes.map((note) => ({ ...note, key: note.key === null ? null : drum }))
}

export function voiceQuarters(notes: readonly PieceNote[]): number {
  return notes.reduce((sum, note) => sum + noteQuarters(note), 0)
}

// «К Элизе» (Beethoven, WoO 59), the opening in a simple arrangement: the right hand as written (C4-E5,
// inside the 25 keys), the left hand one long bass note per bar instead of the broken chords. The pickup
// (two sixteenths) is the end of a first bar that starts with a rest, so the bar lines fall where they should.
const FUR_ELISE: Piece = {
  id: 'fur-elise',
  version: 1,
  title: 'К Элизе (простая)',
  kind: 'melody',
  meter: { numerator: 3, denominator: 8 },
  bpm: 54,
  learner: 0,
  voices: [
    {
      channel: 0,
      program: 0,
      notes: voice(`
        r/4 E5/16 D#5/16
        E5/16 D#5/16 E5/16 B4/16 D5/16 C5/16
        A4/8 r/16 C4/16 E4/16 A4/16
        B4/8 r/16 E4/16 G#4/16 B4/16
        C5/8 r/16 E4/16 E5/16 D#5/16
        E5/16 D#5/16 E5/16 B4/16 D5/16 C5/16
        A4/8 r/16 C4/16 E4/16 A4/16
        B4/8 r/16 E4/16 C5/16 B4/16
        A4/4.
      `),
    },
    {
      channel: 1,
      program: 0,
      velocity: 70,
      notes: voice(`
        r/4.
        r/4.
        A2/4.
        E2/4.
        A2/4.
        r/4.
        A2/4.
        E2/4.
        A2/4.
      `),
    },
  ],
}

// «Ода к радости» (Beethoven, Symphony 9), simplified to quarters and halves for Р2.
const ODE_MELODY = voice(`
  E4/4 E4/4 F4/4 G4/4   G4/4 F4/4 E4/4 D4/4   C4/4 C4/4 D4/4 E4/4   E4/4 D4/4 D4/2
  E4/4 E4/4 F4/4 G4/4   G4/4 F4/4 E4/4 D4/4   C4/4 C4/4 D4/4 E4/4   D4/4 C4/4 C4/2
`)
const ODE: Piece = {
  id: 'ode-to-joy',
  version: 1,
  title: 'Ода к радости — ритм',
  short: 'Ода',
  kind: 'rhythm',
  meter: { numerator: 4, denominator: 4 },
  bpm: 84,
  learner: DRUMS,
  after: { section: 'rhythm', level: 2 },
  voices: [
    { channel: 0, program: 0, notes: ODE_MELODY },
    { channel: 1, program: 32, velocity: 80, notes: voice('C3/1 G2/1 C3/1 G2/1 C3/1 G2/1 C3/1 G2/2 C3/2') },
    { channel: DRUMS, program: 0, notes: rhythmVoice(ODE_MELODY) },
  ],
}

// «Row, Row, Row Your Boat» (traditional), in 6/8 for Р10.
const ROW_MELODY = voice(`
  C4/4. C4/4.   C4/4 D4/8 E4/4.   E4/4 D4/8 E4/4 F4/8   G4/2.
  C5/8 C5/8 C5/8 G4/8 G4/8 G4/8   E4/8 E4/8 E4/8 C4/8 C4/8 C4/8   G4/4 F4/8 E4/4 D4/8   C4/2.
`)
const ROW: Piece = {
  id: 'row-row',
  version: 1,
  title: 'Row, Row, Row Your Boat — ритм',
  short: 'Row, row',
  kind: 'rhythm',
  meter: { numerator: 6, denominator: 8 },
  bpm: 60,
  learner: DRUMS,
  after: { section: 'rhythm', level: 10 },
  voices: [
    { channel: 0, program: 0, notes: ROW_MELODY },
    { channel: 1, program: 32, velocity: 80, notes: voice('C3/2. C3/2. C3/2. C3/2. C3/2. C3/2. G2/2. C3/2.') },
    { channel: DRUMS, program: 0, notes: rhythmVoice(ROW_MELODY) },
  ],
}

// «Чижик-пыжик» (Russian folk song), melody as in the Wikipedia score after Rappaport (2016), F major.
// The song is in 2/4; here two of its bars make one 4/4 bar, because 2/4 comes only in Р7. Sung twice.
const CHIZHIK_VERSE = `
  A4/8 F4/8 A4/8 F4/8 Bb4/8 A4/8 G4/4
  C4/8 C4/8 C4/8 D4/16 E4/16 F4/8 F4/8 F4/4
`
const CHIZHIK_MELODY = voice(CHIZHIK_VERSE + CHIZHIK_VERSE)
const CHIZHIK: Piece = {
  id: 'chizhik',
  version: 1,
  title: 'Чижик-пыжик — ритм',
  short: 'Чижик',
  kind: 'rhythm',
  meter: { numerator: 4, denominator: 4 },
  bpm: 76,
  learner: DRUMS,
  after: { section: 'rhythm', level: 5 },
  voices: [
    { channel: 0, program: 0, notes: CHIZHIK_MELODY },
    { channel: 1, program: 32, velocity: 80, notes: voice('F2/2 G2/2 C3/2 F2/2 F2/2 G2/2 C3/2 F2/2') },
    { channel: DRUMS, program: 0, notes: rhythmVoice(CHIZHIK_MELODY) },
  ],
}

// Our own little waltz in 3/4 for Р7 (the meter and the strong first beat): halves, quarters and dotted halves.
// Under it a bass note on «раз» and a chord tone on «два, три», so the child hears the waltz swing.
const WALTZ_MELODY = voice(`
  C4/2 E4/4   G4/2.   F4/2 E4/4   D4/2.   D4/2 F4/4   A4/2 G4/4   E4/4 D4/4 C4/4   D4/2.
  C4/2 E4/4   G4/2.   A4/2 G4/4   F4/2 E4/4   D4/2 E4/4   F4/4 E4/4 D4/4   C4/2.   C4/2.
`)
/** Chord roots per bar, bass on beat one, the chord's fifth on beats two and three. */
const WALTZ_ROOTS = ['C3', 'C3', 'G2', 'G2', 'D3', 'F2', 'C3', 'G2', 'C3', 'C3', 'F2', 'F2', 'G2', 'G2', 'C3', 'C3']
const WALTZ_FIFTHS = ['G3', 'G3', 'D3', 'D3', 'A3', 'C3', 'G3', 'D3', 'G3', 'G3', 'C3', 'C3', 'D3', 'D3', 'G3', 'G3']
const WALTZ: Piece = {
  id: 'waltz',
  version: 1,
  title: 'Маленький вальс — ритм',
  short: 'Вальс',
  kind: 'rhythm',
  meter: { numerator: 3, denominator: 4 },
  bpm: 96,
  learner: DRUMS,
  after: { section: 'rhythm', level: 7 },
  voices: [
    { channel: 0, program: 0, notes: WALTZ_MELODY },
    { channel: 1, program: 32, velocity: 80, notes: voice(WALTZ_ROOTS.map((root) => `${root}/4 r/2`).join(' ')) },
    { channel: 2, program: 0, velocity: 55, notes: voice(WALTZ_FIFTHS.map((fifth) => `r/4 ${fifth}/4 ${fifth}/4`).join(' ')) },
    { channel: DRUMS, program: 0, notes: rhythmVoice(WALTZ_MELODY) },
  ],
}

// «В лесу родилась ёлочка» (L. Bekman, 1905; public domain), first verse as printed on a-pesni.org: F major,
// 2/4, starting with a pickup eighth (Р8). The first bar is a rest with that pickup at its end.
const YOLKA_MELODY = voice(`
  r/4. C4/8
  A4/8 A4/8 G4/8 A4/8   F4/8 C4/8 C4/8 C4/8   A4/8 A4/8 Bb4/8 G4/8   C5/4. C5/8
  D4/8 D4/8 Bb4/8 Bb4/8   A4/8 G4/8 F4/8 F4/8   A4/8 A4/8 G4/8 A4/8   F4/4. r/8
`)
const YOLKA: Piece = {
  id: 'yolochka',
  version: 1,
  title: 'В лесу родилась ёлочка — ритм',
  short: 'Ёлочка',
  kind: 'rhythm',
  meter: { numerator: 2, denominator: 4 },
  bpm: 66,
  learner: DRUMS,
  after: { section: 'rhythm', level: 8 },
  voices: [
    { channel: 0, program: 0, notes: YOLKA_MELODY },
    { channel: 1, program: 32, velocity: 80, notes: voice('r/2 F2/2 F2/2 C3/2 F2/2 Bb2/2 F2/2 C3/2 F2/2') },
    { channel: DRUMS, program: 0, notes: rhythmVoice(YOLKA_MELODY) },
  ],
}

// «The Entertainer» (S. Joplin, 1902; public domain), the first theme after the Mutopia edition, the tune
// alone an octave lower, with the second ending. Sixteenths tied over the beat: the syncopation of Р8.
const ENTERTAINER_A = 'E4/16 C5/8 E4/16 C5/8 E4/16 C5/16~'
const ENTERTAINER_MELODY = voice(`
  r/4. D4/16 D#4/16
  ${ENTERTAINER_A}   C5/4~ C5/16 C5/16 D5/16 D#5/16   E5/16 C5/16 D5/16 E5/16~ E5/16 B4/16 D5/8   C5/4~ C5/8 D4/16 D#4/16
  ${ENTERTAINER_A}   C5/4~ C5/8 A4/16 G4/16   F#4/16 A4/16 C5/16 E5/16~ E5/16 D5/16 C5/16 A4/16   D5/4~ D5/8 D4/16 D#4/16
  ${ENTERTAINER_A}   C5/4~ C5/16 C5/16 D5/16 D#5/16   E5/16 C5/16 D5/16 E5/16~ E5/16 B4/16 D5/8   C5/4~ C5/8 C5/16 D5/16
  E5/16 C5/16 D5/16 E5/16~ E5/16 C5/16 D5/16 C5/16   E5/16 C5/16 D5/16 E5/16~ E5/16 C5/16 D5/16 C5/16
  E5/16 C5/16 D5/16 E5/16~ E5/16 B4/16 D5/8   C5/4 r/4
`)
const ENTERTAINER: Piece = {
  id: 'entertainer',
  version: 1,
  title: 'The Entertainer — ритм',
  short: 'Entertainer',
  kind: 'rhythm',
  meter: { numerator: 2, denominator: 4 },
  bpm: 56,
  learner: DRUMS,
  after: { section: 'rhythm', level: 8 },
  voices: [
    { channel: 0, program: 0, notes: ENTERTAINER_MELODY },
    {
      channel: 1,
      program: 32,
      velocity: 80,
      notes: voice('r/2 C3/2 C3/2 G2/2 C3/2 C3/2 A2/2 D3/2 G2/2 C3/2 C3/2 G2/2 C3/2 C3/2 C3/2 G2/2 C3/2'),
    },
    { channel: DRUMS, program: 0, notes: rhythmVoice(ENTERTAINER_MELODY) },
  ],
}

// «Барабанщик», the end of the rhythm block: our own groove on the snare under «Ода к радости», from a
// whole note down to a break of sixteenths. Not the tune's rhythm: the child keeps their own part going.
const DRUMMER_GROOVE = voice(`
  C4/1   C4/2 C4/2   C4/4 C4/4 C4/4 C4/4   C4/4. C4/8 C4/2
  C4/8 C4/8 C4/4 C4/8 C4/8 C4/4   C4/4 C4/8 C4/8 C4/4 C4/8 C4/8   C4/4. C4/8 C4/4 C4/4
  C4/16 C4/16 C4/16 C4/16 C4/16 C4/16 C4/16 C4/16 C4/8 C4/8 C4/4
`)
const DRUMMER: Piece = {
  id: 'drummer',
  version: 1,
  title: 'Барабанщик',
  short: 'Барабанщик',
  kind: 'rhythm',
  meter: { numerator: 4, denominator: 4 },
  bpm: 84,
  learner: DRUMS,
  after: { section: 'rhythm', level: 10 },
  groove: true,
  voices: [
    { channel: 0, program: 0, notes: ODE_MELODY },
    { channel: 1, program: 32, velocity: 80, notes: voice('C3/1 G2/1 C3/1 G2/1 C3/1 G2/1 C3/1 G2/2 C3/2') },
    { channel: DRUMS, program: 0, notes: rhythmVoice(DRUMMER_GROOVE) },
  ],
}

// «Ода к радости» read from the notes with the right hand (plan step 19, after reading in rhythm, Н9): the same
// tune as the rhythm piece, now on the keys, C4-G4, with the bass under it.
const ODE_RIGHT: Piece = {
  id: 'ode-right-hand',
  version: 1,
  title: 'Ода к радости — правая рука',
  short: 'Ода',
  kind: 'melody',
  meter: { numerator: 4, denominator: 4 },
  bpm: 72,
  learner: 0,
  after: { section: 'notes', level: 9 },
  voices: [
    { channel: 0, program: 0, notes: ODE_MELODY },
    { channel: 1, program: 32, velocity: 80, notes: voice('C3/1 G2/1 C3/1 G2/1 C3/1 G2/1 C3/1 G2/2 C3/2') },
  ],
}

// «Ода к радости» in D major (plan step 20, after the key-signature level П5). The plan said G major, but there the
// theme never meets its F♯; in D major it starts on F♯ and plays it again and again, with C♯ near the end.
const ODE_D_MELODY = voice(`
  F#4/4 F#4/4 G4/4 A4/4   A4/4 G4/4 F#4/4 E4/4   D4/4 D4/4 E4/4 F#4/4   F#4/4 E4/4 E4/2
  F#4/4 F#4/4 G4/4 A4/4   A4/4 G4/4 F#4/4 E4/4   D4/4 D4/4 E4/4 F#4/4   E4/4 D4/4 D4/2
`)
const ODE_D: Piece = {
  id: 'ode-d-major',
  version: 1,
  title: 'Ода к радости — ре мажор',
  short: 'Ода в ре',
  kind: 'melody',
  meter: { numerator: 4, denominator: 4 },
  bpm: 72,
  learner: 0,
  keySignature: 2,
  after: { section: 'accidentals', level: 5 },
  voices: [
    { channel: 0, program: 0, notes: ODE_D_MELODY },
    { channel: 1, program: 32, velocity: 80, notes: voice('D3/1 A2/1 D3/1 A2/1 D3/1 A2/1 D3/1 A2/2 D3/2') },
  ],
}

/** The same tune, every note moved by some semitones (rests stay). */
function transposeVoice(notes: readonly PieceNote[], semitones: number): PieceNote[] {
  return notes.map((note) => ({ ...note, key: note.key === null ? null : note.key + semitones }))
}

// «Ёлочка» on the keys (plan step 22): first in F major as written, then moved a tone up to G major, as the child
// did with its first phrase in «Гаммы».
const YOLKA_BASS = voice('r/2 F2/2 F2/2 C3/2 F2/2 Bb2/2 F2/2 C3/2 F2/2')
const YOLKA_F: Piece = {
  id: 'yolochka-f',
  version: 1,
  title: 'В лесу родилась ёлочка — фа мажор',
  short: 'Ёлочка в фа',
  kind: 'melody',
  meter: { numerator: 2, denominator: 4 },
  bpm: 76,
  learner: 0,
  keySignature: -1,
  after: { section: 'scales', level: 6 },
  voices: [
    { channel: 0, program: 0, notes: YOLKA_MELODY },
    { channel: 1, program: 32, velocity: 80, notes: YOLKA_BASS },
  ],
}
const YOLKA_G: Piece = {
  ...YOLKA_F,
  id: 'yolochka-g',
  title: 'В лесу родилась ёлочка — соль мажор',
  short: 'Ёлочка в соль',
  keySignature: 1,
  voices: [
    { channel: 0, program: 0, notes: transposeVoice(YOLKA_MELODY, 2) },
    { channel: 1, program: 32, velocity: 80, notes: transposeVoice(YOLKA_BASS, 2) },
  ],
}

// «Ода к радости» with the left hand on chords (plan step 23): T and D under the melody, a chord a bar. C as C3-E3-G3,
// G as D3-G3-B3 (its second inversion: the hand barely moves). Both hands inside the MK4 out of the box (C3-C5).
const ODE_CHORD_TONES = [
  'C3/1 D3/1 C3/1 D3/1 C3/1 D3/1 C3/1 D3/2 C3/2',
  'E3/1 G3/1 E3/1 G3/1 E3/1 G3/1 E3/1 G3/2 E3/2',
  'G3/1 B3/1 G3/1 B3/1 G3/1 B3/1 G3/1 B3/2 G3/2',
]
const ODE_LEFT: Piece = {
  id: 'ode-left-chords',
  version: 1,
  title: 'Ода к радости — левая рука T и D',
  short: 'Ода: аккорды',
  kind: 'melody',
  meter: { numerator: 4, denominator: 4 },
  bpm: 66,
  learner: 1,
  after: { section: 'functions', level: 6 },
  voices: [
    { channel: 0, program: 0, notes: ODE_MELODY },
    ...ODE_CHORD_TONES.map((tones) => ({ channel: 1, program: 0, velocity: 80, notes: voice(tones) })),
  ],
}

export const PIECES: readonly Piece[] = [FUR_ELISE, ODE, CHIZHIK, WALTZ, YOLKA, ENTERTAINER, ROW, DRUMMER, ODE_RIGHT, ODE_D, YOLKA_F, YOLKA_G, ODE_LEFT]

/** The file name a piece is stored under: built in, with its version. */
export function pieceFileName(piece: Pick<Piece, 'id' | 'version'>): string {
  return `builtin-${piece.id}-v${piece.version}.mid`
}

/** Whether a stored song is a built-in piece, and which. */
export function builtinId(fileName: string): string | null {
  return /^builtin-(.+)-v\d+\.mid$/.exec(fileName)?.[1] ?? null
}

const TICKS_PER_QUARTER = 480

/** The piece as a standard MIDI file: one track per voice, the meter and tempo in the first track. */
export function buildPieceMidi(piece: Piece): ArrayBuffer {
  const midi = new MIDIBuilder({ name: piece.title, timeDivision: TICKS_PER_QUARTER, initialTempo: piece.bpm, format: 1 })
  const { numerator, denominator } = piece.meter
  midi.addEvent(0, 0, MIDIMessageTypes.timeSignature, [numerator, Math.log2(denominator), 24, 8])
  // Sharps or flats as a signed byte, major mode.
  if (piece.keySignature) midi.addEvent(0, 0, MIDIMessageTypes.keySignature, [(piece.keySignature + 256) % 256, 0])
  piece.voices.forEach((item) => {
    midi.addTrack(`ch${item.channel + 1}`)
    const track = midi.tracks.length - 1
    if (item.channel !== DRUMS) midi.programChange(0, track, item.channel, item.program)
    let ticks = 0
    /** Where the sounding note started, while it is tied on into the next ones. */
    let held: number | null = null
    for (const note of item.notes) {
      const length = Math.round(noteQuarters(note) * TICKS_PER_QUARTER)
      if (note.key !== null) {
        const start: number = held ?? ticks
        if (held === null) midi.noteOn(start, track, item.channel, note.key, item.velocity ?? 96)
        held = note.tie ? start : null
        // A hair short, so repeated notes are heard as two.
        if (held === null) midi.noteOff(ticks + Math.max(1, length - 12), track, item.channel, note.key)
      }
      ticks += length
    }
  })
  midi.flush()
  return midi.writeMIDI()
}
