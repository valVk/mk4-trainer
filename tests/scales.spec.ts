import { describe, expect, it } from 'vitest'

import { keyOf, spelled } from '@/lib/accidentals'
import { KEYS, KEY_INFO, SCALE_STEPS, parallelKey, relativeKey, resolveKey, scaleKeys, spellScale, transpose } from '@/lib/scales'

const names = (notes: { letter: number, alter: number }[]) => notes.map((item) => `${'CDEFGAB'[item.letter]}${['bb', 'b', '', '#', 'x'][item.alter + 2]}`).join(' ')

describe('scales', () => {
  it('builds major as tone-tone-semitone-tone-tone-tone-semitone', () => {
    expect(scaleKeys(60, 'major')).toEqual([60, 62, 64, 65, 67, 69, 71, 72])
    expect(scaleKeys(57, 'minor')).toEqual([57, 59, 60, 62, 64, 65, 67, 69])
    expect(Object.values(SCALE_STEPS).every((steps) => steps.reduce((sum, step) => sum + step, 0) === 12)).toBe(true)
  })

  it('writes each degree on its own letter', () => {
    expect(names(spellScale(spelled('D4'), 'major'))).toBe('D E F# G A B C# D')
    expect(names(spellScale(spelled('F3'), 'major'))).toBe('F G A Bb C D E F')
    expect(names(spellScale(spelled('A3'), 'harmonicMinor'))).toBe('A B C D E F G# A')
    expect(names(spellScale(spelled('A3'), 'melodicMinor'))).toBe('A B C D E F# G# A')
    expect(names(spellScale(spelled('C4'), 'harmonicMajor'))).toBe('C D E F G Ab B C')
  })

  it('pairs keys by signature (relative) and by tonic (parallel)', () => {
    expect(relativeKey('C')).toBe('Am')
    expect(relativeKey('Em')).toBe('G')
    expect(relativeKey('F')).toBe('Dm')
    expect(parallelKey('D')).toBe('Dm')
    expect(parallelKey('G')).toBeNull()
  })

  it('keeps every taught scale inside the MK4 window C3-C5', () => {
    for (const key of KEYS) {
      const info = KEY_INFO[key]
      const keys = scaleKeys(keyOf(info.tonic), info.minor ? 'minor' : 'major')
      expect(keys[0]).toBeGreaterThanOrEqual(48)
      expect(keys[7]).toBeLessThanOrEqual(72)
    }
  })

  it('resolves unstable degrees to the stable ones next to them', () => {
    const c = scaleKeys(60, 'major')
    expect([resolveKey(c, 2), resolveKey(c, 4), resolveKey(c, 6), resolveKey(c, 7)]).toEqual([60, 64, 67, 72])
  })

  it('moves a melody up', () => {
    expect(transpose([65, 69, 72], 2)).toEqual([67, 71, 74])
  })
})
