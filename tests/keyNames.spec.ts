import { describe, expect, it } from 'vitest'

import { blackKeyNames } from '@/lib/keyNames'

describe('blackKeyNames', () => {
  it('names nothing when nothing is pressed', () => {
    expect(blackKeyNames([]).size).toBe(0)
  })

  it('G names the key above G♯ and the one below G♭', () => {
    const names = blackKeyNames([67])
    expect(names.get(68)).toEqual(['G♯'])
    expect(names.get(66)).toEqual(['G♭'])
    expect(names.size).toBe(2)
  })

  it('C names only C♯: below C is a white key', () => {
    expect([...blackKeyNames([60])]).toEqual([[61, ['C♯']]])
  })

  it('a black key between two pressed white keys gets both names, the sharp first', () => {
    expect(blackKeyNames([67, 65]).get(66)).toEqual(['F♯', 'G♭'])
  })

  it('a pressed black key shows both its names', () => {
    expect(blackKeyNames([61]).get(61)).toEqual(['C♯', 'D♭'])
  })
})
