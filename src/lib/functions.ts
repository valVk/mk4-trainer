// Harmony (plan step 23): the main triads T, S, D and their inversions, triads on every degree of major and minor
// (D in minor from the harmonic minor), chord symbols with slash chords. Every chord is voiced inside C3-C5, the
// MK4 out of the box. Pure code, no UI text.

import { KEY_INFO, type KeyName } from './scales'
import { buildChord, chordSymbol, diatonicChords, noteName, pitchClass, type ChordTarget, type ChordType } from './theory'
import { keyOf } from './accidentals'

export type FunctionId = 'T' | 'S' | 'D'

/** Scale degree of each function: tonic I, subdominant IV, dominant V. */
export const FUNCTION_DEGREES: Readonly<Record<FunctionId, number>> = { T: 1, S: 4, D: 5 }

/** The lowest and highest keys a chord may use: the MK4 out of the box. */
export const LOW_KEY = 48
export const HIGH_KEY = 72

export interface ChordTask {
  target: ChordTarget
  /** A voicing inside C3-C5, shown as the hint. */
  keys: number[]
  /** «C», «Am», «C/E». */
  symbol: string
}

/** A chord voiced from C3-B3 up, moved down an octave when it would go past C5. */
export function voice(root: PitchClass, type: ChordType, inversion = 0): number[] {
  const keys = buildChord(LOW_KEY + root, type, inversion)
  return Math.max(...keys) > HIGH_KEY && Math.min(...keys) - 12 >= LOW_KEY ? keys.map((key) => key - 12) : keys
}

type PitchClass = number

/** Triads of a key on each degree; minor takes its D (and VII) from the harmonic minor, as musicians do. */
export function keyTriads(key: KeyName): { degree: number, root: PitchClass, type: ChordType }[] {
  const info = KEY_INFO[key]
  const tonic = pitchClass(keyOf(info.tonic))
  return diatonicChords(tonic, info.minor ? 'aeolian' : 'ionian').map((chord) => {
    let type = chord.type ?? 'maj'
    if (info.minor && chord.degree === 5) type = 'maj'
    if (info.minor && chord.degree === 7) return { degree: 7, root: pitchClass(chord.root + 1), type: 'dim' as ChordType }
    return { degree: chord.degree, root: chord.root, type }
  })
}

/** A chord as a task: what to play, a voicing inside the window, its symbol (with the bass after a slash for an inversion). */
export function chordTask(root: PitchClass, type: ChordType, inversion = 0, preferFlats = false): ChordTask {
  const keys = voice(root, type, inversion)
  const symbol = chordSymbol(root, type, preferFlats)
  const bass = inversion ? `/${noteName(pitchClass(keys[0]!), preferFlats)}` : ''
  return { target: { root, type, ...(inversion ? { inversion } : { inversion: 0 }) }, keys, symbol: `${symbol}${bass}` }
}

/** The chord of a function (or a degree) in a key. */
export function degreeChord(key: KeyName, degree: number, inversion = 0): ChordTask {
  const chord = keyTriads(key).find((item) => item.degree === degree)!
  return chordTask(chord.root, chord.type, inversion, KEY_INFO[key].signature < 0)
}

export function functionChord(key: KeyName, fn: FunctionId, inversion = 0): ChordTask {
  return degreeChord(key, FUNCTION_DEGREES[fn], inversion)
}
