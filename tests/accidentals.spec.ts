import { describe, expect, it } from 'vitest'

import { barKeys, barVexSpelling, enharmonic, vexInKey, keyOf, spelled, spellings, stepTarget, vexSpelling } from '@/lib/accidentals'

describe('written notes', () => {
  it('finds the key of a note with any accidental', () => {
    expect(['C4', 'C#4', 'Db4', 'Fx4', 'Bbb3', 'E#4', 'Cb5', 'B#3', 'Fb4'].map((text) => keyOf(spelled(text)))).toEqual([60, 61, 61, 67, 57, 65, 71, 60, 64])
  })

  it('writes the note for the staff, the sign only where one is printed', () => {
    expect(vexSpelling(spelled('F#4'))).toEqual({ key: 'f#/4', accidental: '#' })
    expect(vexSpelling(spelled('Bbb3'))).toEqual({ key: 'bbb/3', accidental: 'bb' })
    expect(vexSpelling(spelled('Fx4'))).toEqual({ key: 'f##/4', accidental: '##' })
    expect(vexSpelling(spelled('Fn4'))).toEqual({ key: 'f/4', accidental: 'n' })
    expect(vexSpelling(spelled('F4'))).toEqual({ key: 'f/4', accidental: null })
  })

  it('knows every writing of a key, plainest first', () => {
    const names = (key: number) => spellings(key).map((item) => `${'CDEFGAB'[item.letter]}${['bb', 'b', '', '#', 'x'][item.alter + 2]}${item.octave}`)
    expect(names(61)).toEqual(['C#4', 'Db4', 'Bx3'])
    expect(names(60)).toEqual(['C4', 'B#3', 'Dbb4'])
    expect(names(65)).toEqual(['F4', 'E#4', 'Gbb4'])
  })

  it('tells the same key written two ways', () => {
    expect(enharmonic(spelled('C#4'), spelled('Db4'))).toBe(true)
    expect(enharmonic(spelled('E#4'), spelled('F4'))).toBe(true)
    expect(enharmonic(spelled('C4'), spelled('Cn4'))).toBe(false)
    expect(enharmonic(spelled('C4'), spelled('D4'))).toBe(false)
  })
})

describe('semitones and tones', () => {
  it('steps from a key by a half or whole step', () => {
    expect(stepTarget({ from: 64, semitones: 1, up: true })).toBe(65)
    expect(stepTarget({ from: 60, semitones: 2, up: false })).toBe(58)
  })
})

describe('key signature and signs in a bar', () => {
  const F = 3 as const
  const C = 0 as const
  const B = 6 as const
  const note = (letter: 0 | 1 | 2 | 3 | 4 | 5 | 6, octave: number, sign: 1 | -1 | 'natural' | null = null) => ({ letter, octave, sign })

  it('plays every F as F♯ in G major, in any octave', () => {
    expect(barKeys('G', [note(F, 4), note(F, 5), note(C, 5)])).toEqual([66, 78, 72])
  })

  it('keeps a sign to the end of the bar, for that octave only', () => {
    expect(barKeys('C', [note(C, 4, 1), note(C, 4), note(C, 5)])).toEqual([61, 61, 72])
  })

  it('lets a natural cancel the key signature until the bar ends', () => {
    expect(barKeys('G', [note(F, 4, 'natural'), note(F, 4), note(F, 5)])).toEqual([65, 65, 78])
    expect(barKeys('F', [note(B, 4), note(B, 4, 'natural'), note(B, 4)])).toEqual([70, 71, 71])
  })

  it('writes the bar for the staff: the sounding key, a sign only where printed', () => {
    expect(barVexSpelling('G', [note(F, 4), note(F, 4, 'natural')])).toEqual([{ key: 'f#/4', accidental: null }, { key: 'f/4', accidental: 'n' }])
    expect(barVexSpelling('D', [note(C, 5)])).toEqual([{ key: 'c#/5', accidental: null }])
  })
})

describe('notes under a key signature', () => {
  it('prints a sign only where the note differs from the signature', () => {
    expect(vexInKey(spelled('C#4'), -1)).toEqual({ key: 'c#/4', accidental: '#' })
    expect(vexInKey(spelled('F#4'), 1)).toEqual({ key: 'f#/4', accidental: null })
    expect(vexInKey(spelled('B4'), -1)).toEqual({ key: 'b/4', accidental: 'n' })
    expect(vexInKey(spelled('Bb4'), -1)).toEqual({ key: 'bb/4', accidental: null })
    expect(vexInKey(spelled('G#3'), 0)).toEqual({ key: 'g#/3', accidental: '#' })
  })
})
