import { computed, effectScope, readonly, ref } from 'vue'

import { useNoteSource } from '@/composables/useNoteSource'
import { padsPlayMusic } from '@/composables/usePadActions'
import { useSynth } from '@/composables/useSynth'
import {
  CALIBRATION_TAPS,
  DEFAULT_METRONOME,
  LATENCY_HISTORY,
  accentOf,
  beatSeconds,
  beatsPerBar,
  clampBpm,
  combinedLatency,
  estimateLatency,
  firstBeatFrom,
  tapInputOf,
  type Accent,
  type LatencyEstimate,
  type LatencyHistories,
  type MetronomeSettings,
  type TapInput,
  type SongBeat,
} from '@/lib/metronome'

// Metronome (plan step 15). Clicks are scheduled ahead on the shared audio clock (look-ahead),
// not fired by timers, so they stay even when the page is busy. Sounds are made here,
// so the metronome works before the SoundFont is downloaded.

/** How far ahead clicks are scheduled, and how often the scheduler wakes up. */
const LOOKAHEAD_S = 0.12
const TICK_MS = 25
/** Calibration runs at a calm, fixed tempo whatever the metronome is set to. */
const CALIBRATION_BPM = 80
/** First the child only listens, to catch the beat; taps before this are ignored (seconds). */
const CALIBRATION_LISTEN_S = 5
/** Calibration gives up when the first tap does not come within this many beats after listening. */
const CALIBRATION_WAIT_BEATS = 30
/** After the first tap, calibration gives up when enough taps do not come within this many beats. */
const CALIBRATION_TAP_BEATS = CALIBRATION_TAPS + 6
/** A song position this far from the expected one is a jump, not jitter (seconds). */
const FOLLOW_JUMP_S = 0.03

const PITCH: Record<Accent, number> = { strong: 1.5, medium: 1.22, weak: 1 }
const LEVEL: Record<Accent, number> = { strong: 1, medium: 0.75, weak: 0.55 }

interface Scheduled {
  time: number
  beat: number
  countIn: boolean
}

/** A song to follow: clicks land on its beats, at its position and speed, only while it plays. */
export interface FollowSource {
  beats: readonly SongBeat[]
  position: () => number
  rate: () => number
  playing: () => boolean
}

const settings = ref<MetronomeSettings>({ ...DEFAULT_METRONOME })
/** Added to every tap before it is scored: how late this child's taps arrive (ms), from calibration. */
/** Delays of the last successful checks per input, newest last. */
const latencyHistories = ref<LatencyHistories>({ screen: [], midi: [], keys: [] })
const latency = computed<Record<TapInput, number>>(() => ({
  screen: combinedLatency(latencyHistories.value.screen),
  midi: combinedLatency(latencyHistories.value.midi),
  keys: combinedLatency(latencyHistories.value.keys),
}))
const running = ref(false)
/** Beat being heard now, from 0; -1 when silent. */
const beat = ref(-1)
const beatCount = ref(beatsPerBar(DEFAULT_METRONOME.meter))
const countingIn = ref(false)
const calibrating = ref(false)
const calibrationTaps = ref(0)
/** Seconds left to listen before tapping starts; 0 once taps count. */
const calibrationCountdown = ref(0)
const calibrationResult = ref<(LatencyEstimate & { input: TapInput }) | null | 'failed'>(null)
/** Input of the first counted tap; taps from other inputs do not count in this check. */
let calibrationInput: TapInput | null = null

let master: GainNode | null = null
let timer: ReturnType<typeof setInterval> | null = null
let frame = 0
let queue: Scheduled[] = []
let nextTime = 0
let nextBeat = 0
let countInLeft = 0
let follow: FollowSource | null = null
let followIndex = -1
let followAnchor: number | null = null
let followRate = 1
let calibrationClicks: number[] = []
let calibrationTapTimes: number[] = []
/** Beats after the listening part, and beats since the first tap. */
let calibrationBeats = 0
let beatsSinceFirstTap = 0
/** Audio time when listening ends and taps start to count. */
let listenUntil = 0
let listening = false

const context = () => useSynth().audioContext()

function output(audio: AudioContext): GainNode {
  if (!master || master.context !== audio) {
    master = audio.createGain()
    master.connect(audio.destination)
  }
  master.gain.setTargetAtTime(settings.value.volume, audio.currentTime, 0.01)
  return master
}

function envelope(audio: AudioContext, time: number, level: number, decay: number): GainNode {
  const gain = audio.createGain()
  gain.gain.setValueAtTime(0.0001, time)
  gain.gain.exponentialRampToValueAtTime(level, time + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.0001, time + decay)
  gain.connect(output(audio))
  return gain
}

/** Clicks scheduled but maybe not yet heard, so a pause or a jump in the song can take them back. */
let pending: { time: number, sources: AudioScheduledSourceNode[] }[] = []

function tone(audio: AudioContext, type: OscillatorType, frequency: number, time: number, length: number, target: AudioNode): OscillatorNode {
  const oscillator = audio.createOscillator()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, time)
  oscillator.connect(target)
  oscillator.start(time)
  oscillator.stop(time + length)
  return oscillator
}

/** Short click, wood block or cowbell; the strong beat is higher and louder. */
function playClick(time: number, accent: Accent): AudioScheduledSourceNode[] {
  const audio = context()
  const pitch = PITCH[accent]
  const level = LEVEL[accent]
  const sources: AudioScheduledSourceNode[] = []
  switch (settings.value.sound) {
    case 'click': {
      sources.push(tone(audio, 'square', 1000 * pitch, time, 0.05, envelope(audio, time, level * 0.35, 0.03)))
      break
    }
    case 'wood': {
      const oscillator = tone(audio, 'triangle', 1700 * pitch, time, 0.08, envelope(audio, time, level, 0.07))
      oscillator.frequency.exponentialRampToValueAtTime(900 * pitch, time + 0.05)
      sources.push(oscillator)
      break
    }
    case 'cowbell': {
      const filter = audio.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1400 * pitch
      filter.connect(envelope(audio, time, level * 0.6, 0.25))
      sources.push(tone(audio, 'square', 540 * pitch, time, 0.3, filter), tone(audio, 'square', 800 * pitch, time, 0.3, filter))
      break
    }
  }
  pending = pending.filter((item) => item.time > audio.currentTime)
  pending.push({ time, sources })
  return sources
}

/** Pitch of a rhythm note: a soft C5, clearly apart from the clicks. */
const NOTE_HZ = 523.25

/**
 * One note of a rhythm exercise. It sounds for the note's length, so a half note is heard as long as
 * it is, and fades a little before the end so repeated notes stay apart.
 */
function playNote(time: number, length: number, hz = NOTE_HZ): AudioScheduledSourceNode[] {
  const audio = context()
  const gain = audio.createGain()
  const end = time + Math.max(0.06, length * 0.9)
  gain.gain.setValueAtTime(0.0001, time)
  gain.gain.exponentialRampToValueAtTime(0.5, time + 0.008)
  gain.gain.setTargetAtTime(0.3, time + 0.05, 0.1)
  gain.gain.setTargetAtTime(0.0001, end - 0.04, 0.015)
  gain.connect(output(audio))
  const sources = [tone(audio, 'triangle', hz, time, end - time + 0.05, gain)]
  pending.push({ time, sources })
  return sources
}

/** Silences clicks that have not started yet. */
function cancelPending(): void {
  if (pending.length === 0) return
  const now = context().currentTime
  for (const item of pending) {
    if (item.time > now) item.sources.forEach((source) => source.stop())
  }
  pending = []
  queue = queue.filter((item) => item.time <= now)
}

/** The audio clock time that is coming out of the speakers right now. */
function heardTime(audio = context()): number {
  const stamp = audio.getOutputTimestamp?.()
  if (stamp?.contextTime && stamp.performanceTime) return stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000
  return audio.currentTime - (audio.outputLatency || audio.baseLatency || 0)
}

function scheduleFree(audio: AudioContext): void {
  const bpm = calibrating.value ? CALIBRATION_BPM : settings.value.bpm
  const beats = calibrating.value ? 4 : beatsPerBar(settings.value.meter)
  beatCount.value = beats
  while (nextTime < audio.currentTime + LOOKAHEAD_S) {
    const current = nextBeat % beats
    playClick(nextTime, accentOf(current, beats))
    const listening = calibrating.value && nextTime < listenUntil
    queue.push({ time: nextTime, beat: current, countIn: countInLeft > 0 || listening })
    if (calibrating.value) {
      calibrationClicks.push(nextTime)
      if (!listening) calibrationBeats++
      if (calibrationTapTimes.length > 0) beatsSinceFirstTap++
    }
    if (countInLeft > 0) countInLeft--
    nextBeat = current + 1
    nextTime += beatSeconds(bpm)
  }
}

function scheduleFollow(audio: AudioContext, source: FollowSource): void {
  if (!source.playing()) {
    if (followAnchor !== null) cancelPending()
    followAnchor = null
    return
  }
  const position = source.position()
  const rate = source.rate() || 1
  // Audio time of the song's start at this speed. Reading the position jitters by a few ms,
  // so the anchor is kept until the song really jumps (seek, a new phrase) or changes speed.
  const anchor = audio.currentTime - position / rate
  if (followAnchor === null || rate !== followRate || Math.abs(anchor - followAnchor) > FOLLOW_JUMP_S) {
    if (followAnchor !== null) cancelPending()
    followAnchor = anchor
    followRate = rate
    followIndex = firstBeatFrom(source.beats, position)
  }
  while (followIndex < source.beats.length) {
    const item = source.beats[followIndex]!
    const at = followAnchor + item.time / rate
    if (at > audio.currentTime + LOOKAHEAD_S) break
    if (at >= audio.currentTime) {
      playClick(at, item.accent)
      queue.push({ time: at, beat: item.beat, countIn: false })
    }
    followIndex++
  }
}

function tick(): void {
  const audio = context()
  if (follow) scheduleFollow(audio, follow)
  else scheduleFree(audio)
  if (!calibrating.value) return
  if (calibrationTapTimes.length === 0 ? calibrationBeats >= CALIBRATION_WAIT_BEATS : beatsSinceFirstTap >= CALIBRATION_TAP_BEATS) finishCalibration()
}

function draw(): void {
  const heard = heardTime()
  while (queue.length > 1 && queue[1]!.time <= heard) queue.shift()
  const current = queue[0]
  if (current && current.time <= heard) {
    beat.value = current.beat
    countingIn.value = current.countIn
  }
  if (calibrating.value) calibrationCountdown.value = Math.max(0, Math.ceil(listenUntil - heard))
  frame = requestAnimationFrame(draw)
}

function startLoop(): void {
  stopLoop()
  queue = []
  timer = setInterval(tick, TICK_MS)
  tick()
  frame = requestAnimationFrame(draw)
  running.value = true
}

function stopLoop(): void {
  cancelPending()
  if (timer) clearInterval(timer)
  timer = null
  cancelAnimationFrame(frame)
  queue = []
  running.value = false
  beat.value = -1
  countingIn.value = false
}

/** Starts at the set tempo; `countInBars` bars of count-in come first. Must run from a tap or click. */
function start(options: { countInBars?: number } = {}): void {
  const audio = context()
  void audio.resume()
  follow = null
  nextTime = audio.currentTime + 0.1
  nextBeat = 0
  countInLeft = (options.countInBars ?? 0) * beatsPerBar(settings.value.meter)
  startLoop()
}

function stop(): void {
  if (calibrating.value) cancelCalibration()
  follow = null
  stopLoop()
}

function toggle(): void {
  if (running.value) stop()
  else start()
}

/** Clicks on a song's beats while it plays (song mode); null stops following. */
function followSong(source: FollowSource | null): void {
  stop()
  if (!source) return
  void context().resume()
  follow = source
  followIndex = -1
  followAnchor = null
  beatCount.value = Math.max(1, ...source.beats.slice(0, 16).map((item) => item.beat + 1))
  startLoop()
}

function update(next: Partial<MetronomeSettings>): void {
  settings.value = { ...settings.value, ...next, bpm: clampBpm(next.bpm ?? settings.value.bpm) }
  if (master) master.gain.setTargetAtTime(settings.value.volume, master.context.currentTime, 0.01)
}

function setLatencyHistories(histories: LatencyHistories): void {
  latencyHistories.value = {
    screen: histories.screen.slice(-LATENCY_HISTORY),
    midi: histories.midi.slice(-LATENCY_HISTORY),
    keys: histories.keys.slice(-LATENCY_HISTORY),
  }
}

function addLatency(input: TapInput, ms: number): void {
  setLatencyHistories({ ...latencyHistories.value, [input]: [...latencyHistories.value[input], Math.round(ms)] })
}

/** A tap from the screen button or any key/pad during calibration; ignored while the child is still listening. */
function tap(input: TapInput): void {
  if (!calibrating.value) return
  const time = heardTime()
  if (time < listenUntil) return
  calibrationInput ??= input
  if (input !== calibrationInput) return
  // Measuring starts with the first tap: the beats before it are not counted against the child.
  if (calibrationTapTimes.length === 0) beatsSinceFirstTap = 0
  calibrationTapTimes.push(time)
  calibrationTaps.value = calibrationTapTimes.length
  if (calibrationTapTimes.length >= CALIBRATION_TAPS) finishCalibration()
}

function listenForTaps(): void {
  if (listening) return
  listening = true
  // Detached scope: lives as long as the app, like the synth's own note routing.
  effectScope(true).run(() => {
    useNoteSource().onEvent((event) => {
      if (event.type === 'noteOn' || event.type === 'pad') tap(tapInputOf(event))
    })
  })
}

/**
 * Plays 80 BPM in 4/4. The child listens for 5 seconds with a countdown, then taps along
 * on a key, a pad or the screen; measuring starts at the first tap.
 */
function startCalibration(): void {
  listenForTaps()
  stop()
  calibrating.value = true
  calibrationTaps.value = 0
  calibrationResult.value = null
  calibrationClicks = []
  calibrationTapTimes = []
  calibrationBeats = 0
  beatsSinceFirstTap = 0
  calibrationInput = null
  // Pads tap along instead of switching pages.
  padsPlayMusic.value = true
  const audio = context()
  void audio.resume()
  follow = null
  nextTime = audio.currentTime + 0.1
  nextBeat = 0
  countInLeft = 0
  listenUntil = nextTime + CALIBRATION_LISTEN_S
  calibrationCountdown.value = CALIBRATION_LISTEN_S
  startLoop()
}

function finishCalibration(): void {
  if (!calibrating.value) return
  calibrating.value = false
  padsPlayMusic.value = false
  const estimate = estimateLatency(calibrationTapTimes, calibrationClicks)
  const input = calibrationInput ?? 'screen'
  calibrationResult.value = estimate ? { ...estimate, input } : 'failed'
  if (estimate?.steady) addLatency(input, estimate.offsetMs)
  stopLoop()
}

function cancelCalibration(): void {
  if (!calibrating.value) return
  calibrating.value = false
  padsPlayMusic.value = false
  calibrationResult.value = null
  stopLoop()
}

// Development only: when this file is swapped in, the old copy's timer would keep clicking on its own.
import.meta.hot?.dispose(() => stopLoop())

export function useMetronome() {
  return {
    settings: readonly(settings),
    /** Delay to add to taps from each input (ms), the median of its last checks. */
    latency,
    latencyHistories: readonly(latencyHistories),
    running: readonly(running),
    beat: readonly(beat),
    beatCount: readonly(beatCount),
    countingIn: readonly(countingIn),
    calibrating: readonly(calibrating),
    calibrationTaps: readonly(calibrationTaps),
    calibrationCountdown: readonly(calibrationCountdown),
    calibrationResult: readonly(calibrationResult),
    start,
    stop,
    toggle,
    followSong,
    update,
    setLatencyHistories,
    resetLatency: () => setLatencyHistories({ screen: [], midi: [], keys: [] }),
    tap,
    startCalibration,
    cancelCalibration,
    /** Audio clock time being heard now, for scoring taps (step 16). */
    heardTime: (): number => heardTime(),
    /** Schedules one click or one rhythm note on the audio clock; returns the sounds, so a player can stop them. */
    clickAt: (time: number, accent: Accent): AudioScheduledSourceNode[] => playClick(time, accent),
    /** `hz`: pitch; the left hand of a two-hand rhythm sounds an octave lower. */
    noteAt: (time: number, length: number, hz?: number): AudioScheduledSourceNode[] => playNote(time, length, hz),
    audioContext: context,
    /**
     * How long ago, in real seconds, the child heard the moment a press from this input stands for:
     * the sound is still on its way to the speakers, and the press arrives late by the input's delay.
     */
    pressDelay: (input: TapInput): number => Math.max(0, context().currentTime - heardTime()) + latency.value[input] / 1000,
  }
}
