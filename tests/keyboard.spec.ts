import { describe, expect, it } from 'vitest'

import { KEYBOARD_KEYS, followRange, isBlackKey, keyboardKeys, rangeStartFor } from '@/lib/keyboard'

describe('keyboard geometry', () => {
  it('has the MK4 layout: 25 keys, 15 white and 10 black from C', () => {
    const keys = keyboardKeys(48)
    expect(keys).toHaveLength(KEYBOARD_KEYS)
    expect(keys.filter((key) => !key.black)).toHaveLength(15)
    expect(keys.filter((key) => key.black)).toHaveLength(10)
    expect(keys[keys.length - 1]?.note).toBe(72)
  })

  it('marks black keys', () => {
    expect([60, 61, 62, 63, 64, 65, 66].map(isBlackKey)).toEqual([false, true, false, true, false, false, true])
  })

  it('places black keys at the boundary before the next white key', () => {
    const keys = keyboardKeys(60, 3)
    expect(keys).toEqual([
      { note: 60, black: false, whiteIndex: 0 },
      { note: 61, black: true, whiteIndex: 1 },
      { note: 62, black: false, whiteIndex: 1 },
    ])
  })
})

describe('range start', () => {
  it('snaps down to C', () => {
    expect(rangeStartFor(64)).toBe(60)
    expect(rangeStartFor(60)).toBe(60)
    expect(rangeStartFor(59)).toBe(48)
  })

  it('stays inside the MIDI range', () => {
    expect(rangeStartFor(-5)).toBe(0)
    expect(rangeStartFor(127)).toBe(96)
  })
})

describe('followRange', () => {
  it('stays put while all held notes fit', () => {
    expect(followRange(48, [60, 64, 67])).toBe(48)
    expect(followRange(48, [48, 72])).toBe(48)
    expect(followRange(48, [])).toBe(48)
  })

  it('moves to the C below the lowest note when a note falls outside', () => {
    expect(followRange(48, [76])).toBe(72)
    expect(followRange(60, [55, 59])).toBe(48)
  })
})
