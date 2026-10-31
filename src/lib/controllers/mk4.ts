// The Akai MPK mini IV (plan steps 25-26): 25 keys from C3, 8 pads, the transport, knobs and the display knob, as
// recorded from the owner's keyboard. Its data lives in the modules that read it (the panel, the factory messages,
// the octave SysEx); this profile puts it behind the app's one controller interface.

import type { ControllerProfile } from '../controller'
import { KEYBOARD_KEYS } from '../keyboard'
import { DEFAULT_ACTIONS } from '../mk4Control'
import { MK4_DISPLAY_TURN, MK4_FACTORY, MK4_PANEL, MK4_SILENT } from '../mk4Layout'
import { DEFAULT_BASE_NOTE, DEFAULT_PAD_MAP, mk4OctaveBase } from '../noteSource'

export const MK4: ControllerProfile = {
  id: 'mpk-mini-iv',
  name: 'Akai MPK mini IV',
  matches: (inputName) => /mpk\s*mini\s*(iv|4)/i.test(inputName),
  keys: KEYBOARD_KEYS,
  homeBase: DEFAULT_BASE_NOTE,
  pads: DEFAULT_PAD_MAP,
  panel: MK4_PANEL,
  factory: MK4_FACTORY,
  actions: DEFAULT_ACTIONS,
  silent: MK4_SILENT,
  displayTurn: MK4_DISPLAY_TURN,
  octaveBase: mk4OctaveBase,
}
