import { readonly, ref, shallowRef, watch } from 'vue'
import { Sequencer } from 'spessasynth_lib'

import { useSynth } from '@/composables/useSynth'
import { gainOf, type SongMix } from '@/lib/mix'

// Song playback on the shared synthesizer: the accompaniment plays from the MIDI file,
// the learned channel is muted, and the child's keys sound on an extra channel.

/** Song channels are 0-15; the child's keys go to the first extra channel. */
export const LEARNER_CHANNEL = 16
const SONG_CHANNELS = 16

const loaded = ref(false)
const playing = ref(false)
const duration = ref(0)
const rate = ref(1)
/** Playback position in seconds, updated every animation frame while playing. */
const time = ref(0)
const sequencer = shallowRef<Sequencer | null>(null)
let frame = 0
/**
 * A seek made while paused. The sequencer lands a paused seek on the next MIDI event, not on the
 * time asked for (a seek into a stretch with no new notes jumps ahead to them), so the exact time
 * is kept here and applied again once playback runs.
 */
let pausedTarget: number | null = null
/** A place chosen before the song was loaded (sound still off): playback starts there. */
let startAt = 0
/** Volume per part of the open song (set on the song map); applied whenever the song is loaded. */
let mix: SongMix = {}

function requireSynth() {
  const synth = useSynth().getSynth()
  if (!synth) throw new Error('Sound is off: turn it on before loading a song')
  return synth
}

/**
 * A jump the sequencer has not reported yet. It runs in the audio thread and answers a frame or two
 * late: until then it still says the old place (the end of a phrase just listened to), which would end
 * the next attempt at once. Until it catches up, the target is the position.
 */
let settling: { target: number, until: number } | null = null
/** How close the sequencer must come to the target, and how long to wait for it at most. */
const SETTLE_NEAR_S = 0.25
const SETTLE_MAX_MS = 500

function position(current: Sequencer): number {
  const reported = current.currentHighResolutionTime
  if (!settling) return reported
  if (Math.abs(reported - settling.target) < SETTLE_NEAR_S || performance.now() > settling.until) {
    settling = null
    return reported
  }
  return settling.target
}

function tick() {
  const current = sequencer.value
  if (!current) return
  time.value = position(current)
  frame = requestAnimationFrame(tick)
}

function setChannelMuted(channel: number, muted: boolean): void {
  requireSynth().midiChannels[channel]?.setSystemParameter('isMuted', muted)
}

function setChannelGain(channel: number, gain: number): void {
  requireSynth().midiChannels[channel]?.setSystemParameter('gain', gain)
}

/** The song's part volumes: kept for the next load, applied at once when a song is already loaded. */
function setMix(next: SongMix): void {
  mix = next
  if (!loaded.value) return
  for (let channel = 0; channel < SONG_CHANNELS; channel++) setChannelGain(channel, gainOf(mix, channel))
}

/** Opens the song paused at the start, with every channel audible. */
async function load(binary: ArrayBuffer, fileName: string): Promise<void> {
  const synth = requireSynth()
  if (synth.midiChannels.length <= LEARNER_CHANNEL) synth.addNewChannel()
  sequencer.value ??= new Sequencer(synth, { skipToFirstNoteOn: false })
  const current = sequencer.value
  const ready = new Promise<void>((resolve) => {
    current.eventHandler.addEvent('songChange', 'song-player-load', () => resolve())
  })
  current.loadNewSongList([{ binary, fileName }])
  current.loopCount = 0
  await ready
  current.pause()
  current.currentTime = 0
  for (let channel = 0; channel < SONG_CHANNELS; channel++) {
    setChannelMuted(channel, false)
    setChannelGain(channel, gainOf(mix, channel))
  }
  duration.value = current.duration
  const start = Math.min(startAt, current.duration)
  startAt = 0
  if (start > 0) {
    current.currentTime = start
    pausedTarget = start
  }
  time.value = start
  loaded.value = true
  playing.value = false
}

function play(): void {
  const current = sequencer.value
  if (!current) return
  // Still playing when a pause was skipped: playing again would sound the held notes twice.
  if (current.paused) current.play()
  if (pausedTarget !== null) {
    // While playing, the sequencer keeps the exact time and waits for the next event.
    current.currentTime = pausedTarget
    settling = { target: pausedTarget, until: performance.now() + SETTLE_MAX_MS }
    pausedTarget = null
  }
  playing.value = true
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(tick)
}

function pause(): void {
  const current = sequencer.value
  if (!current) return
  // Sent a moment later, and not at all when play follows at once (start over while playing): a pause and a play
  // sent together race in the audio thread, whose late answer to the pause leaves the sequencer thinking it is
  // paused while the song plays on, its time then moving only once a second.
  queueMicrotask(() => {
    if (!playing.value) current.pause()
  })
  settling = null
  playing.value = false
  cancelAnimationFrame(frame)
  time.value = current.currentTime
  pausedTarget = null
}

/**
 * Moves the song. `atNote`: the time is the start of a note, where a paused seek lands exactly anyway;
 * skipping the second seek on play keeps held accompaniment notes sounding (wait-mode resumes).
 */
function seek(seconds: number, atNote = false): void {
  const current = sequencer.value
  if (!current || !loaded.value) {
    // Not loaded yet: keep the place for the first play.
    startAt = Math.max(0, seconds)
    time.value = startAt
    return
  }
  const target = Math.max(0, Math.min(seconds, current.duration))
  current.currentTime = target
  pausedTarget = playing.value || atNote ? null : target
  // Sent straight to the sequencer: it reports the new place a moment late.
  settling = pausedTarget === null ? { target, until: performance.now() + SETTLE_MAX_MS } : null
  time.value = target
}

function setRate(value: number): void {
  rate.value = value
  if (sequencer.value) sequencer.value.playbackRate = value
}

/** Leaves song mode: stops playback, unmutes channels, gives the keys back to the normal channel. */
function unload(): void {
  pause()
  const synth = useSynth().getSynth()
  if (synth) {
    for (let channel = 0; channel < SONG_CHANNELS; channel++) {
      synth.midiChannels[channel]?.setSystemParameter('isMuted', false)
      synth.midiChannels[channel]?.setSystemParameter('gain', 1)
    }
    synth.stopAll(true)
  }
  useSynth().setLearnerTarget(null)
  mix = {}
  startAt = 0
  time.value = 0
  loaded.value = false
}

/**
 * For a play button's first tap: turns the sound on (browsers only start audio from a tap) and
 * waits until the page has loaded its song. False when the sound could not start.
 */
async function ensureLoaded(): Promise<boolean> {
  if (loaded.value) return true
  const synth = useSynth()
  await synth.start()
  if (synth.status.value !== 'ready') return false
  if (!loaded.value) {
    await new Promise<void>((resolve) => {
      const stop = watch(loaded, (value) => {
        if (!value) return
        stop()
        resolve()
      })
    })
  }
  return true
}

export function useSongPlayer() {
  return {
    loaded: readonly(loaded),
    playing: readonly(playing),
    duration: readonly(duration),
    rate: readonly(rate),
    time: readonly(time),
    load,
    ensureLoaded,
    play,
    pause,
    seek,
    setRate,
    setChannelMuted,
    setMix,
    unload,
    /** Current position straight from the sequencer, for the wait-mode loop. */
    currentTime: (): number => pausedTarget ?? (sequencer.value ? position(sequencer.value) : 0),
  }
}
