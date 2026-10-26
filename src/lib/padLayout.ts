// Playing a part on the 8 MK4 pads instead of the keys: which note each pad plays.
// Pure code, no Vue, no UI text.

import type { Part, Step } from './song'

export const PAD_SLOTS = 8

/** GM drum sounds the trainer names; others are "drum N". */
export type DrumKind = 'kick' | 'snare' | 'clap' | 'hihatClosed' | 'hihatPedal' | 'hihatOpen' | 'crash' | 'ride' | 'rideBell' | 'tom' | 'tambourine' | 'cowbell' | 'other'

const DRUM_KINDS: Record<number, DrumKind> = {
  35: 'kick', 36: 'kick',
  37: 'snare', 38: 'snare', 40: 'snare',
  39: 'clap',
  42: 'hihatClosed', 44: 'hihatPedal', 46: 'hihatOpen',
  49: 'crash', 52: 'crash', 55: 'crash', 57: 'crash',
  51: 'ride', 59: 'ride', 53: 'rideBell',
  41: 'tom', 43: 'tom', 45: 'tom', 47: 'tom', 48: 'tom', 50: 'tom',
  54: 'tambourine', 56: 'cowbell',
}

export function drumKind(key: number): DrumKind {
  return DRUM_KINDS[key] ?? 'other'
}

/** Where a drummer expects each sound: pad numbers are 1-based, as printed on the MK4. */
const DRUM_HOME: Partial<Record<DrumKind, number[]>> = {
  kick: [1],
  snare: [2],
  clap: [2],
  hihatClosed: [3],
  hihatPedal: [3],
  hihatOpen: [4],
  crash: [5],
  ride: [6],
  rideBell: [6],
  tom: [7, 8],
}

export interface PadLayout {
  /** Note for pads 1-8 (index 0-7); null for an unused pad. */
  padKeys: (number | null)[]
  /** Pad number (1-based) for each note of the part. */
  padOf: Map<number, number>
}

function frequencies(part: Pick<Part, 'notes'>): Map<number, number> {
  const counts = new Map<number, number>()
  for (const note of part.notes) counts.set(note.key, (counts.get(note.key) ?? 0) + 1)
  return counts
}

/** Shortest time a pad note is drawn and its pad lit: drum hits are often only a few milliseconds long. */
export const PAD_NOTE_MIN_S = 0.3

/**
 * The pad layout for a part, or null when it uses more than 8 different notes.
 * Melodic parts: notes from low to high on pads 1-8. Drums: each sound on its usual pad
 * (most frequent first), anything else on the free pads.
 */
export function padLayout(part: Pick<Part, 'notes' | 'isDrum'>): PadLayout | null {
  const counts = frequencies(part)
  if (counts.size === 0 || counts.size > PAD_SLOTS) return null
  const padKeys: (number | null)[] = Array.from({ length: PAD_SLOTS }, () => null)

  if (!part.isDrum) {
    ;[...counts.keys()].sort((a, b) => a - b).forEach((key, index) => {
      padKeys[index] = key
    })
  } else {
    const byUse = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([key]) => key)
    const leftovers: number[] = []
    for (const key of byUse) {
      const home = (DRUM_HOME[drumKind(key)] ?? []).find((pad) => padKeys[pad - 1] === null)
      if (home) padKeys[home - 1] = key
      else leftovers.push(key)
    }
    for (const key of leftovers) {
      const free = padKeys.indexOf(null)
      padKeys[free] = key
    }
  }

  const padOf = new Map<number, number>()
  padKeys.forEach((key, index) => {
    if (key !== null) padOf.set(key, index + 1)
  })
  return { padKeys, padOf }
}

/** The part's steps as pads to hit together (pad numbers instead of notes). */
export function padSteps(steps: readonly Step[], layout: PadLayout): { time: number, pads: number[] }[] {
  return steps.map((step) => ({ time: step.time, pads: [...new Set(step.keys.map((key) => layout.padOf.get(key)!))].sort((a, b) => a - b) }))
}
