import { describe, expect, it } from 'vitest'

import { drumKind, padLayout, padSteps } from '@/lib/padLayout'
import { buildSteps, type SongNote } from '@/lib/song'

const note = (key: number, start: number): SongNote => ({ key, start, length: 0.2, velocity: 100 })
const notesOf = (spec: Record<number, number>) =>
  Object.entries(spec).flatMap(([key, count]) => Array.from({ length: count }, (_, i) => note(Number(key), i)))

describe('padLayout', () => {
  it('puts melodic notes on pads from low to high', () => {
    // A bass line: F1, A#1, C#2.
    const layout = padLayout({ isDrum: false, notes: notesOf({ 37: 96, 29: 539, 34: 96 }) })!
    expect(layout.padKeys).toEqual([29, 34, 37, null, null, null, null, null])
    expect(layout.padOf.get(37)).toBe(3)
  })

  it('places drums where a drummer expects them', () => {
    // A drum part: kick 35, closed hat 42, open hat 46, snare 40, crash 57.
    const layout = padLayout({ isDrum: true, notes: notesOf({ 35: 826, 42: 554, 46: 535, 40: 74, 57: 58 }) })!
    expect(layout.padKeys).toEqual([35, 40, 42, 46, 57, null, null, null])
  })

  it('moves a second sound of the same kind to a free pad', () => {
    const layout = padLayout({ isDrum: true, notes: notesOf({ 36: 10, 35: 5, 38: 8, 82: 3 }) })!
    expect(layout.padOf.get(36)).toBe(1)
    expect(layout.padOf.get(38)).toBe(2)
    expect([layout.padOf.get(35), layout.padOf.get(82)].sort()).toEqual([3, 4])
  })

  it('refuses parts with more than 8 different notes', () => {
    expect(padLayout({ isDrum: false, notes: notesOf({ 60: 1, 61: 1, 62: 1, 63: 1, 64: 1, 65: 1, 66: 1, 67: 1, 68: 1 }) })).toBeNull()
    expect(padLayout({ isDrum: false, notes: [] })).toBeNull()
  })
})

describe('drumKind and padSteps', () => {
  it('names common GM drums', () => {
    expect([36, 38, 42, 46, 49, 51, 45, 99].map(drumKind)).toEqual(['kick', 'snare', 'hihatClosed', 'hihatOpen', 'crash', 'ride', 'tom', 'other'])
  })

  it('turns steps into pads hit together', () => {
    const layout = padLayout({ isDrum: true, notes: notesOf({ 35: 2, 42: 2 }) })!
    const steps = buildSteps([note(35, 0), note(42, 0), note(42, 0.5)])
    expect(padSteps(steps, layout)).toEqual([{ time: 0, pads: [1, 3] }, { time: 0.5, pads: [3] }])
  })
})
