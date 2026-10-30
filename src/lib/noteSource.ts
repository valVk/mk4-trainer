// Note input abstraction: game logic only sees these events and never knows
// whether a note came from the real MK4 or from the virtual keyboard.

export type NoteSourceKind = 'midi' | 'virtual'

export type NoteEvent =
  /** `onScreen`: tapped on the on-screen keyboard or pad strip, not a physical key. */
  | { type: 'noteOn', note: number, velocity: number, channel: number, source: NoteSourceKind, onScreen?: boolean }
  | { type: 'noteOff', note: number, channel: number, source: NoteSourceKind }
  /** Pad number is 1-based, as printed on the MK4. */
  | { type: 'pad', pad: number, velocity: number, source: NoteSourceKind, onScreen?: boolean }
  | { type: 'knob', control: number, value: number, channel: number, source: NoteSourceKind }
  /** The MK4's Octave buttons moved its keys: `base` is the first key now (its own SysEx, found by the owner). */
  | { type: 'octave', base: number, source: NoteSourceKind }

export type NoteListener = (event: NoteEvent) => void

export interface NoteSource {
  readonly kind: NoteSourceKind
  start(): Promise<void>
  stop(): void
  subscribe(listener: NoteListener): () => void
}

/** Which MIDI notes are pads. Filled by calibration later; the default is a guess to verify on the device. */
export interface PadMap {
  channel: number
  notes: readonly number[]
}

// MK4 pads send on channel 10; 36-43 is the usual Akai bank A layout. Verify on the device (plan 4.2).
export const DEFAULT_PAD_MAP: PadMap = {
  channel: 10,
  notes: [36, 37, 38, 39, 40, 41, 42, 43],
}

export const PAD_COUNT = 8

/** What the MK4 sends when Octave − or + is pressed (DAW and plugin modes): F0 47 00 5D 3B 00 01 <position> F7. */
const MK4_OCTAVE_HEADER = [0xf0, 0x47, 0x00, 0x5d, 0x3b, 0x00, 0x01] as const
/** Position 4 is the MK4 out of the box: C3-C5. Each step moves the keys an octave. */
const MK4_HOME_POSITION = 4

/** The first key of the MK4 after an Octave press, from its SysEx; null for any other message. */
export function mk4OctaveBase(data: ArrayLike<number>): number | null {
  if (data.length !== MK4_OCTAVE_HEADER.length + 2 || data[data.length - 1] !== 0xf7) return null
  if (!MK4_OCTAVE_HEADER.every((byte, i) => data[i] === byte)) return null
  const base = DEFAULT_BASE_NOTE + (data[MK4_OCTAVE_HEADER.length]! - MK4_HOME_POSITION) * 12
  return Math.min(MAX_BASE_NOTE, Math.max(MIN_BASE_NOTE, base))
}

/** Turns one raw MIDI message into an event; returns null for messages the trainer ignores. */
export function parseMidiMessage(
  data: ArrayLike<number>,
  padMap: PadMap = DEFAULT_PAD_MAP,
  source: NoteSourceKind = 'midi',
): NoteEvent | null {
  const status = data[0]
  if (status === 0xf0) {
    const base = mk4OctaveBase(data)
    return base === null ? null : { type: 'octave', base, source }
  }
  if (status === undefined || status >= 0xf0) return null
  const type = status & 0xf0
  const channel = (status & 0x0f) + 1
  const data1 = data[1] ?? 0
  const data2 = data[2] ?? 0

  if (type === 0x90 || type === 0x80) {
    const isOn = type === 0x90 && data2 > 0
    if (channel === padMap.channel) {
      const index = padMap.notes.indexOf(data1)
      // Pads act on press only; releases and unknown pad notes are dropped.
      if (index === -1 || !isOn) return null
      return { type: 'pad', pad: index + 1, velocity: data2, source }
    }
    return isOn
      ? { type: 'noteOn', note: data1, velocity: data2, channel, source }
      : { type: 'noteOff', note: data1, channel, source }
  }
  if (type === 0xb0) {
    return { type: 'knob', control: data1, value: data2, channel, source }
  }
  return null
}

// Virtual MK4 on a computer keyboard. KeyboardEvent.code is the physical key,
// so the layout works the same with a Russian keyboard layout switched on.
export const VIRTUAL_NOTE_KEYS: Readonly<Record<string, number>> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
  KeyO: 13,
  KeyL: 14,
  KeyP: 15,
  Semicolon: 16,
}

export const VIRTUAL_OCTAVE_DOWN = 'KeyZ'
export const VIRTUAL_OCTAVE_UP = 'KeyX'

/** Digit1..Digit8 -> pads 1..8 */
export function virtualPadForCode(code: string): number | null {
  const match = /^Digit([1-8])$/.exec(code)
  return match ? Number(match[1]) : null
}

export const VIRTUAL_VELOCITY = 100
export const VIRTUAL_CHANNEL = 1

// Same span as MK4 octave buttons: base C stays inside the MIDI range with the top key.
export const MIN_BASE_NOTE = 24
export const MAX_BASE_NOTE = 96
/** Where the keys start: C3, as the MK4 out of the box (the small and first octaves, C3-C5). */
export const DEFAULT_BASE_NOTE = 48

export function shiftBaseNote(base: number, octaves: number): number {
  return Math.min(MAX_BASE_NOTE, Math.max(MIN_BASE_NOTE, base + octaves * 12))
}

/**
 * Tracks which keys are held. Keyed by channel and note so the same note on two
 * channels does not cancel out; pads never count as held notes.
 */
export class HeldNotes {
  private readonly held = new Map<string, number>()

  apply(event: NoteEvent): boolean {
    if (event.type === 'noteOn') {
      const key = `${event.source}:${event.channel}:${event.note}`
      if (this.held.has(key)) return false
      this.held.set(key, event.note)
      return true
    }
    if (event.type === 'noteOff') {
      return this.held.delete(`${event.source}:${event.channel}:${event.note}`)
    }
    return false
  }

  /** Drop everything from one source, e.g. when the window loses focus or MK4 is unplugged. */
  clear(source?: NoteSourceKind): void {
    if (!source) {
      this.held.clear()
      return
    }
    for (const key of this.held.keys()) {
      if (key.startsWith(`${source}:`)) this.held.delete(key)
    }
  }

  notes(): number[] {
    return [...new Set(this.held.values())].sort((a, b) => a - b)
  }
}

// Pad actions (plan 4.2): pad number -> what it does in the game.
export const PAD_ACTIONS = ['next', 'listen', 'hint', 'skip', 'train', 'lab', 'levelDown', 'levelUp'] as const
export type PadAction = (typeof PAD_ACTIONS)[number]

/** Pad numbers are 1-based, as printed on the MK4. */
export function padAction(pad: number): PadAction | null {
  return PAD_ACTIONS[pad - 1] ?? null
}

/** A calibrated map must name 8 different notes on one MIDI channel. */
export function isValidPadMap(value: unknown): value is PadMap {
  if (typeof value !== 'object' || value === null) return false
  const { channel, notes } = value as Partial<PadMap>
  return Number.isInteger(channel) && channel! >= 1 && channel! <= 16
    && Array.isArray(notes) && notes.length === PAD_COUNT
    && notes.every((note) => Number.isInteger(note) && note >= 0 && note <= 127)
    && new Set(notes).size === PAD_COUNT
}

export type CalibrationStep =
  | { status: 'next', notes: number[], channel: number }
  | { status: 'duplicate', pad: number }
  | { status: 'otherChannel', channel: number }
  | { status: 'done', padMap: PadMap }

/**
 * One press during calibration. All pads must share the first pad's channel
 * and each pad must send its own note; a repeat names the pad that already has it.
 */
export function calibrationPress(notes: readonly number[], channel: number | null, press: { note: number, channel: number }): CalibrationStep {
  if (channel !== null && press.channel !== channel) return { status: 'otherChannel', channel }
  const index = notes.indexOf(press.note)
  if (index !== -1) return { status: 'duplicate', pad: index + 1 }
  const next = [...notes, press.note]
  const nextChannel = channel ?? press.channel
  if (next.length === PAD_COUNT) return { status: 'done', padMap: { channel: nextChannel, notes: next } }
  return { status: 'next', notes: next, channel: nextChannel }
}
