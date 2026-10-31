// What a MIDI keyboard sends, control by control (plan step 25): every distinct message becomes one row — what it
// probably is (a key, a pad, a knob, a wheel, the sustain pedal, the MK4's Octave buttons, transport), its channel
// and number, the values seen, the last one and how often. MIDI Clock is counted too, with the tempo it beats, so
// the MK4's Tap Tempo can be found. Pure code, no UI text.

import { mk4OctaveBase } from './noteSource'

export type ElementKind = 'key' | 'pad' | 'knob' | 'modWheel' | 'pitchBend' | 'sustain' | 'program' | 'aftertouch' | 'octave' | 'transport' | 'sysex' | 'other'

export interface InventoryItem {
  /** One per control: «note:1:60», «cc:1:70», «pitchBend:1», «sysex:f0 47 00 5d 3b», «transport:fa». */
  id: string
  kind: ElementKind
  /** 1-16, 0 for system messages. */
  channel: number
  /** Note or controller number; null when the message has none. */
  number: number | null
  min: number
  max: number
  last: number
  count: number
  /** When it last arrived, ms (for lighting it up). */
  at: number
  /** The last message in full, hex: what a SysEx really says. */
  bytes: string
}

export type Inventory = ReadonlyMap<string, InventoryItem>

/** Pads: the channel and notes they send (the app's pad map). */
export interface PadNotes {
  channel: number
  notes: readonly number[]
}

const TRANSPORT: Record<number, string> = { 0xfa: 'start', 0xfb: 'continue', 0xfc: 'stop' }
const SUSTAIN_CC = 64
const MOD_WHEEL_CC = 1

/** The control a raw message comes from, with its value; null for messages that are not a control (clock, sensing). */
export function controlOf(data: ArrayLike<number>, pads: PadNotes): Omit<InventoryItem, 'min' | 'max' | 'count' | 'at' | 'last' | 'bytes'> & { value: number } | null {
  const status = data[0]
  if (status === undefined) return null
  if (status === 0xf0) {
    if (mk4OctaveBase(data) !== null) return { id: 'sysex:mk4-octave', kind: 'octave', channel: 0, number: null, value: data[7] ?? 0 }
    const head = Array.from(data).slice(0, 5).map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
    return { id: `sysex:${head}`, kind: 'sysex', channel: 0, number: null, value: data.length }
  }
  if (TRANSPORT[status]) return { id: `transport:${TRANSPORT[status]}`, kind: 'transport', channel: 0, number: null, value: 1 }
  if (status >= 0xf0) return null
  const type = status & 0xf0
  const channel = (status & 0x0f) + 1
  const data1 = data[1] ?? 0
  const data2 = data[2] ?? 0
  if (type === 0x90 || type === 0x80) {
    const pad = channel === pads.channel && pads.notes.includes(data1)
    return { id: `note:${channel}:${data1}`, kind: pad ? 'pad' : 'key', channel, number: data1, value: type === 0x90 ? data2 : 0 }
  }
  if (type === 0xb0) {
    const kind: ElementKind = data1 === SUSTAIN_CC ? 'sustain' : data1 === MOD_WHEEL_CC ? 'modWheel' : 'knob'
    return { id: `cc:${channel}:${data1}`, kind, channel, number: data1, value: data2 }
  }
  if (type === 0xe0) return { id: `pitchBend:${channel}`, kind: 'pitchBend', channel, number: null, value: (data2 << 7) | data1 }
  if (type === 0xc0) return { id: `program:${channel}`, kind: 'program', channel, number: null, value: data1 }
  if (type === 0xd0 || type === 0xa0) return { id: `aftertouch:${channel}`, kind: 'aftertouch', channel, number: null, value: type === 0xd0 ? data1 : data2 }
  return { id: `other:${status.toString(16)}`, kind: 'other', channel, number: null, value: data1 }
}

/** The inventory with one more message counted (a new map; the old one is left as it was). */
export function addMessage(inventory: Inventory, data: ArrayLike<number>, pads: PadNotes, at: number): Inventory {
  const control = controlOf(data, pads)
  if (!control) return inventory
  const { value, ...rest } = control
  const bytes = Array.from(data, (byte) => byte.toString(16).padStart(2, '0')).join(' ')
  const before = inventory.get(control.id)
  const next = new Map(inventory)
  next.set(control.id, before
    ? { ...before, min: Math.min(before.min, value), max: Math.max(before.max, value), last: value, count: before.count + 1, at, bytes }
    : { ...rest, min: value, max: value, last: value, count: 1, at, bytes })
  return next
}

/** How much of the MK4 has been found: keys (of 25), pads (of 8), everything else. */
export function inventorySummary(inventory: Inventory): { keys: number, pads: number, others: number } {
  const items = [...inventory.values()]
  return {
    keys: items.filter((item) => item.kind === 'key').length,
    pads: items.filter((item) => item.kind === 'pad').length,
    others: items.filter((item) => item.kind !== 'key' && item.kind !== 'pad').length,
  }
}

/** MIDI Clock beats 24 times a quarter note. */
const CLOCKS_PER_QUARTER = 24

/** Tempo from the last clock ticks (ms), or null with too few of them. */
export function clockTempo(ticks: readonly number[]): number | null {
  if (ticks.length < CLOCKS_PER_QUARTER + 1) return null
  const recent = ticks.slice(-(CLOCKS_PER_QUARTER + 1))
  const quarter = recent[recent.length - 1]! - recent[0]!
  return quarter > 0 ? Math.round(60_000 / quarter) : null
}

/** The inventory as JSON for mapping (plan step 25): the device, the pad map, the controls found, and what was taught. */
export function inventoryJson(inventory: Inventory, device: string, pads: PadNotes, taught: object = {}): string {
  const controls = [...inventory.values()].sort((a, b) => a.id.localeCompare(b.id)).map(({ at: _at, ...item }) => item)
  return JSON.stringify({ device, pads, taught, controls }, null, 2)
}
