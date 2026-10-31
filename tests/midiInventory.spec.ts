import { describe, expect, it } from 'vitest'

import { addMessage, clockTempo, controlOf, inventoryJson, inventorySummary, type Inventory } from '@/lib/midiInventory'

const PADS = { channel: 10, notes: [36, 37, 38, 39, 40, 41, 42, 43] }

describe('what a message is', () => {
  it('tells keys from pads by the pad map', () => {
    expect(controlOf([0x90, 60, 100], PADS)).toMatchObject({ id: 'note:1:60', kind: 'key', value: 100 })
    expect(controlOf([0x99, 36, 90], PADS)).toMatchObject({ id: 'note:10:36', kind: 'pad' })
  })

  it('names the pedal, the wheels and knobs', () => {
    expect(controlOf([0xb0, 64, 127], PADS)?.kind).toBe('sustain')
    expect(controlOf([0xb0, 1, 30], PADS)?.kind).toBe('modWheel')
    expect(controlOf([0xb0, 70, 30], PADS)).toMatchObject({ id: 'cc:1:70', kind: 'knob' })
    expect(controlOf([0xe0, 0, 64], PADS)).toMatchObject({ kind: 'pitchBend', value: 8192 })
  })

  it('knows the MK4 Octave SysEx, other SysEx and transport', () => {
    expect(controlOf([0xf0, 0x47, 0x00, 0x5d, 0x3b, 0x00, 0x01, 0x03, 0xf7], PADS)).toMatchObject({ id: 'sysex:mk4-octave', kind: 'octave', value: 3 })
    expect(controlOf([0xf0, 0x47, 0x00, 0x5d, 0x10, 0xf7], PADS)).toMatchObject({ id: 'sysex:f0 47 00 5d 10', kind: 'sysex' })
    expect(controlOf([0xfa], PADS)).toMatchObject({ id: 'transport:start', kind: 'transport' })
    expect(controlOf([0xfc], PADS)).toMatchObject({ id: 'transport:stop' })
  })

  it('leaves out clock and active sensing', () => {
    expect(controlOf([0xf8], PADS)).toBeNull()
    expect(controlOf([0xfe], PADS)).toBeNull()
  })
})

describe('the inventory', () => {
  it('counts each control once, with its range and last value', () => {
    let inventory: Inventory = new Map()
    inventory = addMessage(inventory, [0xb0, 70, 10], PADS, 1)
    inventory = addMessage(inventory, [0xb0, 70, 90], PADS, 2)
    inventory = addMessage(inventory, [0xb0, 70, 40], PADS, 3)
    expect(inventory.get('cc:1:70')).toMatchObject({ min: 10, max: 90, last: 40, count: 3, at: 3 })
  })

  it('sums up keys of 25 and pads of 8', () => {
    let inventory: Inventory = new Map()
    for (const note of [48, 50, 52]) inventory = addMessage(inventory, [0x90, note, 80], PADS, 0)
    inventory = addMessage(inventory, [0x99, 36, 80], PADS, 0)
    inventory = addMessage(inventory, [0xb0, 70, 1], PADS, 0)
    expect(inventorySummary(inventory)).toEqual({ keys: 3, pads: 1, others: 1 })
    expect(JSON.parse(inventoryJson(inventory, 'MPK mini IV', PADS)).controls).toHaveLength(5)
  })

  it('reads the tempo from MIDI Clock, 24 ticks a quarter', () => {
    const ticks = Array.from({ length: 25 }, (_, i) => i * (500 / 24))
    expect(clockTempo(ticks)).toBe(120)
    expect(clockTempo(ticks.slice(0, 10))).toBeNull()
  })
})
