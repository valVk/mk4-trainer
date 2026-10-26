import { effectScope, readonly, ref, shallowRef } from 'vue'
import { WorkletSynthesizer } from 'spessasynth_lib'
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url'

import { useNoteSource } from '@/composables/useNoteSource'
import { DEFAULT_INSTRUMENT, resolveInstrument, type Instrument, type PresetInfo } from '@/lib/instruments'

// SoundFonts live in public/soundfonts (not in git, see NOTICE); the parent picks one on the Progress page.
export const BANKS = [
  // MIT, S. Christian Collins
  { id: 'musescore', file: 'MuseScore_General.sf3', sizeMb: 40 },
  // GNU GPL v2, Milton Paredes (from the Denemo project)
  { id: 'a320u', file: 'A320U.sf2', sizeMb: 10 },
] as const

export type BankId = (typeof BANKS)[number]['id']
const SOUNDFONT_CACHE = 'soundfonts'

const bankInfo = (id: BankId) => BANKS.find((item) => item.id === id) ?? BANKS[0]
const bankUrl = (id: BankId) => `${import.meta.env.BASE_URL}soundfonts/${bankInfo(id).file}`

export type SynthStatus = 'off' | 'loading' | 'ready' | 'error'

// The child's notes and the reference chords use separate channels,
// so a reference chord never cuts off keys that are being held.
const PLAY_CHANNEL = 0
const REFERENCE_CHANNEL = 1
const REFERENCE_VELOCITY = 90

// Feedback chimes: glockenspiel, quiet and above the keyboard, so they never blend with the child's chord.
const CUE_CHANNEL = 2
const CUE_PROGRAM = 9
const CUE_VELOCITY = 55
const CUES = {
  step: [96],
  success: [91, 96],
  levelDone: [84, 88, 91, 96],
} as const
const CUE_GAP_MS = 90
const BANK_SELECT = 0
const PREVIEW_NOTES = [60, 64, 67]
const CUE_LENGTH_MS = 400

export type CueKind = keyof typeof CUES

const status = ref<SynthStatus>('off')
const progress = ref(0)
const error = ref('')
const instrument = ref<Instrument>(DEFAULT_INSTRUMENT)
/** Melodic and drum presets of the loaded bank, as the synth reports them. */
const presets = shallowRef<PresetInfo[]>([])
const bank = ref<BankId>('musescore')
/** Whether the chosen bank is already in the offline cache. */
const downloaded = ref(false)
const synth = shallowRef<WorkletSynthesizer | null>(null)
let context: AudioContext | null = null
let starting: Promise<void> | null = null
let loadedBank: BankId | null = null
let routed = false

/** Reads the SoundFont with download progress; the service worker serves it from cache next time. */
async function fetchSoundFont(url: string): Promise<ArrayBuffer> {
  progress.value = 0
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`SoundFont: HTTP ${response.status}`)
  const total = Number(response.headers.get('content-length')) || 0
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (total) progress.value = received / total
  }
  const buffer = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.length
  }
  progress.value = 1
  return buffer.buffer
}

async function checkDownloaded(): Promise<void> {
  try {
    if ('caches' in window) downloaded.value = !!(await caches.match(bankUrl(bank.value), { cacheName: SOUNDFONT_CACHE }))
  } catch {
    downloaded.value = false
  }
}

/** Bank select, then program: a variant lives in another bank of the same program. */
function selectPreset(instance: WorkletSynthesizer, channel: number, preset: Instrument): void {
  instance.controllerChange(channel, BANK_SELECT as never, preset.bank)
  instance.programChange(channel, preset.program)
}

function applyInstrument(): void {
  const instance = synth.value
  if (!instance) return
  // A variant the loaded bank lacks falls back to the same GM program.
  const preset = presets.value.length ? resolveInstrument(instrument.value, presets.value) : instrument.value
  selectPreset(instance, PLAY_CHANNEL, preset)
  selectPreset(instance, REFERENCE_CHANNEL, preset)
}

function watchPresets(instance: WorkletSynthesizer): void {
  instance.eventHandler.addEvent('presetListChange', 'trainer-presets', (list) => {
    presets.value = list.map((item) => ({ bank: item.bankMSB, program: item.program, name: item.name, isDrum: item.isDrum }))
    applyInstrument()
  })
}

/**
 * Loads the chosen bank under one id, so a new bank replaces the old one in memory.
 * If the choice changed during the download, the newer choice is loaded next.
 */
async function loadBank(instance: WorkletSynthesizer): Promise<void> {
  const id = bank.value
  const buffer = await fetchSoundFont(bankUrl(id))
  instance.stopAll(true)
  await instance.soundBankManager.addSoundBank(buffer, 'main')
  loadedBank = id
  // Programs bind to presets of the loaded bank: set them again.
  synth.value = instance
  applyInstrument()
  selectPreset(instance, CUE_CHANNEL, { bank: 0, program: CUE_PROGRAM })
  void checkDownloaded()
  if (bank.value !== id) await loadBank(instance)
}

function runLoading(task: () => Promise<void>): Promise<void> {
  starting ??= (async () => {
    status.value = 'loading'
    error.value = ''
    try {
      await task()
      status.value = 'ready'
    } catch (e) {
      status.value = 'error'
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      starting = null
    }
  })()
  return starting
}

/** Must run from a tap or click: browsers only start audio after a user gesture. */
function start(): Promise<void> {
  if (context && synth.value && status.value === 'ready') return context.resume()
  if (synth.value) return runLoading(() => loadBank(synth.value!))
  return runLoading(async () => {
    try {
      context = new AudioContext({ latencyHint: 'interactive' })
      // Resume right away, still inside the gesture, before the long download.
      await context.resume()
      await context.audioWorklet.addModule(processorUrl)
      const instance = new WorkletSynthesizer(context)
      instance.connect(context.destination)
      watchPresets(instance)
      await loadBank(instance)
      await instance.isReady
      synth.value = instance
      applyInstrument()
      selectPreset(instance, CUE_CHANNEL, { bank: 0, program: CUE_PROGRAM })
    } catch (e) {
      context = null
      throw e
    }
  })
}

/** Switches the bank. With sound on, the new bank loads right away; otherwise on the next start. */
function setBank(id: BankId): void {
  bank.value = bankInfo(id).id
  void checkDownloaded()
  const instance = synth.value
  if (instance && loadedBank !== bank.value && !starting) void runLoading(() => loadBank(instance))
}

function setInstrument(next: Instrument): void {
  instrument.value = { bank: next.bank, program: next.program }
  applyInstrument()
}

/** A short chord in the current instrument, so a choice in the picker is heard right away. */
function previewInstrument(): void {
  playChord(PREVIEW_NOTES, 700)
}

/** Plays notes together, like a reference chord, then releases them. */
function playChord(notes: readonly number[], durationMs = 1400): void {
  const instance = synth.value
  if (!instance) return
  notes.forEach((note) => instance.noteOn(REFERENCE_CHANNEL, note, REFERENCE_VELOCITY))
  setTimeout(() => notes.forEach((note) => instance.noteOff(REFERENCE_CHANNEL, note)), durationMs)
}

/** A short chime for right answers. Silent until sound is on; never used for mistakes. */
function playCue(kind: CueKind): void {
  const instance = synth.value
  if (!instance) return
  CUES[kind].forEach((note, i) => {
    setTimeout(() => {
      instance.noteOn(CUE_CHANNEL, note, CUE_VELOCITY)
      setTimeout(() => instance.noteOff(CUE_CHANNEL, note), CUE_LENGTH_MS)
    }, i * CUE_GAP_MS)
  })
}

// Every key from the MK4 or the virtual keyboard sounds through the same synth. Pads stay silent: they drive the game.
function routeNotes(): void {
  if (routed) return
  routed = true
  // Detached scope: lives as long as the app, not as long as the page that first asked for sound.
  effectScope(true).run(() => {
    useNoteSource().onEvent((event) => {
      const instance = synth.value
      if (!instance) return
      if (event.type === 'noteOn') instance.noteOn(PLAY_CHANNEL, event.note, event.velocity)
      else if (event.type === 'noteOff') instance.noteOff(PLAY_CHANNEL, event.note)
    })
  })
}

export function useSynth() {
  routeNotes()
  void checkDownloaded()
  return {
    status: readonly(status),
    progress: readonly(progress),
    error: readonly(error),
    instrument: readonly(instrument),
    presets: readonly(presets),
    bank: readonly(bank),
    bankSizeMb: () => bankInfo(bank.value).sizeMb,
    downloaded: readonly(downloaded),
    start,
    setInstrument,
    previewInstrument,
    setBank,
    playChord,
    playCue,
  }
}
