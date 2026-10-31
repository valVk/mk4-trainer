import { describe, expect, it } from 'vitest'

import { ALL_CHAINS, circleChain } from '@/lib/circle'
import { HIGH_KEY, LOW_KEY, degreeChord, functionChord, keyTriads } from '@/lib/functions'
import { checkChord } from '@/lib/theory'

describe('functions T, S, D', () => {
  it('builds the main triads of a key', () => {
    expect(['T', 'S', 'D'].map((fn) => functionChord('C', fn as 'T' | 'S' | 'D').symbol)).toEqual(['C', 'F', 'G'])
    expect(['T', 'S', 'D'].map((fn) => functionChord('G', fn as 'T' | 'S' | 'D').symbol)).toEqual(['G', 'C', 'D'])
    // D in minor is major: from the harmonic minor.
    expect(['T', 'S', 'D'].map((fn) => functionChord('Am', fn as 'T' | 'S' | 'D').symbol)).toEqual(['Am', 'Dm', 'E'])
  })

  it('knows the triads on every degree', () => {
    expect(keyTriads('C').map((chord) => chord.type)).toEqual(['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'])
    expect(keyTriads('Am').map((chord) => chord.type)).toEqual(['min', 'dim', 'maj', 'min', 'maj', 'maj', 'dim'])
  })

  it('writes inversions as slash chords, the bass after the slash', () => {
    expect(functionChord('C', 'T', 1).symbol).toBe('C/E')
    expect(functionChord('C', 'D', 2).symbol).toBe('G/D')
    expect(degreeChord('F', 4).symbol).toBe('Bb')
  })

  it('voices every chord of every key inside C3-C5, and its own voicing passes the check', () => {
    for (const key of ['C', 'G', 'D', 'F', 'Am', 'Em', 'Bm', 'Dm'] as const) {
      for (let degree = 1; degree <= 7; degree++) {
        for (const inversion of [0, 1, 2]) {
          const chord = degreeChord(key, degree, inversion)
          expect(Math.min(...chord.keys)).toBeGreaterThanOrEqual(LOW_KEY)
          expect(Math.max(...chord.keys)).toBeLessThanOrEqual(HIGH_KEY)
          expect(checkChord(chord.keys, chord.target).status).toBe('correct')
        }
      }
    }
  })
})

describe('«Цепочка по кругу»', () => {
  it('goes VI-II-V-I from A minor and E-flat minor, with the owner\'s spelling', () => {
    expect(circleChain(0).map((chord) => chord.name)).toEqual(['Am', 'Dm', 'G', 'C'])
    expect(circleChain(6).map((chord) => chord.name)).toEqual(['Ebm', 'Abm', 'Db', 'Gb'])
    expect(circleChain(4).map((chord) => chord.name)).toEqual(['C#m', 'F#m', 'B', 'E'])
  })

  it('puts the bass low and the third an octave above the fifth (Am: A3 + E4/C5)', () => {
    expect(circleChain(0)[0]!.keys).toEqual([57, 64, 72])
    expect(circleChain(0)[0]!.roles).toEqual(['root', 'fifth', 'third'])
  })

  it('closes up where the spread voicing would pass C5 (A, B-flat, B-flat minor, B, B minor)', () => {
    const close = ALL_CHAINS.flat().filter((chord) => chord.roles[1] === 'third').map((chord) => chord.name)
    expect(new Set(close)).toEqual(new Set(['A', 'Bb', 'Bbm', 'B', 'Bm']))
  })

  it('keeps every note of all twelve chains inside C3-C5, bass in C3-B3', () => {
    for (const chord of ALL_CHAINS.flat()) {
      expect(Math.min(...chord.keys)).toBeGreaterThanOrEqual(LOW_KEY)
      expect(Math.max(...chord.keys)).toBeLessThanOrEqual(HIGH_KEY)
      expect(chord.keys[0]!).toBeLessThan(60)
      expect(checkChord(chord.keys, { root: chord.root, type: chord.type, inversion: 0 }).status).toBe('correct')
    }
  })
})
