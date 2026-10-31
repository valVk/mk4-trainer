import { describe, expect, it } from 'vitest'

import { MK4_PANEL, controlFor, parsePanelSettings } from '@/lib/mk4Layout'

const PADS = { channel: 10, notes: [36, 37, 38, 39, 40, 41, 42, 43] }

describe('the MK4 panel', () => {
  it('has every control of the box once: 25 keys, 8 pads, 8 knobs, the transport', () => {
    const ids = MK4_PANEL.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(MK4_PANEL.filter((item) => item.key !== undefined)).toHaveLength(25)
    expect(MK4_PANEL.filter((item) => item.pad !== undefined)).toHaveLength(8)
    expect(MK4_PANEL.filter((item) => item.id.startsWith('knob'))).toHaveLength(8)
    expect(ids).toEqual(expect.arrayContaining(['octDown', 'octUp', 'tapTempo', 'playStop', 'loop', 'record', 'undo', 'shift']))
  })

  it('stays inside the drawing', () => {
    for (const item of MK4_PANEL) {
      expect(item.x).toBeGreaterThanOrEqual(0)
      expect(item.x + item.w).toBeLessThanOrEqual(1000)
      expect(item.y + item.h).toBeLessThanOrEqual(420)
    }
  })

  it('finds keys from the window, pads by the pad map, the rest by learning', () => {
    expect(controlFor('note:1:48', {}, 48, PADS)).toBe('key0')
    expect(controlFor('note:1:72', {}, 48, PADS)).toBe('key24')
    expect(controlFor('note:1:73', {}, 48, PADS)).toBeNull()
    expect(controlFor('note:10:38', {}, 48, PADS)).toBe('pad3')
    expect(controlFor('cc:1:70', { knob1: 'cc:1:70' }, 48, PADS)).toBe('knob1')
    expect(controlFor('cc:1:71', { knob1: 'cc:1:70' }, 48, PADS)).toBeNull()
  })
})

describe('panel settings', () => {
  it('keeps known controls and actions, drops the rest', () => {
    expect(parsePanelSettings({ learnt: { knob1: 'cc:1:70', nope: 'x', knob2: 5 }, actions: { knob1: 'tempo', loop: 'jump' } })).toEqual({ learnt: { knob1: 'cc:1:70' }, actions: { knob1: 'tempo' } })
    expect(parsePanelSettings(null)).toEqual({ learnt: {}, actions: {} })
  })
})

describe('what the MK4 sends out of the box', () => {
  it('knows the recorded controls without teaching', () => {
    expect(controlFor('cc:1:82', {}, 48, PADS)).toBe('tapTempo')
    expect(controlFor('cc:1:76', {}, 48, PADS)).toBe('playStop')
    expect(controlFor('cc:1:14', {}, 48, PADS)).toBe('displayKnob')
    expect(controlFor('cc:1:31', {}, 48, PADS)).toBe('knob8')
    // A control the owner taught wins.
    expect(controlFor('cc:1:76', { record: 'cc:1:76' }, 48, PADS)).toBe('record')
  })
})
