import { onScopeDispose, readonly, ref } from 'vue'

import { useMetronome } from '@/composables/useMetronome'
import { accentOf, beatsPerBar, type MeterId } from '@/lib/metronome'
import { countInBars, quarterSeconds, sounds, type Rhythm, type Sound } from '@/lib/rhythm'

// Plays a rhythm exercise (plan step 16): one bar of count-in clicks, then the notes with the clicks
// going on under them. Everything is scheduled at once on the audio clock (exercises are a few bars),
// and the note being heard lights up.

/** Rhythms start a moment after the tap, so the first click is never cut. */
const START_DELAY_S = 0.15
/** The left hand of a two-hand rhythm: an octave under the right hand's C5. */
const LOWER_HZ = 261.63

export function useRhythmPlayer() {
  const metronome = useMetronome()
  const playing = ref(false)
  /** Index of the written note being heard now (rests included), null between notes. */
  const current = ref<number | null>(null)
  /** Audio clock time of the first note: presses are scored against it. */
  const firstNoteAt = ref(0)
  let scheduled: AudioScheduledSourceNode[] = []
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
        // A melody sounds at its own pitches; a rhythm on the metronome's note.
        if (!item.rest) scheduled.push(...metronome.noteAt(firstNoteAt.value + item.start, item.length, item.key === undefined ? undefined : 440 * 2 ** ((item.key - 69) / 12)))
      }
      for (const item of lower ? sounds(lower, bpm) : []) {
        if (!item.rest) scheduled.push(...metronome.noteAt(firstNoteAt.value + item.start, item.length, LOWER_HZ))
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
    playing.value = false
    current.value = null
  }

  onScopeDispose(stop)

  /** Song-like time of the rhythm as heard now: seconds from its first note (negative during the count-in). */
  const heardPosition = () => metronome.heardTime() - firstNoteAt.value

  return { play, stop, heardPosition, playing: readonly(playing), current: readonly(current), firstNoteAt: readonly(firstNoteAt) }
}
