import { describe, expect, it } from 'vitest'

import { enharmonic, keyOf, spelled, spellings, stepTarget, vexSpelling } from '@/lib/accidentals'

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
