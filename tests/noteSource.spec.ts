import { describe, expect, it } from 'vitest'

import {
  DEFAULT_BASE_NOTE,
  DEFAULT_PAD_MAP,
  MAX_BASE_NOTE,
  MIN_BASE_NOTE,
  VIRTUAL_NOTE_KEYS,
  calibrationPress,
  HeldNotes,
  isValidPadMap,
  mk4OctaveBase,
  padAction,
  parseMidiMessage,
  shiftBaseNote,
  virtualPadForCode,
} from '@/lib/noteSource'

describe('parseMidiMessage', () => {
  it('reads key presses and releases', () => {
    expect(parseMidiMessage([0x90, 60, 100])).toEqual({ type: 'noteOn', note: 60, velocity: 100, channel: 1, source: 'midi' })
    expect(parseMidiMessage([0x80, 60, 0])).toEqual({ type: 'noteOff', note: 60, channel: 1, source: 'midi' })
  })

  it('treats noteOn with velocity 0 as a release', () => {
    expect(parseMidiMessage([0x90, 64, 0])).toEqual({ type: 'noteOff', note: 64, channel: 1, source: 'midi' })
  })

  it('turns pad notes on channel 10 into 1-based pad events', () => {
    expect(parseMidiMessage([0x99, 36, 110])).toEqual({ type: 'pad', pad: 1, velocity: 110, source: 'midi' })
    expect(parseMidiMessage([0x99, 43, 90])).toEqual({ type: 'pad', pad: 8, velocity: 90, source: 'midi' })
  })

  it('drops pad releases and unknown pad notes', () => {
    expect(parseMidiMessage([0x89, 36, 0])).toBeNull()
    expect(parseMidiMessage([0x99, 50, 100])).toBeNull()
  })

  it('uses a calibrated pad map', () => {
    const padMap = { channel: 1, notes: [48, 49] }
    expect(parseMidiMessage([0x90, 49, 80], padMap)).toEqual({ type: 'pad', pad: 2, velocity: 80, source: 'midi' })
    expect(parseMidiMessage([0x99, 36, 80], padMap)).toEqual({ type: 'noteOn', note: 36, velocity: 80, channel: 10, source: 'midi' })
  })

  it('reads knobs as control change', () => {
    expect(parseMidiMessage([0xb0, 70, 64])).toEqual({ type: 'knob', control: 70, value: 64, channel: 1, source: 'midi' })
  })

  it('ignores system messages, pitch bend and empty data', () => {
    expect(parseMidiMessage([0xf8])).toBeNull()
    expect(parseMidiMessage([0xfe])).toBeNull()
    expect(parseMidiMessage([0xe0, 0, 64])).toBeNull()
    expect(parseMidiMessage([])).toBeNull()
  })
})

describe('virtual keyboard', () => {
  it('maps the home row to white keys and the row above to black keys', () => {
    const whites = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK'].map((code) => VIRTUAL_NOTE_KEYS[code])
    expect(whites).toEqual([0, 2, 4, 5, 7, 9, 11, 12])
    const blacks = ['KeyW', 'KeyE', 'KeyT', 'KeyY', 'KeyU'].map((code) => VIRTUAL_NOTE_KEYS[code])
    expect(blacks).toEqual([1, 3, 6, 8, 10])
  })

  it('maps digits 1-8 to pads', () => {
    expect(virtualPadForCode('Digit1')).toBe(1)
    expect(virtualPadForCode('Digit8')).toBe(8)
    expect(virtualPadForCode('Digit9')).toBeNull()
    expect(virtualPadForCode('KeyA')).toBeNull()
  })

  it('shifts octaves within the MIDI range', () => {
    expect(DEFAULT_BASE_NOTE).toBe(48)
    expect(shiftBaseNote(DEFAULT_BASE_NOTE, 1)).toBe(60)
    expect(shiftBaseNote(DEFAULT_BASE_NOTE, -1)).toBe(36)
    expect(shiftBaseNote(MIN_BASE_NOTE, -1)).toBe(MIN_BASE_NOTE)
    expect(shiftBaseNote(MAX_BASE_NOTE, 1)).toBe(MAX_BASE_NOTE)
  })
})

describe('HeldNotes', () => {
  const on = (note: number, source: 'midi' | 'virtual' = 'midi', channel = 1) =>
    ({ type: 'noteOn', note, velocity: 100, channel, source }) as const
  const off = (note: number, source: 'midi' | 'virtual' = 'midi', channel = 1) =>
    ({ type: 'noteOff', note, channel, source }) as const

  it('tracks held notes in order and reports changes', () => {
    const held = new HeldNotes()
    expect(held.apply(on(67))).toBe(true)
    expect(held.apply(on(60))).toBe(true)
    expect(held.apply(on(60))).toBe(false)
    expect(held.notes()).toEqual([60, 67])
    expect(held.apply(off(60))).toBe(true)
    expect(held.apply(off(60))).toBe(false)
    expect(held.notes()).toEqual([67])
  })

  it('keeps a note held while another source still holds it', () => {
    const held = new HeldNotes()
    held.apply(on(60, 'midi'))
    held.apply(on(60, 'virtual'))
    held.apply(off(60, 'virtual'))
    expect(held.notes()).toEqual([60])
  })

  it('ignores pads and knobs', () => {
    const held = new HeldNotes()
    expect(held.apply({ type: 'pad', pad: 1, velocity: 100, source: 'midi' })).toBe(false)
    expect(held.apply({ type: 'knob', control: 70, value: 1, channel: 1, source: 'midi' })).toBe(false)
    expect(held.notes()).toEqual([])
  })

  it('clears one source, e.g. when MK4 is unplugged', () => {
    const held = new HeldNotes()
    held.apply(on(60, 'midi'))
    held.apply(on(64, 'virtual'))
    held.clear('midi')
    expect(held.notes()).toEqual([64])
    held.clear()
    expect(held.notes()).toEqual([])
  })

  it('uses the default MK4 pad channel', () => {
    expect(DEFAULT_PAD_MAP.channel).toBe(10)
  })
})

describe('pad actions and calibration', () => {
  it('maps pads to the plan actions', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(padAction)).toEqual(['next', 'listen', 'hint', 'skip', 'train', 'lab', 'levelDown', 'levelUp'])
    expect(padAction(9)).toBeNull()
  })

  it('validates stored pad maps', () => {
    expect(isValidPadMap(DEFAULT_PAD_MAP)).toBe(true)
    expect(isValidPadMap({ channel: 10, notes: [36, 36, 38, 39, 40, 41, 42, 43] })).toBe(false)
    expect(isValidPadMap({ channel: 17, notes: [36, 37, 38, 39, 40, 41, 42, 43] })).toBe(false)
    expect(isValidPadMap({ channel: 10, notes: [36] })).toBe(false)
    expect(isValidPadMap(null)).toBe(false)
    expect(isValidPadMap('x')).toBe(false)
  })

  it('collects eight pads on one channel', () => {
    let notes: number[] = []
    let channel: number | null = null
    for (const note of [44, 45, 46, 47, 48, 49, 50]) {
      const step = calibrationPress(notes, channel, { note, channel: 10 })
      expect(step.status).toBe('next')
      if (step.status === 'next') ({ notes, channel } = step)
    }
    expect(calibrationPress(notes, channel, { note: 51, channel: 10 })).toEqual({
      status: 'done',
      padMap: { channel: 10, notes: [44, 45, 46, 47, 48, 49, 50, 51] },
    })
  })

  it('rejects a repeated pad and a key from another channel', () => {
    expect(calibrationPress([44, 45], 10, { note: 45, channel: 10 })).toEqual({ status: 'duplicate', pad: 2 })
    expect(calibrationPress([44], 10, { note: 60, channel: 1 })).toEqual({ status: 'otherChannel', channel: 10 })
  })
})

describe('MK4 Octave buttons (SysEx)', () => {
  const octave = (position: number) => [0xf0, 0x47, 0x00, 0x5d, 0x3b, 0x00, 0x01, position, 0xf7]

  it('reads the position: 4 is home (C3), each step an octave', () => {
    expect(mk4OctaveBase(octave(4))).toBe(48)
    expect(mk4OctaveBase(octave(3))).toBe(36)
    expect(mk4OctaveBase(octave(5))).toBe(60)
  })

  it('turns it into an octave event and ignores other SysEx', () => {
    expect(parseMidiMessage(octave(3))).toEqual({ type: 'octave', base: 36, source: 'midi' })
    expect(parseMidiMessage([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7])).toBeNull()
    expect(mk4OctaveBase([0xf0, 0x47, 0x00, 0x5d, 0x3b, 0x00, 0x02, 4, 0xf7])).toBeNull()
  })

  it('stays inside the MIDI range', () => {
    expect(mk4OctaveBase(octave(0))).toBe(MIN_BASE_NOTE)
    expect(mk4OctaveBase(octave(12))).toBe(MAX_BASE_NOTE)
  })
})
