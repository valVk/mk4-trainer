import { onScopeDispose, readonly, ref } from 'vue'

import { useMetronome } from '@/composables/useMetronome'
import { useSynth } from '@/composables/useSynth'
import { accentOf, beatsPerBar, type MeterId } from '@/lib/metronome'
import { countInBars, quarterSeconds, sounds, type Rhythm, type Sound } from '@/lib/rhythm'

// Plays a rhythm exercise (plan step 16): one bar of count-in clicks, then the notes with the clicks
// going on under them. Everything is scheduled at once on the audio clock (exercises are a few bars),
// and the note being heard lights up.

/** Rhythms start a moment after the tap, so the first click is never cut. */
const START_DELAY_S = 0.15
/** A rhythm sounds on the piano's C4 (the left hand of a two-hand rhythm an octave lower), not a beep. */
const RHYTHM_KEY = 60
const LOWER_KEY = 48
/** Without sound on yet, a plain tone stands in: C5 and, for the left hand, C4. */
const TONE_HZ = 523.25
const LOWER_HZ = 261.63

export function useRhythmPlayer() {
  const metronome = useMetronome()
  const synth = useSynth()
  const playing = ref(false)
  /** Index of the written note being heard now (rests included), null between notes. */
  const current = ref<number | null>(null)
  /** Audio clock time of the first note: presses are scored against it. */
  const firstNoteAt = ref(0)
  let scheduled: AudioScheduledSourceNode[] = []
  /** Piano notes waiting or sounding, to stop them when the rhythm stops. */
  let pianoStops: (() => void)[] = []

  /** One note: on the piano when the sound is on, else a plain tone. */
  function note(at: number, length: number, key: number, hz: number) {
    const stop = synth.playNoteAt(key, at, length)
    if (stop) pianoStops.push(stop)
    else scheduled.push(...metronome.noteAt(at, length, hz))
  }
  let heard: Sound[] = []
  let frame = 0

  function follow() {
    const time = metronome.heardTime() - firstNoteAt.value
    const sound = heard.find((item) => time >= item.start && time < item.start + item.length)
    current.value = sound ? sound.index : null
    const last = heard[heard.length - 1]
    if (last && time > last.start + last.length + 0.1) {
      stop()
      return
    }
    frame = requestAnimationFrame(follow)
  }

  /**
   * Plays the rhythm at `bpm` (beats of its meter, like the metronome) after `countInBars` bars of clicks: by
   * default enough bars for the countdown (three seconds), one at least.
   * With `notes: false` only the clicks sound: the child plays the notes. `lower` is a second hand,
   * heard an octave lower.
   */
  function play(rhythm: Rhythm, bpm: number, { countInBars: bars, notes = true, lower = null }: { countInBars?: number, notes?: boolean, lower?: Rhythm | null } = {}) {
    stop()
    const audio = metronome.audioContext()
    void audio.resume()
    const meterId = `${rhythm.meter.numerator}/${rhythm.meter.denominator}` as MeterId
    const beats = beatsPerBar(meterId)
    const beat = quarterSeconds(bpm, rhythm.meter) * (4 / rhythm.meter.denominator)
    const start = audio.currentTime + START_DELAY_S
    heard = sounds(rhythm, bpm)
    const length = heard.reduce((end, item) => Math.max(end, item.start + item.length), 0)
    // A pickup starts inside the count-in bar: the count-in still begins on beat 1.
    const pickup = (rhythm.pickup ?? 0) * quarterSeconds(bpm, rhythm.meter)
    const countIn = bars ?? countInBars(beats * beat)
    firstNoteAt.value = start + countIn * beats * beat - pickup
    const clicks = Math.round((firstNoteAt.value - start + length) / beat)
    for (let i = 0; i < clicks; i++) scheduled.push(...metronome.clickAt(start + i * beat, accentOf(i % beats, beats)))
    if (notes) {
      for (const item of heard) {
        // A melody sounds at its own pitches; a rhythm on the piano's C.
        const key = item.key ?? RHYTHM_KEY
        if (!item.rest) note(firstNoteAt.value + item.start, item.length, key, item.key === undefined ? TONE_HZ : 440 * 2 ** ((key - 69) / 12))
      }
      for (const item of lower ? sounds(lower, bpm) : []) {
        if (!item.rest) note(firstNoteAt.value + item.start, item.length, LOWER_KEY, LOWER_HZ)
      }
    }
    playing.value = true
    frame = requestAnimationFrame(follow)
  }

  function stop() {
    cancelAnimationFrame(frame)
    const now = metronome.audioContext().currentTime
    for (const source of scheduled) {
      try {
        source.stop(now)
      } catch {
        // Already finished.
      }
    }
    scheduled = []
    pianoStops.forEach((stopNote) => stopNote())
    pianoStops = []
    playing.value = false
    current.value = null
  }

  onScopeDispose(stop)

  /** Song-like time of the rhythm as heard now: seconds from its first note (negative during the count-in). */
  const heardPosition = () => metronome.heardTime() - firstNoteAt.value

  return { play, stop, heardPosition, playing: readonly(playing), current: readonly(current), firstNoteAt: readonly(firstNoteAt) }
}
