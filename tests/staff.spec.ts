import { describe, expect, it } from 'vitest'

import { clefOf, octaveName, octaveShift, octaveSign, staffPlace, windowOctaves } from '@/lib/staff'

describe('octaves', () => {
  it('names the octaves of the piano, middle C in «первая»', () => {
    expect(octaveName(60)).toBe('first')
    expect(octaveName(59)).toBe('small')
    expect(octaveName(48)).toBe('small')
    expect(octaveName(36)).toBe('great')
    expect(octaveName(24)).toBe('contra')
    expect(octaveName(21)).toBe('subContra')
    expect(octaveName(108)).toBe('fifth')
  })

  it('tells which octaves the 25 keys hold now', () => {
    // The MK4 out of the box: C3 to C5, «малая и первая».
    expect(windowOctaves(48)).toEqual(['small', 'first'])
    expect(windowOctaves(60)).toEqual(['first', 'second'])
  })

  it('counts the octave buttons a note needs', () => {
    expect(octaveShift(60, 48)).toBe(0)
    expect(octaveShift(72, 48)).toBe(0)
    expect(octaveShift(73, 48)).toBe(1)
    expect(octaveShift(84, 48)).toBe(1)
    expect(octaveShift(85, 48)).toBe(2)
    expect(octaveShift(47, 48)).toBe(-1)
    expect(octaveShift(36, 48)).toBe(-1)
    expect(octaveShift(35, 48)).toBe(-2)
  })
})

describe('the place of a note on the staff', () => {
  it('finds the landmarks of the treble clef', () => {
    // Соль on the 2nd line, до on the 1st ledger line below, соль above the 5th line.
    expect(staffPlace(67, 'treble')).toMatchObject({ step: 2, onLine: true, ledgers: 0 })
    expect(staffPlace(60, 'treble')).toMatchObject({ step: -2, onLine: true, ledgers: -1 })
    expect(staffPlace(79, 'treble')).toMatchObject({ step: 9, onLine: false, ledgers: 0 })
  })

  it('finds the landmarks of the bass clef', () => {
    // Фа on the 4th line, фа under the 1st, до on the 1st ledger line above.
    expect(staffPlace(53, 'bass')).toMatchObject({ step: 6, onLine: true, ledgers: 0 })
    expect(staffPlace(41, 'bass')).toMatchObject({ step: -1, onLine: false, ledgers: 0 })
    expect(staffPlace(60, 'bass')).toMatchObject({ step: 10, onLine: true, ledgers: 1 })
  })

  it('counts ledger lines, and spaces between them need none of their own', () => {
    expect(staffPlace(59, 'treble').ledgers).toBe(-1)
    expect(staffPlace(57, 'treble').ledgers).toBe(-2)
    expect(staffPlace(81, 'treble').ledgers).toBe(1)
    expect(staffPlace(83, 'treble').ledgers).toBe(1)
    expect(staffPlace(84, 'treble').ledgers).toBe(2)
  })

  it('writes a black key on the place of the white key below, with a sharp', () => {
    expect(staffPlace(61, 'treble')).toMatchObject({ step: -2, sharp: true })
    expect(staffPlace(66, 'treble')).toMatchObject({ step: 1, sharp: true })
  })

  it('uses 8va and 15ma instead of too many ledger lines', () => {
    expect(octaveSign(84, 'treble')).toBeNull()
    expect(octaveSign(91, 'treble')).toBe('8va')
    expect(octaveSign(103, 'treble')).toBe('15ma')
    expect(octaveSign(28, 'bass')).toBe('8vb')
    expect(octaveSign(40, 'bass')).toBeNull()
  })

  it('reads middle C and up in the treble clef', () => {
    expect([clefOf(60), clefOf(59)]).toEqual(['treble', 'bass'])
  })
})
