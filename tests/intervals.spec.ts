import { describe, expect, it } from 'vitest'

import { spelled } from '@/lib/accidentals'
import { INTERVALS, interval, intervalBetween, qualityOf } from '@/lib/intervals'

describe('intervals', () => {
  it('knows the simple intervals by semitones, the unison to the octave', () => {
    expect(INTERVALS.map((item) => `${item.id}:${item.semitones}`)).toEqual([
      'P1:0', 'm2:1', 'M2:2', 'm3:3', 'M3:4', 'P4:5', 'A4:6', 'd5:6', 'P5:7', 'm6:8', 'M6:9', 'm7:10', 'M7:11', 'P8:12',
    ])
    // Every one fits the 25 keys of the MK4 from any key of the lower octave.
    expect(Math.max(...INTERVALS.map((item) => item.semitones))).toBeLessThan(13)
  })

  it('gives the quality from the size and the semitones', () => {
    expect([qualityOf(5, 7), qualityOf(3, 3), qualityOf(3, 4), qualityOf(4, 6), qualityOf(5, 6), qualityOf(9, 14)]).toEqual(['perfect', 'minor', 'major', 'augmented', 'diminished', null])
  })

  it('names the interval between two written notes, letters first', () => {
    expect(intervalBetween(spelled('C4'), spelled('E4'))?.id).toBe('M3')
    expect(intervalBetween(spelled('D4'), spelled('F#4'))?.id).toBe('M3')
    expect(intervalBetween(spelled('E4'), spelled('G4'))?.id).toBe('m3')
    expect(intervalBetween(spelled('F4'), spelled('B4'))?.id).toBe('A4')
    expect(intervalBetween(spelled('B4'), spelled('F5'))?.id).toBe('d5')
    expect(intervalBetween(spelled('C4'), spelled('C5'))?.id).toBe('P8')
    // The same keys written another way are another interval.
    expect(intervalBetween(spelled('D4'), spelled('Gb4'))).toBeNull()
  })

  it('finds an interval by id', () => {
    expect(interval('P5')).toEqual({ id: 'P5', steps: 5, semitones: 7, quality: 'perfect' })
  })
})
