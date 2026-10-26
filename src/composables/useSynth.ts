import { effectScope, readonly, ref, shallowRef } from 'vue'
import { WorkletSynthesizer } from 'spessasynth_lib'
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url'

import { useNoteSource } from '@/composables/useNoteSource'

// SoundFont lives in public/soundfonts (not in git, see NOTICE). Swapping the file needs no code changes.
export const SOUNDFONT_URL = `${import.meta.env.BASE_URL}soundfonts/MuseScore_General.sf3`
const SOUNDFONT_CACHE = 'soundfonts'

// General MIDI programs offered in the instrument picker.
export const INSTRUMENTS = [
  { id: 'piano', program: 0 },
  { id: 'epiano', program: 4 },
  { id: 'organ', program: 19 },
  { id: 'strings', program: 48 },
  { id: 'pad', program: 88 },
  { id: 'bass', program: 33 },
] as const

export type InstrumentId = (typeof INSTRUMENTS)[number]['id']
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
const CUE_LENGTH_MS = 400

export type CueKind = keyof typeof CUES

const status = ref<SynthStatus>('off')
const progress = ref(0)
const error = ref('')
const instrument = ref<InstrumentId>('piano')
const downloaded = ref(false)
const synth = shallowRef<WorkletSynthesizer | null>(null)
let context: AudioContext | null = null
let starting: Promise<void> | null = null
let routed = false

/** Reads the SoundFont with download progress; the service worker serves it from cache next time. */
async function fetchSoundFont(): Promise<ArrayBuffer> {
  const response = await fetch(SOUNDFONT_URL)
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
    if ('caches' in window) downloaded.value = !!(await caches.match(SOUNDFONT_URL, { cacheName: SOUNDFONT_CACHE }))
  } catch {
    downloaded.value = false
  }
}

function applyInstrument(): void {
  const program = INSTRUMENTS.find((item) => item.id === instrument.value)?.program ?? 0
  synth.value?.programChange(PLAY_CHANNEL, program)
  synth.value?.programChange(REFERENCE_CHANNEL, program)
}

/** Must run from a tap or click: browsers only start audio after a user gesture. */
function start(): Promise<void> {
  if (context && status.value === 'ready') return context.resume()
  starting ??= (async () => {
    status.value = 'loading'
    error.value = ''
    progress.value = 0
    try {
      context = new AudioContext({ latencyHint: 'interactive' })
      // Resume right away, still inside the gesture, before the long download.
      await context.resume()
      await context.audioWorklet.addModule(processorUrl)
      const instance = new WorkletSynthesizer(context)
      instance.connect(context.destination)
      await instance.soundBankManager.addSoundBank(await fetchSoundFont(), 'main')
      await instance.isReady
      synth.value = instance
      applyInstrument()
      instance.programChange(CUE_CHANNEL, CUE_PROGRAM)
      status.value = 'ready'
      void checkDownloaded()
    } catch (e) {
      status.value = 'error'
      error.value = e instanceof Error ? e.message : String(e)
      context = null
    } finally {
      starting = null
    }
  })()
  return starting
}

function setInstrument(id: InstrumentId): void {
  instrument.value = id
  applyInstrument()
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
    downloaded: readonly(downloaded),
    start,
    setInstrument,
    playChord,
    playCue,
  }
}
