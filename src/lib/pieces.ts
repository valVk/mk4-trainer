// Built-in pieces (plan step 18): public-domain melodies in our own simple arrangements, written here
// as notes and turned into MIDI files, so they open in the song practice with its ladder, stars and staff.
// No MIDI files from elsewhere (plan section 9). Pure code, no Vue, no UI text.

import { MIDIBuilder, MIDIMessageTypes } from 'spessasynth_core'

import { noteQuarters, type Duration } from './rhythm'
import type { TimeSignature } from './song'

/** One written note of a voice; `key` null is a rest. */
export interface PieceNote {
  key: number | null
  duration: Duration
  dots?: number
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
  /** Rhythm pieces: the theory level they come after («Теория» → «Ритм»). */
  afterLevel?: number
}

const DRUMS = 9
/** The drum a rhythm piece is tapped on: the snare, pad 2 on the MK4 layout. */
const RHYTHM_DRUM = 38

/** Notes in scientific pitch: C4 is middle C (60). */
const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
export function pitch(name: string): number {
  const match = /^([A-G])(#|b)?(-?\d)$/.exec(name)
  if (!match) throw new Error(`Bad note ${name}`)
  const [, letter, accidental, octave] = match
  return (Number(octave) + 1) * 12 + NOTE_INDEX[letter!]! + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0)
}

/**
 * A voice written compactly: "E5/16 D#5/16 A4/8 r/16" — note (or r for a rest), slash, value
 * (1 2 4 8 16, a dot after it for a dotted note).
 */
export function voice(text: string): PieceNote[] {
  const VALUES: Record<string, Duration> = { 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth' }
  return text.trim().split(/\s+/).map((token) => {
    const [name, value] = token.split('/') as [string, string]
    const dots = value.endsWith('.') ? 1 : 0
    const duration = VALUES[value.replace('.', '')]
    if (!duration) throw new Error(`Bad value ${token}`)
    return { key: name === 'r' ? null : pitch(name), duration, dots }
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
  afterLevel: 2,
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
  afterLevel: 10,
  voices: [
    { channel: 0, program: 0, notes: ROW_MELODY },
    { channel: 1, program: 32, velocity: 80, notes: voice('C3/2. C3/2. C3/2. C3/2. C3/2. C3/2. G2/2. C3/2.') },
    { channel: DRUMS, program: 0, notes: rhythmVoice(ROW_MELODY) },
  ],
}

export const PIECES: readonly Piece[] = [FUR_ELISE, ODE, ROW]

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
  piece.voices.forEach((item) => {
    midi.addTrack(`ch${item.channel + 1}`)
    const track = midi.tracks.length - 1
    if (item.channel !== DRUMS) midi.programChange(0, track, item.channel, item.program)
    let ticks = 0
    for (const note of item.notes) {
      const length = Math.round(noteQuarters(note) * TICKS_PER_QUARTER)
      if (note.key !== null) {
        midi.noteOn(ticks, track, item.channel, note.key, item.velocity ?? 96)
        // A hair short, so repeated notes are heard as two.
        midi.noteOff(ticks + Math.max(1, length - 12), track, item.channel, note.key)
      }
      ticks += length
    }
  })
  midi.flush()
  return midi.writeMIDI()
}
