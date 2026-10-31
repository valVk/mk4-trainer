// The MPK mini IV panel as data (plan step 25, from the owner's photo of the box): every control, where it is on a
// 1000x420 drawing, and what it is. The on-screen copy is drawn from this, so another keyboard is another list.
// Keys and pads are found by note (keys from the window, pads by the pad map); every other control is learnt:
// tap it on the screen, press it on the MK4. Pure code, no UI text (labels are printed names on the panel).

export type ControlShape = 'button' | 'pad' | 'knob' | 'wheel' | 'display' | 'key' | 'blackKey'

export interface PanelControl {
  id: string
  /** The name printed on the panel. */
  label: string
  shape: ControlShape
  x: number
  y: number
  w: number
  h: number
  /** Pads 1-8 and keys 0-24 are matched by note, not learnt. */
  pad?: number
  key?: number
}

const button = (id: string, label: string, x: number, y: number, w = 58, h = 30): PanelControl => ({ id, label, shape: 'button', x, y, w, h })

const PADS: PanelControl[] = Array.from({ length: 8 }, (_, i) => {
  // Pads 5-8 on the top row, 1-4 under them, as on the MK4.
  const top = i >= 4
  const column = i % 4
  return { id: `pad${i + 1}`, label: String(i + 1), shape: 'pad', x: 180 + column * 80, y: top ? 18 : 98, w: 72, h: 72, pad: i + 1 }
})

const KNOBS: PanelControl[] = ['Division', 'Swing', 'Mode', 'Oct', 'Latch', 'Sync', 'Gate', 'BPM'].map((label, i) => ({
  id: `knob${i + 1}`,
  label: `${i + 1} ${label}`,
  shape: 'knob',
  x: 690 + (i % 4) * 74,
  y: i < 4 ? 22 : 102,
  w: 56,
  h: 56,
}))

/** 25 keys from C: white ones across the bottom, black ones over them. */
const KEYS: PanelControl[] = (() => {
  const keys: PanelControl[] = []
  const black = new Set([1, 3, 6, 8, 10])
  const whiteWidth = 960 / 15
  let white = 0
  for (let key = 0; key < 25; key++) {
    if (black.has(key % 12)) keys.push({ id: `key${key}`, label: '', shape: 'blackKey', x: 20 + white * whiteWidth - whiteWidth * 0.3, y: 270, w: whiteWidth * 0.6, h: 90, key })
    else keys.push({ id: `key${key}`, label: '', shape: 'key', x: 20 + white++ * whiteWidth, y: 270, w: whiteWidth, h: 140, key })
  }
  // White keys first, so black ones are drawn over them.
  return [...keys.filter((item) => item.shape === 'key'), ...keys.filter((item) => item.shape === 'blackKey')]
})()

export const MK4_PANEL: readonly PanelControl[] = [
  { id: 'pitchWheel', label: 'Pitch', shape: 'wheel', x: 26, y: 18, w: 40, h: 120 },
  { id: 'modWheel', label: 'Mod', shape: 'wheel', x: 86, y: 18, w: 40, h: 120 },
  button('octDown', 'Oct −', 22, 160, 50),
  button('octUp', 'Oct +', 82, 160, 50),
  ...PADS,
  button('arp', 'Arp', 180, 192),
  button('latch', 'Latch', 244, 192),
  button('noteRepeat', 'Note Repeat', 308, 192, 70),
  button('tapTempo', 'Tap Tempo', 384, 192, 70),
  button('bank', 'Bank A/B', 460, 192, 64),
  { id: 'display', label: 'MPK mini', shape: 'display', x: 548, y: 18, w: 120, h: 56 },
  { id: 'displayKnob', label: 'Push', shape: 'knob', x: 584, y: 86, w: 48, h: 48 },
  button('minus', '−', 548, 148, 54),
  button('plus', '+', 614, 148, 54),
  button('shift', 'Shift', 548, 192, 54),
  button('plugin', 'Plugin/DAW', 614, 192, 54),
  ...KNOBS,
  button('undo', 'Undo', 690, 192, 52),
  button('loop', 'Loop', 750, 192, 52),
  button('playStop', '■/▶', 810, 192, 52),
  button('record', '●', 870, 192, 52),
  button('add', '+', 930, 192, 52),
  ...KEYS,
]

/** What a control can do in the app (carried out in plan step 26). Knobs and wheels turn; buttons press. */
export const PANEL_ACTIONS = ['none', 'playStop', 'again', 'seekBack', 'seekForward', 'record', 'tapTempo', 'next', 'previous', 'select', 'back', 'tempo', 'volume'] as const
export type PanelAction = typeof PANEL_ACTIONS[number]
export const TURN_ACTIONS: readonly PanelAction[] = ['none', 'tempo', 'volume']

/** The control learnt for a message, or matched by note: keys from the window start, pads by the pad map. */
export function controlFor(messageId: string, learnt: Readonly<Record<string, string>>, keysStart: number, pads: { channel: number, notes: readonly number[] }): string | null {
  const byLearning = Object.entries(learnt).find(([, message]) => message === messageId)?.[0]
  if (byLearning) return byLearning
  // What the MK4 sends out of the box; the display knob turns on a message of its own.
  if (messageId === MK4_DISPLAY_TURN) return 'displayKnob'
  const byFactory = Object.entries(MK4_FACTORY).find(([, message]) => message === messageId)?.[0]
  if (byFactory) return byFactory
  const note = /^note:(\d+):(\d+)$/.exec(messageId)
  if (!note) return null
  const channel = Number(note[1])
  const number = Number(note[2])
  if (channel === pads.channel && pads.notes.includes(number)) return `pad${pads.notes.indexOf(number) + 1}`
  const key = number - keysStart
  return key >= 0 && key < 25 ? `key${key}` : null
}

/** What the owner taught the app about the panel: the message of each control, and what it does. */
export interface PanelSettings {
  learnt: Record<string, string>
  actions: Record<string, PanelAction>
}

export function parsePanelSettings(value: unknown): PanelSettings {
  const settings: PanelSettings = { learnt: {}, actions: {} }
  if (typeof value !== 'object' || value === null) return settings
  const { learnt, actions } = value as Partial<Record<keyof PanelSettings, unknown>>
  const ids = new Set(MK4_PANEL.map((item) => item.id))
  if (typeof learnt === 'object' && learnt !== null) {
    for (const [id, message] of Object.entries(learnt)) if (ids.has(id) && typeof message === 'string') settings.learnt[id] = message
  }
  if (typeof actions === 'object' && actions !== null) {
    for (const [id, action] of Object.entries(actions)) if (ids.has(id) && (PANEL_ACTIONS as readonly string[]).includes(action as string)) settings.actions[id] = action as PanelAction
  }
  return settings
}

/**
 * What the MK4 sends out of the box, recorded from the owner's keyboard (31.10.2026, DAW and Plugin ports): the
 * controls need no teaching. Arp, Latch and Note Repeat send nothing (they switch the MK4 itself); Shift+Tap Tempo
 * (the metronome in Ableton) has no message of its own: it is Shift (CC 17) held while Tap Tempo (CC 82) comes.
 */
export const MK4_FACTORY: Readonly<Record<string, string>> = {
  tapTempo: 'cc:1:82',
  bank: 'cc:1:12',
  minus: 'cc:1:80',
  plus: 'cc:1:81',
  shift: 'cc:1:17',
  plugin: 'sysex:f0 47 00 5d 2d',
  displayKnob: 'cc:1:13',
  undo: 'cc:1:73',
  loop: 'cc:1:74',
  playStop: 'cc:1:76',
  record: 'cc:1:77',
  add: 'cc:1:78',
  modWheel: 'cc:1:1',
  pitchWheel: 'pitchBend:1',
  octDown: 'sysex:mk4-octave',
  octUp: 'sysex:mk4-octave',
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`knob${i + 1}`, `cc:1:${24 + i}`])),
}

/** The display knob turns as a relative encoder on CC 14: 1 is a click right, 127 a click left. */
export const MK4_DISPLAY_TURN = 'cc:1:14'

/** Controls that send no MIDI: shown as such on the panel instead of waiting to be taught. */
export const MK4_SILENT: readonly string[] = ['arp', 'latch', 'noteRepeat']
