import { describe, expect, it } from 'vitest'

import {
  CHORD_FORMULAS,
  CHORD_TYPES,
  buildChord,
  checkChord,
  chordSymbol,
  diatonicChords,
  identifyChord,
  intervalsBetween,
  midiName,
  noteName,
  parentMajor,
  prefersFlats,
  progressionChords,
  romanNumeral,
  scale,
} from '@/lib/theory'

const C4 = 60
const ROOTS = Array.from({ length: 12 }, (_, i) => C4 + i)

describe('names', () => {
  it('names pitch classes with sharps or flats', () => {
    expect(noteName(1)).toBe('C#')
    expect(noteName(1, true)).toBe('Db')
    expect(noteName(-1)).toBe('B')
  })

  it('names MIDI notes with octave, C4 = 60', () => {
    expect(midiName(60)).toBe('C4')
    expect(midiName(69)).toBe('A4')
    expect(midiName(59)).toBe('B3')
  })

  it('builds chord symbols', () => {
    expect(chordSymbol(0, 'maj')).toBe('C')
    expect(chordSymbol(6, 'min')).toBe('F#m')
    expect(chordSymbol(10, '7', true)).toBe('Bb7')
  })
})

describe('buildChord', () => {
  it('builds root position from the formula', () => {
    expect(buildChord(C4, 'maj')).toEqual([60, 64, 67])
    expect(buildChord(C4, 'min')).toEqual([60, 63, 67])
    expect(buildChord(C4, 'm7')).toEqual([60, 63, 67, 70])
  })

  it('moves the lowest note up an octave per inversion', () => {
    expect(buildChord(C4, 'maj', 1)).toEqual([64, 67, 72])
    expect(buildChord(C4, 'maj', 2)).toEqual([67, 72, 76])
    expect(buildChord(C4, '7', 3)).toEqual([70, 72, 76, 79])
  })

  it('rejects inversions the chord does not have', () => {
    expect(() => buildChord(C4, 'maj', 3)).toThrow(RangeError)
    expect(() => buildChord(C4, 'maj', -1)).toThrow(RangeError)
  })
})

describe('intervalsBetween', () => {
  it('shows major as 4 + 3 and minor as 3 + 4', () => {
    expect(intervalsBetween(buildChord(C4, 'maj'))).toEqual([4, 3])
    expect(intervalsBetween(buildChord(C4, 'min'))).toEqual([3, 4])
  })

  it('ignores order and repeated notes', () => {
    expect(intervalsBetween([67, 60, 64, 64])).toEqual([4, 3])
  })
})

describe('identifyChord', () => {
  it.each(CHORD_TYPES)('recognises %s from all 12 roots', (type) => {
    for (const root of ROOTS) {
      const matches = identifyChord(buildChord(root, type))
      expect(matches).toContainEqual({ root: root % 12, type, inversion: 0, bass: root % 12 })
    }
  })

  it.each(CHORD_TYPES)('recognises every inversion of %s as the same chord', (type) => {
    for (const root of ROOTS) {
      for (let inversion = 0; inversion < CHORD_FORMULAS[type].length; inversion++) {
        const notes = buildChord(root, type, inversion)
        const matches = identifyChord(notes)
        expect(matches).toContainEqual(expect.objectContaining({ root: root % 12, type, inversion }))
      }
    }
  })

  it('puts the unambiguous reading first', () => {
    expect(identifyChord([64, 67, 72])).toEqual([{ root: 0, type: 'maj', inversion: 1, bass: 4 }])
  })

  it('returns every reading for C6 / Am7, root position first', () => {
    const matches = identifyChord([60, 64, 67, 69])
    expect(matches).toHaveLength(2)
    expect(matches[0]).toEqual({ root: 0, type: '6', inversion: 0, bass: 0 })
    expect(matches[1]).toEqual({ root: 9, type: 'm7', inversion: 1, bass: 0 })
  })

  it('returns every reading for Csus2 / Gsus4', () => {
    const matches = identifyChord([60, 62, 67])
    expect(matches).toContainEqual({ root: 0, type: 'sus2', inversion: 0, bass: 0 })
    expect(matches).toContainEqual({ root: 7, type: 'sus4', inversion: 1, bass: 0 })
  })

  it('is not confused by octave doublings', () => {
    expect(identifyChord([48, 60, 64, 67, 72])).toEqual([{ root: 0, type: 'maj', inversion: 0, bass: 0 }])
  })

  it('returns nothing for empty input or unknown sets', () => {
    expect(identifyChord([])).toEqual([])
    expect(identifyChord([60, 61, 62])).toEqual([])
    expect(identifyChord([60])).toEqual([])
  })
})

describe('checkChord', () => {
  const cMajor = { root: 0, type: 'maj' } as const

  it('accepts any octave and voicing by default', () => {
    expect(checkChord([64, 67, 72], cMajor)).toEqual({ status: 'correct', missing: [], extra: [] })
    expect(checkChord([48, 64, 67, 72], cMajor).status).toBe('correct')
  })

  it('reports missing, extra and wrong notes as codes', () => {
    expect(checkChord([], cMajor)).toEqual({ status: 'empty', missing: [], extra: [] })
    expect(checkChord([60, 64], cMajor)).toEqual({ status: 'incomplete', missing: [7], extra: [] })
    expect(checkChord([60, 64, 67, 69], cMajor)).toEqual({ status: 'extra', missing: [], extra: [9] })
    expect(checkChord([60, 63, 67], cMajor)).toEqual({ status: 'wrong', missing: [4], extra: [3] })
  })

  it('checks the bass in strict inversion mode', () => {
    expect(checkChord([64, 67, 72], { ...cMajor, inversion: 1 }).status).toBe('correct')
    expect(checkChord([60, 64, 67], { ...cMajor, inversion: 1 }).status).toBe('wrongInversion')
  })
})

describe('scales and modes', () => {
  it('builds C major', () => {
    expect(scale(0)).toEqual([0, 2, 4, 5, 7, 9, 11])
  })

  it('builds modes as rotations of the major scale', () => {
    expect(scale(9, 'aeolian')).toEqual([9, 11, 0, 2, 4, 5, 7])
    expect(scale(2, 'dorian')).toEqual([2, 4, 5, 7, 9, 11, 0])
    expect(scale(5, 'lydian')).toEqual([5, 7, 9, 11, 0, 2, 4])
  })

  it('finds the parent major key and spelling', () => {
    expect(parentMajor(2, 'dorian')).toBe(0)
    expect(parentMajor(9, 'aeolian')).toBe(0)
    expect(parentMajor(3, 'dorian')).toBe(1)
    expect(prefersFlats(3, 'dorian')).toBe(true)
    expect(prefersFlats(7)).toBe(false)
    expect(prefersFlats(5)).toBe(true)
  })
})

describe('diatonic chords', () => {
  it('derives triad qualities in major', () => {
    const chords = diatonicChords(0)
    expect(chords.map((c) => c.type)).toEqual(['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'])
    expect(chords.map((c) => c.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'])
  })

  it('derives triad qualities in natural minor', () => {
    expect(diatonicChords(9, 'aeolian').map((c) => c.type)).toEqual(['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'])
  })

  it('derives seventh chords, the half-diminished one on VII included', () => {
    const chords = diatonicChords(0, 'ionian', 4)
    expect(chords.map((c) => c.type)).toEqual(['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'])
    expect(chords.map((c) => c.roman)).toEqual(['Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7'])
  })

  it('resolves I-V-vi-IV in G major', () => {
    const chords = progressionChords(7, 'ionian', [1, 5, 6, 4])
    expect(chords.map((c) => chordSymbol(c.root, c.type ?? 'maj'))).toEqual(['G', 'D', 'Em', 'C'])
  })

  it('rejects degrees out of range', () => {
    expect(() => romanNumeral(8, 'maj')).toThrow(RangeError)
    expect(() => progressionChords(0, 'ionian', [0])).toThrow(RangeError)
  })
})
