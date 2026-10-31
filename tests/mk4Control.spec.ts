import { describe, expect, it } from 'vitest'

import { addTap, knobBpm, resolveAction, tapBpm } from '@/lib/mk4Control'

describe('Tap Tempo', () => {
  it('reads the tempo from the gaps between taps', () => {
    let taps: number[] = []
    for (const at of [0, 500, 1000, 1500]) taps = addTap(taps, at)
    expect(tapBpm(taps)).toBe(120)
  })

  it('forgives one uneven tap, like a child tapping', () => {
    const taps = [0, 600, 1180, 1800]
    expect(tapBpm(taps)).toBe(100)
  })

  it('starts afresh after a long pause, and needs two taps', () => {
    let taps = addTap([0, 500, 1000], 5000)
    expect(taps).toEqual([5000])
    expect(tapBpm(taps)).toBeNull()
    taps = addTap(taps, 5750)
    expect(tapBpm(taps)).toBe(80)
  })

  it('maps the BPM knob across the metronome range', () => {
    expect([knobBpm(0), knobBpm(127)]).toEqual([40, 208])
  })
})

describe('what a control does', () => {
  it('acts on a press, not on letting go', () => {
    expect(resolveAction('playStop', 'cc:1:76', 127, false, {})).toEqual({ action: 'playStop' })
    expect(resolveAction('loop', 'cc:1:74', 0, false, {})).toBeNull()
  })

  it('turns Tap Tempo into the metronome while Shift is held', () => {
    expect(resolveAction('tapTempo', 'cc:1:82', 127, false, {})).toEqual({ action: 'tapTempo' })
    expect(resolveAction('tapTempo', 'cc:1:82', 127, true, {})).toEqual({ action: 'metronome' })
  })

  it('moves along the screen with the display knob, and presses with it', () => {
    expect(resolveAction('displayKnob', 'cc:1:14', 1, false, {})).toEqual({ action: 'next', value: 1 })
    expect(resolveAction('displayKnob', 'cc:1:14', 127, false, {})).toEqual({ action: 'previous', value: -1 })
    expect(resolveAction('displayKnob', 'cc:1:13', 127, false, {})).toEqual({ action: 'select' })
  })

  it('passes a knob value on, and follows the owner\'s choice over the default', () => {
    expect(resolveAction('knob8', 'cc:1:31', 64, false, {})).toEqual({ action: 'tempo', value: 64 })
    expect(resolveAction('loop', 'cc:1:74', 127, false, { loop: 'next' })).toEqual({ action: 'next' })
    expect(resolveAction('loop', 'cc:1:74', 127, false, { loop: 'none' })).toBeNull()
    expect(resolveAction('shift', 'cc:1:17', 127, false, {})).toBeNull()
  })
})
