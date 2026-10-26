// On-screen keyboard geometry: the same 25 keys as the MK4 (two octaves plus one note).

import { pitchClass } from './theory'

export const KEYBOARD_KEYS = 25
const LAST_START = 127 - (KEYBOARD_KEYS - 1)

const BLACK_KEYS: ReadonlySet<number> = new Set([1, 3, 6, 8, 10])

export function isBlackKey(note: number): boolean {
  return BLACK_KEYS.has(pitchClass(note))
}

/** Lowest C at or below the note, kept inside the MIDI range. */
export function rangeStartFor(note: number): number {
  return Math.min(LAST_START - pitchClass(LAST_START), Math.max(0, note - pitchClass(note)))
}

/**
 * Where the keyboard should start now. It stays put while every held note fits,
 * so it does not jump around on each release; it moves only when a note falls outside.
 */
export function followRange(currentStart: number, held: readonly number[]): number {
  if (held.length === 0) return currentStart
  const lowest = Math.min(...held)
  const highest = Math.max(...held)
  const end = currentStart + KEYBOARD_KEYS - 1
  if (lowest >= currentStart && highest <= end) return currentStart
  return rangeStartFor(lowest)
}

export interface KeyboardKey {
  note: number
  black: boolean
  /** White keys: index among white keys. Black keys: index of the white key to their right. */
  whiteIndex: number
}

export function keyboardKeys(start: number, count = KEYBOARD_KEYS): KeyboardKey[] {
  const keys: KeyboardKey[] = []
  let whites = 0
  for (let note = start; note < start + count; note++) {
    const black = isBlackKey(note)
    keys.push({ note, black, whiteIndex: whites })
    if (!black) whites++
  }
  return keys
}
