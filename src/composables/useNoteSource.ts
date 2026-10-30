import { computed, getCurrentScope, onScopeDispose, readonly, ref, shallowRef } from 'vue'

import {
  DEFAULT_BASE_NOTE,
  DEFAULT_PAD_MAP,
  HeldNotes,
  PAD_COUNT,
  VIRTUAL_CHANNEL,
  VIRTUAL_NOTE_KEYS,
  VIRTUAL_OCTAVE_DOWN,
  VIRTUAL_OCTAVE_UP,
  VIRTUAL_VELOCITY,
  parseMidiMessage,
  shiftBaseNote,
  virtualPadForCode,
  type NoteEvent,
  type NoteListener,
  type NoteSource,
  type PadMap,
} from '@/lib/noteSource'

export interface MidiInputInfo {
  id: string
  name: string
  manufacturer: string
  connected: boolean
}

export type MidiStatus = 'idle' | 'connecting' | 'connected' | 'denied' | 'unsupported'

class Emitter {
  private readonly listeners = new Set<NoteListener>()

  subscribe(listener: NoteListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(event: NoteEvent): void {
    this.listeners.forEach((listener) => listener(event))
  }
}

const NO_PADS: PadMap = { channel: 0, notes: [] }

/** Real MK4 (or any MIDI keyboard) through Web MIDI. */
export class WebMidiSource implements NoteSource {
  readonly kind = 'midi' as const
  private readonly emitter = new Emitter()
  private access: MIDIAccess | null = null

  /** While set, raw key and pad presses go here instead of the game (pad calibration). */
  capture: ((press: { note: number, channel: number }) => void) | null = null

  constructor(
    private readonly getPadMap: () => PadMap = () => DEFAULT_PAD_MAP,
    private readonly onInputs?: (inputs: MidiInputInfo[]) => void,
  ) {}

  subscribe(listener: NoteListener) {
    return this.emitter.subscribe(listener)
  }

  async start(): Promise<void> {
    if (this.access) return
    this.access = await navigator.requestMIDIAccess({ sysex: true, software: true })
    // Plugging the MK4 in or out re-attaches handlers to whatever is connected now.
    this.access.onstatechange = () => this.attach()
    this.attach()
  }

  stop(): void {
    if (!this.access) return
    this.access.onstatechange = null
    this.access.inputs.forEach((input) => {
      input.removeEventListener('midimessage', this.onMessage)
    })
    this.access = null
  }

  private attach(): void {
    if (!this.access) return
    const inputs: MidiInputInfo[] = []
    this.access.inputs.forEach((input) => {
      // Same function reference: re-attaching on every state change never doubles events,
      // and other listeners (the raw log on the MK4 check page) are left alone.
      input.addEventListener('midimessage', this.onMessage)
      inputs.push({
        id: input.id,
        name: input.name ?? '?',
        manufacturer: input.manufacturer ?? '',
        connected: input.state === 'connected',
      })
    })
    this.onInputs?.(inputs)
  }

  private readonly onMessage = (message: MIDIMessageEvent) => {
    if (!message.data) return
    if (this.capture) {
      // No pad map while calibrating: every press is reported as a plain note.
      const raw = parseMidiMessage(message.data, NO_PADS, 'midi')
      if (raw?.type === 'noteOn') this.capture({ note: raw.note, channel: raw.channel })
      return
    }
    const event = parseMidiMessage(message.data, this.getPadMap(), 'midi')
    if (event) this.emitter.emit(event)
  }
}

/** Virtual MK4: computer keyboard plus taps on the on-screen keyboard. */
export class VirtualSource implements NoteSource {
  readonly kind = 'virtual' as const
  private readonly emitter = new Emitter()
  // Remember the note each key started, so an octave shift mid-hold still releases it.
  private readonly pressedKeys = new Map<string, number>()
  private readonly pressedTaps = new Set<number>()
  private running = false

  constructor(
    private baseNote = DEFAULT_BASE_NOTE,
    private readonly onBaseNote?: (base: number) => void,
  ) {}

  get base(): number {
    return this.baseNote
  }

  subscribe(listener: NoteListener) {
    return this.emitter.subscribe(listener)
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.releaseAll)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  stop(): void {
    if (!this.running) return
    this.releaseAll()
    this.running = false
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.releaseAll)
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  pressNote(note: number, velocity = VIRTUAL_VELOCITY): void {
    if (this.pressedTaps.has(note)) return
    this.pressedTaps.add(note)
    this.emitter.emit({ type: 'noteOn', note, velocity, channel: VIRTUAL_CHANNEL, source: 'virtual', onScreen: true })
  }

  releaseNote(note: number): void {
    if (!this.pressedTaps.delete(note)) return
    this.emitter.emit({ type: 'noteOff', note, channel: VIRTUAL_CHANNEL, source: 'virtual' })
  }

  pressPad(pad: number, velocity = VIRTUAL_VELOCITY, onScreen = true): void {
    this.emitter.emit({ type: 'pad', pad, velocity, source: 'virtual', onScreen })
  }

  shiftOctave(octaves: number): void {
    this.baseNote = shiftBaseNote(this.baseNote, octaves)
    this.onBaseNote?.(this.baseNote)
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return
    const offset = VIRTUAL_NOTE_KEYS[event.code]
    if (offset !== undefined) {
      if (this.pressedKeys.has(event.code)) return
      const note = this.baseNote + offset
      this.pressedKeys.set(event.code, note)
      this.emitter.emit({ type: 'noteOn', note, velocity: VIRTUAL_VELOCITY, channel: VIRTUAL_CHANNEL, source: 'virtual' })
      event.preventDefault()
      return
    }
    if (event.code === VIRTUAL_OCTAVE_DOWN || event.code === VIRTUAL_OCTAVE_UP) {
      this.shiftOctave(event.code === VIRTUAL_OCTAVE_UP ? 1 : -1)
      event.preventDefault()
      return
    }
    const pad = virtualPadForCode(event.code)
    if (pad !== null) {
      this.pressPad(pad, VIRTUAL_VELOCITY, false)
      event.preventDefault()
    }
  }

  private readonly onKeyUp = (event: KeyboardEvent) => {
    const note = this.pressedKeys.get(event.code)
    if (note === undefined) return
    this.pressedKeys.delete(event.code)
    this.emitter.emit({ type: 'noteOff', note, channel: VIRTUAL_CHANNEL, source: 'virtual' })
  }

  private readonly onVisibility = () => {
    if (document.visibilityState === 'hidden') this.releaseAll()
  }

  // A key released while the window was in the background never sends keyup.
  private readonly releaseAll = () => {
    for (const note of this.pressedKeys.values()) {
      this.emitter.emit({ type: 'noteOff', note, channel: VIRTUAL_CHANNEL, source: 'virtual' })
    }
    this.pressedKeys.clear()
    for (const note of this.pressedTaps) {
      this.emitter.emit({ type: 'noteOff', note, channel: VIRTUAL_CHANNEL, source: 'virtual' })
    }
    this.pressedTaps.clear()
  }
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

// One MK4 per app: both sources feed a single shared stream.
const hub = new Emitter()
const held = new HeldNotes()
const heldNotes = ref<number[]>([])
const midiStatus = ref<MidiStatus>('requestMIDIAccess' in navigator ? 'idle' : 'unsupported')
const midiError = ref('')
const midiInputs = shallowRef<MidiInputInfo[]>([])
const baseNote = ref(DEFAULT_BASE_NOTE)

function dispatch(event: NoteEvent): void {
  if (held.apply(event)) heldNotes.value = held.notes()
  hub.emit(event)
}

const virtual = new VirtualSource(DEFAULT_BASE_NOTE, (base) => {
  baseNote.value = base
})
virtual.subscribe(dispatch)

// Saved and restored by useProgress (setting table); here it only lives in memory.
const padMap = shallowRef<PadMap>(DEFAULT_PAD_MAP)

function setPadMap(map: PadMap | null): void {
  padMap.value = map ?? DEFAULT_PAD_MAP
}

const midi = new WebMidiSource(() => padMap.value, (inputs) => {
  midiInputs.value = inputs
  // MK4 unplugged mid-chord: its keys will never send noteOff.
  if (!inputs.some((input) => input.connected)) {
    held.clear('midi')
    heldNotes.value = held.notes()
  }
})
midi.subscribe(dispatch)

/** What Chrome says about MIDI for this site; null when the browser cannot tell (then we just ask). */
async function midiPermission(): Promise<PermissionState | null> {
  try {
    const status = await navigator.permissions.query({ name: 'midi' as PermissionName })
    // Allowed or blocked later in the site settings: follow it without a reload.
    status.onchange = () => {
      if (status.state === 'granted') void connectMidi()
      else if (status.state === 'denied') midiStatus.value = 'denied'
      else if (midiStatus.value === 'denied') midiStatus.value = 'idle'
    }
    return status.state
  } catch {
    return null
  }
}

/**
 * At startup: connect only when MIDI is already allowed. Asking before the child has tapped anything
 * shows Chrome's prompt on every visit; after a few prompts closed unanswered, Chrome blocks MIDI for the
 * site for good. Otherwise the «Подключить MK4» button asks, right after a tap.
 */
async function autoConnectMidi(): Promise<void> {
  if (midiStatus.value === 'unsupported') return
  const state = await midiPermission()
  if (state === 'granted' || state === null) await connectMidi()
  else if (state === 'denied') midiStatus.value = 'denied'
}

async function connectMidi(): Promise<void> {
  if (midiStatus.value === 'unsupported' || midiStatus.value === 'connected') return
  midiStatus.value = 'connecting'
  midiError.value = ''
  try {
    await midi.start()
    midiStatus.value = 'connected'
  } catch (e) {
    midiStatus.value = 'denied'
    midiError.value = e instanceof Error ? e.message : String(e)
  }
}

export function useNoteSource() {
  void virtual.start()

  /** Listen to every note, pad and knob event; unsubscribes with the calling component. */
  function onEvent(listener: NoteListener): () => void {
    const unsubscribe = hub.subscribe(listener)
    if (getCurrentScope()) onScopeDispose(unsubscribe)
    return unsubscribe
  }

  /** Route raw MK4 presses to `listener` (calibration); call the returned function to stop. */
  function capturePresses(listener: (press: { note: number, channel: number }) => void): () => void {
    midi.capture = listener
    const stop = () => {
      if (midi.capture === listener) midi.capture = null
    }
    if (getCurrentScope()) onScopeDispose(stop)
    return stop
  }

  return {
    heldNotes: readonly(heldNotes),
    padMap: readonly(padMap),
    padCount: PAD_COUNT,
    setPadMap,
    capturePresses,
    baseNote: readonly(baseNote),
    midiStatus: readonly(midiStatus),
    /** A keyboard is actually plugged in (MIDI access alone says nothing about that). */
    midiFound: computed(() => midiInputs.value.some((input) => input.connected)),
    autoConnectMidi,
    midiError: readonly(midiError),
    midiInputs: readonly(midiInputs),
    connectMidi,
    onEvent,
    pressNote: (note: number) => virtual.pressNote(note),
    releaseNote: (note: number) => virtual.releaseNote(note),
    pressPad: (pad: number) => virtual.pressPad(pad),
    shiftOctave: (octaves: number) => virtual.shiftOctave(octaves),
  }
}
