// The MK4 drives the app (plan step 26): what each control does out of the box, the tempo from Tap Tempo, the
// metronome on Shift+Tap Tempo (as in Ableton), and turning a CC into an action. Pure code, no UI text.

import { MK4_DISPLAY_TURN, type PanelAction } from './mk4Layout'

/** Shift+Tap Tempo toggles the metronome; it has no control of its own. */
export type Mk4Action = PanelAction | 'metronome'

/** Out of the box, before the owner chooses otherwise on «Панель MK4». */
export const DEFAULT_ACTIONS: Readonly<Record<string, PanelAction>> = {
  playStop: 'playStop',
  loop: 'again',
  minus: 'seekBack',
  plus: 'seekForward',
  record: 'record',
  tapTempo: 'tapTempo',
  undo: 'back',
  displayKnob: 'select',
  knob8: 'tempo',
}

/** A tap further than this from the one before starts counting again. */
const TAP_RESET_MS = 2000
/** Taps averaged for the tempo (their gaps, median). */
const TAPS_COUNTED = 4
export const TAP_MIN_BPM = 30
export const TAP_MAX_BPM = 240

/** The taps still counting after one more at `at` (ms): a long pause starts afresh. */
export function addTap(taps: readonly number[], at: number): number[] {
  const last = taps[taps.length - 1]
  const kept = last !== undefined && at - last <= TAP_RESET_MS ? taps : []
  return [...kept, at].slice(-TAPS_COUNTED)
}

/** Tempo from taps: the median gap of the last few, null until there are two. */
export function tapBpm(taps: readonly number[]): number | null {
  if (taps.length < 2) return null
  const gaps = taps.slice(1).map((at, i) => at - taps[i]!).sort((a, b) => a - b)
  const median = gaps[Math.floor(gaps.length / 2)]!
  return Math.min(TAP_MAX_BPM, Math.max(TAP_MIN_BPM, Math.round(60_000 / median)))
}

/** An encoder's 0-127 as a tempo across the metronome's range. */
export function knobBpm(value: number, low = 40, high = 208): number {
  return Math.round(low + (high - low) * (Math.max(0, Math.min(127, value)) / 127))
}

export interface ResolvedAction {
  action: Mk4Action
  /** A turn: +1 a click right, −1 left; a knob: its 0-127 value. */
  value?: number
}

/**
 * What a control message means now. Buttons act when pressed (127), not when let go; Shift held turns Tap Tempo
 * into the metronome. The display knob turns as a relative encoder (1 right, 127 left): next and previous.
 */
export function resolveAction(control: string | null, messageId: string, value: number, shiftHeld: boolean, chosen: Readonly<Record<string, PanelAction>>): ResolvedAction | null {
  if (messageId === MK4_DISPLAY_TURN) return value >= 64 ? { action: 'previous', value: -1 } : { action: 'next', value: 1 }
  if (!control || control === 'shift') return null
  const action = chosen[control] ?? DEFAULT_ACTIONS[control] ?? 'none'
  if (action === 'none') return null
  if (action === 'tempo' || action === 'volume') return { action, value }
  if (value === 0) return null
  if (action === 'tapTempo' && shiftHeld) return { action: 'metronome' }
  return { action }
}
