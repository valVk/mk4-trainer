import { useMetronome } from '@/composables/useMetronome'
import { useNoteSource } from '@/composables/useNoteSource'
import { useSynth } from '@/composables/useSynth'
import { tapInputOf, type TapInput } from '@/lib/metronome'
import type { RhythmPress } from '@/lib/rhythm'
import type { Hand } from '@/lib/rhythmLevels'

/** A press timed against what the child hears, with where it came from. */
export type TimedPress = RhythmPress & { input: TapInput, key: number | null, hand: Hand | null }

export interface TimedPressOptions {
  /** Whether presses count now (an attempt is running). */
  active: () => boolean
  /** Seconds from the first note of the task, as heard now (negative during the count-in). */
  heardPosition: () => number
  /** What a pad stands for now: a press (with its hand, when known) or nothing. */
  pad?: (pad: number) => { hand?: Hand } | null
}

/**
 * Presses during a played attempt (plan steps 17 and 19): keys, pads and the screen, each timed by the
 * moment the child heard (the input's own delay taken off), with its release, key and hand. The keys sound
 * through the synth when it is on; otherwise a soft tick answers, so every tap is heard.
 */
export function useTimedPresses(options: TimedPressOptions) {
  const metronome = useMetronome()
  const { onEvent } = useNoteSource()
  let presses: TimedPress[] = []

  const timeOf = (input: TapInput) => options.heardPosition() - metronome.latency.value[input] / 1000

  /** A tap; `velocity` only from the MK4 (the screen and computer keys always send the same). */
  function press(input: TapInput, velocity: number | null = null, from: { key?: number, hand?: Hand } = {}) {
    if (!options.active()) return
    presses.push({ time: timeOf(input), end: null, input, velocity: input === 'midi' ? velocity : null, key: from.key ?? null, hand: from.hand ?? null })
    if ((input !== 'midi' && input !== 'keys') || useSynth().status.value !== 'ready') metronome.noteAt(metronome.audioContext().currentTime, 0.12)
  }

  function release(input: TapInput, from: { key?: number, hand?: Hand } = {}) {
    if (!options.active()) return
    for (let i = presses.length - 1; i >= 0; i--) {
      const item = presses[i]!
      const same = (from.key === undefined || item.key === from.key) && (from.hand === undefined || item.hand === from.hand)
      if (item.input === input && item.end === null && same) {
        presses[i] = { ...item, end: Math.max(item.time, timeOf(input)) }
        return
      }
    }
  }

  onEvent((event) => {
    if (event.type === 'noteOn') press(tapInputOf(event), event.velocity, { key: event.note })
    else if (event.type === 'noteOff') release(event.source === 'midi' ? 'midi' : 'keys', { key: event.note })
    else if (event.type === 'pad') {
      const pad = options.pad?.(event.pad)
      // Pads have no length, so they are never checked for hold.
      if (pad) press(tapInputOf(event), event.velocity, pad)
    }
  })

  return {
    /** The presses of the attempt so far. */
    presses: (): readonly TimedPress[] => presses,
    reset: () => {
      presses = []
    },
    press,
    release,
  }
}
