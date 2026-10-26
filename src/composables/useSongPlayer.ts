import { readonly, ref, shallowRef } from 'vue'
import { Sequencer } from 'spessasynth_lib'

import { useSynth } from '@/composables/useSynth'

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

function requireSynth() {
  const synth = useSynth().getSynth()
  if (!synth) throw new Error('Sound is off: turn it on before loading a song')
  return synth
}

function tick() {
  const current = sequencer.value
  if (!current) return
  time.value = current.currentHighResolutionTime
  frame = requestAnimationFrame(tick)
}

function setChannelMuted(channel: number, muted: boolean): void {
  requireSynth().midiChannels[channel]?.setSystemParameter('isMuted', muted)
}

function setChannelGain(channel: number, gain: number): void {
  requireSynth().midiChannels[channel]?.setSystemParameter('gain', gain)
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
    setChannelGain(channel, 1)
  }
  duration.value = current.duration
  time.value = 0
  loaded.value = true
  playing.value = false
}

function play(): void {
  const current = sequencer.value
  if (!current) return
  current.play()
  playing.value = true
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(tick)
}

function pause(): void {
  const current = sequencer.value
  if (!current) return
  current.pause()
  playing.value = false
  cancelAnimationFrame(frame)
  time.value = current.currentTime
}

function seek(seconds: number): void {
  const current = sequencer.value
  if (!current) return
  current.currentTime = Math.max(0, Math.min(seconds, current.duration))
  time.value = current.currentTime
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
  loaded.value = false
}

export function useSongPlayer() {
  return {
    loaded: readonly(loaded),
    playing: readonly(playing),
    duration: readonly(duration),
    rate: readonly(rate),
    time: readonly(time),
    load,
    play,
    pause,
    seek,
    setRate,
    setChannelMuted,
    setChannelGain,
    unload,
    /** Current position straight from the sequencer, for the wait-mode loop. */
    currentTime: (): number => sequencer.value?.currentHighResolutionTime ?? 0,
  }
}
