// «Цепочка по кругу» (plan step 23, owner's addition from the video «Делай ЭТО каждый день!»): four triads around
// the circle of fifths — a minor one from the inner ring, its neighbour counter-clockwise, the major one step
// clockwise from where it started, and that major's neighbour counter-clockwise: VI–II–V–I of a key
// (Am → Dm → G → C). All in one fixed window C3–C5: the bass in C3–B3, the right hand's fifth above it and its
// third an octave above the fifth; where that would pass C5, third and fifth close above the bass. Pure code.

import { HIGH_KEY, LOW_KEY } from './functions'
import type { ChordType } from './theory'

/** Positions on the circle, clockwise from C at the top. */
export const CIRCLE_SIZE = 12
/** Major key at each position, written with sharps or with flats. */
const MAJOR_SHARP = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'] as const
const MAJOR_FLAT = ['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F'] as const
/** Relative minor at each position (inner ring). */
const MINOR_SHARP = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F', 'C', 'G', 'D'] as const
const MINOR_FLAT = ['A', 'E', 'B', 'F#', 'C#', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D'] as const
/** Pitch class of the major key at each position (a fifth apart). */
const MAJOR_PC = Array.from({ length: CIRCLE_SIZE }, (_, i) => (i * 7) % 12)

export interface CircleChord {
  /** «Am», «G», «Ebm». */
  name: string
  minor: boolean
  /** Position on the circle (its ring is given by `minor`). */
  position: number
  root: number
  type: ChordType
  /** Keys inside C3-C5: bass, then the right hand (lower note first). */
  keys: number[]
  /** Which keys are the root, third and fifth (same order as `keys`). */
  roles: ('root' | 'third' | 'fifth')[]
}

const wrap = (position: number) => ((position % CIRCLE_SIZE) + CIRCLE_SIZE) % CIRCLE_SIZE

/** The flat side of the circle (positions 6-10, from E♭ minor and G♭ major) is written with flats. */
function flatSide(start: number): boolean {
  return start >= 6 && start <= 10
}

function chordAt(position: number, minor: boolean, flats: boolean): CircleChord {
  const pc = minor ? (MAJOR_PC[position]! + 9) % 12 : MAJOR_PC[position]!
  const letter = minor ? (flats ? MINOR_FLAT : MINOR_SHARP)[position]! : (flats ? MAJOR_FLAT : MAJOR_SHARP)[position]!
  const third = minor ? 3 : 4
  const root = LOW_KEY + pc
  // Third an octave above the fifth when it fits under C5; otherwise third and fifth close above the bass.
  const spread = root + third + 12 <= HIGH_KEY
  const keys = spread ? [root, root + 7, root + third + 12] : [root, root + third, root + 7]
  const roles: CircleChord['roles'] = spread ? ['root', 'fifth', 'third'] : ['root', 'third', 'fifth']
  return { name: `${letter}${minor ? 'm' : ''}`, minor, position, root: pc, type: minor ? 'min' : 'maj', keys, roles }
}

/** The chain that starts on the minor chord at a position of the inner ring. */
export function circleChain(start: number): CircleChord[] {
  const flats = flatSide(start)
  return [chordAt(wrap(start), true, flats), chordAt(wrap(start - 1), true, flats), chordAt(wrap(start + 1), false, flats), chordAt(wrap(start), false, flats)]
}

/** All twelve chains, from A minor round the inner ring. */
export const ALL_CHAINS: readonly CircleChord[][] = Array.from({ length: CIRCLE_SIZE }, (_, i) => circleChain(i))
