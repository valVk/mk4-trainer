import { describe, expect, it } from 'vitest'

import { MIX_MAX, clampGain, gainOf, parseMix, withGain } from '@/lib/mix'

describe('song mix', () => {
  it('plays untouched parts at the file level', () => {
    expect(gainOf(undefined, 3)).toBe(1)
    expect(gainOf({ 2: 0.4 }, 3)).toBe(1)
    expect(gainOf({ 2: 0.4 }, 2)).toBe(0.4)
  })

  it('keeps gains in range and on 5% steps', () => {
    expect(clampGain(0.433)).toBe(0.45)
    expect(clampGain(9)).toBe(MIX_MAX)
    expect(clampGain(-1)).toBe(0)
    expect(clampGain(Number.NaN)).toBe(1)
  })

  it('stores only the parts that were changed', () => {
    const quieterPad = withGain({}, 2, 0.4)
    expect(quieterPad).toEqual({ 2: 0.4 })
    expect(withGain(quieterPad, 2, 1)).toEqual({})
    expect(withGain(quieterPad, 0, 1.3)).toEqual({ 2: 0.4, 0: 1.3 })
  })

  it('reads a stored mix and drops anything broken', () => {
    expect(parseMix({ 0: 1.3, 2: 0.4, 5: 1, 20: 0.5, x: 0.2, 3: 'loud' })).toEqual({ 0: 1.3, 2: 0.4 })
    expect(parseMix(null)).toEqual({})
    expect(parseMix([0.5])).toEqual({})
  })
})
