import { describe, expect, it } from 'vitest'

import { KEYBOARD_KEYS } from '@/lib/keyboard'
import { NOTE_LEVELS, checkNote, currentNoteLevel, isNoteLevelOpen, nextNote, parseNoteProgress } from '@/lib/noteLevels'
import { octaveShift } from '@/lib/staff'

const level = (id: number) => NOTE_LEVELS.find((item) => item.id === id)!
/** The MK4 out of the box: C3 to C5. */
const MK4_START = 48

describe('note levels', () => {
  it('start with any octave, then ask for the very key', () => {
    expect(NOTE_LEVELS.slice(0, 2).every((item) => item.anyOctave)).toBe(true)
    expect(level(3).anyOctave).toBe(false)
  })

  it('fit the 25 keys at C3-C5 until the ledger-line level, which needs the octave buttons', () => {
    for (const item of NOTE_LEVELS.filter((entry) => !entry.anyOctave && entry.id < 7)) {
      expect(item.keys.every((key) => octaveShift(key, MK4_START) === 0)).toBe(true)
    }
    expect(level(7).keys.some((key) => octaveShift(key, MK4_START) !== 0)).toBe(true)
    // One octave press at most: the window can always reach the note.
    expect(level(7).keys.every((key) => Math.abs(octaveShift(key, MK4_START)) <= 1)).toBe(true)
    expect(KEYBOARD_KEYS).toBe(25)
  })

  it('never asks for the same note twice in a row', () => {
    const first = level(3)
    let previous: number | null = null
    for (let i = 0; i < 50; i++) {
      const next = nextNote(first, previous, () => (i * 0.37) % 1)
      expect(next).not.toBe(previous)
      previous = next
    }
  })
})

describe('checking the keys', () => {
  it('praises the key, and on the first levels the same note in any octave', () => {
    expect(checkNote(64, [{ key: 64, time: 0 }], false)).toBe('right')
    expect(checkNote(64, [{ key: 76, time: 0 }], true)).toBe('right')
    expect(checkNote(64, [], true)).toBe('empty')
  })

  it('forgives a neighbour brushed with the right key, not a key pressed later', () => {
    expect(checkNote(64, [{ key: 64, time: 0 }, { key: 65, time: 0.03 }], false)).toBe('right')
    expect(checkNote(64, [{ key: 64, time: 0 }, { key: 65, time: 0.5 }], false)).toBe('wrong')
  })

  it('does not reward pressing many keys at once', () => {
    const mash = [60, 62, 64, 65, 67].map((key) => ({ key, time: 0 }))
    expect(checkNote(64, mash, false)).toBe('wrong')
  })

  it('tells the right note in the wrong octave apart on exact levels', () => {
    expect(checkNote(64, [{ key: 76, time: 0 }], false)).toBe('octave')
    expect(checkNote(64, [{ key: 65, time: 0 }], false)).toBe('wrong')
  })
})

describe('note progress', () => {
  it('opens a level after all stars of the one before', () => {
    expect(isNoteLevelOpen(1, {})).toBe(true)
    expect(isNoteLevelOpen(2, { 1: { correct: 19 } })).toBe(false)
    expect(isNoteLevelOpen(2, { 1: { correct: 20 } })).toBe(true)
    expect(isNoteLevelOpen(99, {})).toBe(false)
    expect(currentNoteLevel({ 1: { correct: 20 }, 2: { correct: 4 } })).toBe(2)
  })

  it('reads saved progress and drops what is broken', () => {
    expect(parseNoteProgress({ 1: { correct: 7.5 }, 2: { correct: -1 }, 99: { correct: 3 }, 3: null })).toEqual({ 1: { correct: 7 } })
    expect(parseNoteProgress('x')).toEqual({})
  })
})
