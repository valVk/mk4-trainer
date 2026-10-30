import { describe, expect, it } from 'vitest'

import { chooseWindow, coversStep, followWindow, octaveHint, parseSongView, stepIndexAt, upcomingKeys } from '@/lib/practice'
import type { Step } from '@/lib/song'

const step = (time: number, ...keys: number[]): Step => ({ time, keys })

describe('chooseWindow', () => {
  it('stays put while all coming keys fit', () => {
    expect(chooseWindow(48, [53, 60, 72])).toBe(48)
    expect(chooseWindow(48, [])).toBe(48)
  })

  it('moves to a C start that holds every coming key', () => {
    expect(chooseWindow(36, [65, 72, 80])).toBe(60)
    expect(chooseWindow(60, [41, 48, 53])).toBe(36)
  })

  it('keeps as many keys as possible when the notes span more than 25 keys', () => {
    // A riff spans F3-G#5 (53-80, 28 keys): one window holds all but the edge.
    const riff = [53, 56, 60, 65, 68, 72, 75, 77, 80, 80, 77]
    const start = chooseWindow(36, riff)
    const inside = riff.filter((key) => key >= start && key < start + 25).length
    // C4 window (60-84) holds 9 of 11 keys; C3 (48-72) would hold only 6.
    expect(start).toBe(60)
    expect(inside).toBe(9)
  })

  it('prefers the window closest to the current one among equals', () => {
    expect(chooseWindow(72, [60, 62])).toBe(60)
    expect(chooseWindow(36, [60, 62])).toBe(48)
  })
})

describe('steps in time', () => {
  const steps = [step(1, 60), step(2, 62), step(2.5, 64, 67), step(4, 65)]

  it('finds the first step at or after a time', () => {
    expect(stepIndexAt(steps, 0)).toBe(0)
    expect(stepIndexAt(steps, 2)).toBe(1)
    expect(stepIndexAt(steps, 2.1)).toBe(2)
    expect(stepIndexAt(steps, 5)).toBe(4)
  })

  it('collects keys within the lookahead', () => {
    expect(upcomingKeys(steps, 1.5, 1.5)).toEqual([62, 64, 67])
  })
})

describe('followWindow', () => {
  // A piano phrase: C5-G#5 from 32 s, then the next phrase goes down to C4 at 40 s.
  const steps = [step(32, 77), step(33, 80), step(34.5, 72), step(36, 79), step(38, 75), step(40, 60), step(41, 63)]

  it('keeps the window while the next notes fit, even when later ones do not', () => {
    expect(followWindow(72, steps, 34.5)).toBe(72)
    expect(followWindow(72, steps, 38)).toBe(72)
  })

  it('moves when a note that is about to come does not fit', () => {
    expect(followWindow(72, steps, 39)).toBe(60)
  })
})

describe('coversStep', () => {
  const chord = step(0, 60, 64, 67)

  it('needs the exact keys in exact mode, extras allowed', () => {
    expect(coversStep(chord, [60, 64, 67], false)).toBe(true)
    expect(coversStep(chord, [60, 64, 67, 72], false)).toBe(true)
    expect(coversStep(chord, [60, 64], false)).toBe(false)
    expect(coversStep(chord, [72, 76, 79], false)).toBe(false)
  })

  it('accepts any octave in «любая октава» mode', () => {
    expect(coversStep(chord, [72, 76, 79], true)).toBe(true)
    expect(coversStep(chord, [48, 64, 79], true)).toBe(true)
    expect(coversStep(chord, [72, 76], true)).toBe(false)
  })
})

describe('octaveHint', () => {
  const riffStep = step(0, 65, 68)

  it('says which way to move when the notes are right but the octave is not', () => {
    expect(octaveHint(riffStep, [77, 80])).toBe('down')
    expect(octaveHint(riffStep, [53, 56])).toBe('up')
  })

  it('stays quiet for the right octave or wrong notes', () => {
    expect(octaveHint(riffStep, [65, 68])).toBeNull()
    expect(octaveHint(riffStep, [66, 69])).toBeNull()
    expect(octaveHint(riffStep, [])).toBeNull()
  })
})

describe('parseSongView', () => {
  it('keeps a known view and falls back to the falling notes', () => {
    expect(parseSongView('staff')).toBe('staff')
    expect(parseSongView('both')).toBe('both')
    expect(parseSongView('cards')).toBe('fall')
    expect(parseSongView(undefined)).toBe('fall')
  })
})
