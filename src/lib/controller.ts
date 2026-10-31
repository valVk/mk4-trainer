// Plan step 31: everything the app knows about one MIDI keyboard, behind one interface. The MK4 is the only one
// (lib/controllers/mk4.ts); another keyboard would be another profile, and the screens would not change. Pure code,
// no UI text.

import { MK4 } from './controllers/mk4'
import type { PanelAction, PanelControl } from './mk4Layout'
import type { PadMap } from './noteSource'

export interface ControllerProfile {
  id: string
  /** The name on the box. */
  name: string
  /** Whether a MIDI input (by its name) is this keyboard. */
  matches: (inputName: string) => boolean
  /** How many keys it has, the window the app's exercises fit into. */
  keys: number
  /** The lowest key out of the box (MIDI note). */
  homeBase: number
  /** Which notes its pads send out of the box, before calibration. */
  pads: PadMap
  /** Its panel as a drawing, control by control (the MIDI check page). */
  panel: readonly PanelControl[]
  /** What each control sends out of the box: control id → message id («cc:1:76»). */
  factory: Readonly<Record<string, string>>
  /** What each control does in the app out of the box, before the owner chooses otherwise. */
  actions: Readonly<Record<string, PanelAction>>
  /** Controls that send no MIDI at all. */
  silent: readonly string[]
  /** The message of a relative encoder that steps through the screen, if it has one. */
  displayTurn: string | null
  /** The key window from its own octave message (a SysEx), or null for any other message. */
  octaveBase: (data: ArrayLike<number>) => number | null
}

/** Every keyboard the app knows. */
export const CONTROLLERS: readonly ControllerProfile[] = [MK4]

/** The keyboard the app works with: the MK4, the only one so far. */
export function activeController(): ControllerProfile {
  return MK4
}
