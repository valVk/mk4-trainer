// Practice logic for the «Песня» mode: the 25-key window, matching presses against a step,
// finding steps in time. Pure code, no Vue.

import { KEYBOARD_KEYS, fitsWindow, rangeStartFor } from './keyboard'
import type { Step } from './song'
import { pitchClass } from './theory'

/** How far ahead the window looks when it has to move (seconds). */
export const WINDOW_LOOKAHEAD_S = 8

/**
 * The 25-key window (always starting on a C) for the coming notes. It stays where it is while
 * every coming key fits, so it does not jump around; otherwise it moves to the C start that holds
 * the most coming keys, and among equals the one closest to where it was.
 */
export function chooseWindow(currentStart: number, upcomingKeys: readonly number[]): number {
  if (upcomingKeys.length === 0 || fitsWindow(upcomingKeys, currentStart)) return currentStart
  const low = Math.min(...upcomingKeys)
  const high = Math.max(...upcomingKeys)
  let best = rangeStartFor(low)
  let bestCount = -1
  // Every C start from one octave below the lowest key up to the highest key is a candidate.
  for (let start = Math.max(0, rangeStartFor(low) - 12); start <= rangeStartFor(high); start += 12) {
    const count = upcomingKeys.filter((key) => key >= start && key < start + KEYBOARD_KEYS).length
    const closer = Math.abs(start - currentStart) < Math.abs(best - currentStart)
    if (count > bestCount || (count === bestCount && closer)) {
      best = start
      bestCount = count
    }
  }
  return best
}

/** The window only has to change when a note this close does not fit (seconds of song time). */
export const WINDOW_SOON_S = 1.5

/**
 * The window while the song plays: it stays put while the notes of the next WINDOW_SOON_S fit,
 * even if later ones would not, so notes on screen do not jump to another octave mid-phrase.
 * When it has to move, it picks the start that fits the coming WINDOW_LOOKAHEAD_S best.
 */
export function followWindow(currentStart: number, steps: readonly Step[], time: number): number {
  if (fitsWindow(upcomingKeys(steps, time, WINDOW_SOON_S), currentStart)) return currentStart
  return chooseWindow(currentStart, upcomingKeys(steps, time))
}

/** Keys of the steps that start within the lookahead from `time`. */
export function upcomingKeys(steps: readonly Step[], time: number, lookahead = WINDOW_LOOKAHEAD_S): number[] {
  const keys: number[] = []
  for (let i = stepIndexAt(steps, time); i < steps.length && steps[i]!.time < time + lookahead; i++) {
    keys.push(...steps[i]!.keys)
  }
  return keys
}

/** Index of the first step at or after `time` (steps.length when none is left). */
export function stepIndexAt(steps: readonly Step[], time: number): number {
  let low = 0
  let high = steps.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (steps[middle]!.time < time - 1e-6) low = middle + 1
    else high = middle
  }
  return low
}

/**
 * Whether the presses cover the step. Exact mode needs the very keys; «любая октава» only the
 * note names. Extra keys are allowed: holding the previous chord does not block the next one.
 */
export function coversStep(step: Step, pressed: Iterable<number>, anyOctave: boolean): boolean {
  const keys = new Set(pressed)
  if (!anyOctave) return step.keys.every((key) => keys.has(key))
  const classes = new Set([...keys].map(pitchClass))
  return step.keys.every((key) => classes.has(pitchClass(key)))
}

export type OctaveHint = 'up' | 'down' | null

/**
 * When the right notes were played in the wrong octave: which way to move the MK4 octave.
 * Null when the octave is right or the notes are not the step's notes at all.
 */
export function octaveHint(step: Step, pressed: readonly number[]): OctaveHint {
  if (pressed.length === 0 || coversStep(step, pressed, false) || !coversStep(step, pressed, true)) return null
  const wanted = step.keys.reduce((sum, key) => sum + key, 0) / step.keys.length
  const played = pressed.reduce((sum, key) => sum + key, 0) / pressed.length
  return played > wanted ? 'down' : 'up'
}

/** How a part is shown above the keys: falling notes, notes on a staff, or both. */
export const SONG_VIEWS = ['fall', 'staff', 'both'] as const
export type SongView = (typeof SONG_VIEWS)[number]

/** A stored view; falling notes when nothing (or something unknown) was saved. */
export function parseSongView(value: unknown): SongView {
  return SONG_VIEWS.includes(value as SongView) ? (value as SongView) : 'fall'
}
