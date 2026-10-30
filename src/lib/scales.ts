// Scales and keys (plan step 22): the steps of major and minor, keys by their signatures, stable degrees and where
// the unstable ones resolve, and moving a melody up. Pure code, no UI text.

import { keyOf, type Alter, type Letter, type Spelled } from './accidentals'

export type ScaleKind = 'major' | 'minor' | 'harmonicMinor' | 'melodicMinor' | 'harmonicMajor'

/** Semitones between the degrees, going up: major is Т-Т-П-Т-Т-Т-П. */
export const SCALE_STEPS: Readonly<Record<ScaleKind, readonly number[]>> = {
  major: [2, 2, 1, 2, 2, 2, 1],
  minor: [2, 1, 2, 2, 1, 2, 2],
  harmonicMinor: [2, 1, 2, 2, 1, 3, 1],
  melodicMinor: [2, 1, 2, 2, 2, 2, 1],
  harmonicMajor: [2, 2, 1, 2, 1, 3, 1],
}

/** The eight keys of a scale, one octave up from the tonic. */
export function scaleKeys(tonic: number, kind: ScaleKind): number[] {
  const keys = [tonic]
  for (const step of SCALE_STEPS[kind]) keys.push(keys[keys.length - 1]! + step)
  return keys
}

/** The scale written with one letter per degree: D major has F♯ and C♯, never G♭ or D♭. */
export function spellScale(tonic: Spelled, kind: ScaleKind): Spelled[] {
  const keys = scaleKeys(keyOf(tonic), kind)
  return keys.map((key, degree) => {
    const letter = ((tonic.letter + degree) % 7) as Letter
    const octave = tonic.octave + Math.floor((tonic.letter + degree) / 7)
    return { letter, octave, alter: (key - keyOf({ letter, octave, alter: 0 })) as Alter }
  })
}

/** Keys taught, by their signature: sharps positive, flats negative. Each major has its relative minor a minor third lower. */
export const KEYS = ['C', 'G', 'D', 'F', 'Am', 'Em', 'Bm', 'Dm'] as const
export type KeyName = typeof KEYS[number]

export interface KeyInfo {
  name: KeyName
  /** Sharps (positive) or flats (negative) at the clef. */
  signature: number
  minor: boolean
  /** Tonic as a written note, low enough that the scale ends by C5 (the MK4 out of the box: C3-C5). */
  tonic: Spelled
}

const note = (letter: Letter, octave: number, alter: Alter = 0): Spelled => ({ letter, octave, alter })

export const KEY_INFO: Readonly<Record<KeyName, KeyInfo>> = {
  C: { name: 'C', signature: 0, minor: false, tonic: note(0, 4) },
  G: { name: 'G', signature: 1, minor: false, tonic: note(4, 3) },
  D: { name: 'D', signature: 2, minor: false, tonic: note(1, 3) },
  F: { name: 'F', signature: -1, minor: false, tonic: note(3, 3) },
  Am: { name: 'Am', signature: 0, minor: true, tonic: note(5, 3) },
  Em: { name: 'Em', signature: 1, minor: true, tonic: note(2, 3) },
  Bm: { name: 'Bm', signature: 2, minor: true, tonic: note(6, 3) },
  Dm: { name: 'Dm', signature: -1, minor: true, tonic: note(1, 3) },
}

/** Same signature, the other mode: C major and A minor. */
export function relativeKey(name: KeyName): KeyName | null {
  const info = KEY_INFO[name]
  return KEYS.find((other) => other !== name && KEY_INFO[other].signature === info.signature) ?? null
}

/** Same tonic, the other mode: C major and C minor (only among the keys taught). */
export function parallelKey(name: KeyName): KeyName | null {
  const info = KEY_INFO[name]
  const pc = keyOf(info.tonic) % 12
  return KEYS.find((other) => other !== name && keyOf(KEY_INFO[other].tonic) % 12 === pc) ?? null
}

/** Stable degrees: I, III, V (1, 3, 5). */
export const STABLE_DEGREES = [1, 3, 5] as const

/** Where an unstable degree pulls: II→I, IV→III, VI→V, VII→I (the one above). */
export const RESOLUTION: Readonly<Record<number, number>> = { 2: 1, 4: 3, 6: 5, 7: 8 }

/** The key a degree of the scale resolves to, from the key of the degree itself. */
export function resolveKey(scale: readonly number[], degree: number): number {
  return scale[RESOLUTION[degree]! - 1]!
}

/** A melody moved by some semitones: the same tune, every key shifted. */
export function transpose(keys: readonly number[], semitones: number): number[] {
  return keys.map((key) => key + semitones)
}
