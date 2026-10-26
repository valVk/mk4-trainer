// How a musician breaks a song down: phrases of a part (repeats counted once), sections of the song,
// and which part to learn first. Pure code, no Vue, no UI text.

import { barActivity, type Part, type Song, type Step } from './song'

/** A phrase is normally 4 bars; denser ones are cut to 2 bars. */
export const PHRASE_BARS = 4
/** More steps than this in a 4-bar phrase: cut it in two. */
export const DENSE_STEPS = 16
/** Rhythm grid for comparing phrases: 16 positions per bar. */
const GRID_PER_BAR = 16
/** Sections shorter than this many bars are merged into the previous one. */
export const MIN_SECTION_BARS = 4

export interface Phrase {
  /** Position in the part, 0-based. */
  index: number
  startBar: number
  /** Exclusive. */
  endBar: number
  /** Seconds. */
  start: number
  end: number
  steps: Step[]
  /** Phrases with the same rhythm and intervals share a group (the riff played again, maybe moved up or down). */
  group: number
  /** Semitones from the group's first phrase (0 for an exact repeat). */
  transpose: number
  /** The first time this group appears: the one to learn. */
  isNew: boolean
}

/**
 * Rhythm and intervals of a phrase, independent of its start time and pitch:
 * every step as "grid position:keys relative to the phrase's first key".
 */
export function phraseSignature(steps: readonly Step[], bars: readonly number[], startBar: number): { signature: string, base: number } {
  if (steps.length === 0) return { signature: '', base: 0 }
  const base = steps[0]!.keys[0]!
  const parts = steps.map((step) => {
    const position = gridPosition(step.time, bars, startBar)
    return `${position}:${step.keys.map((key) => key - base).join('.')}`
  })
  return { signature: parts.join('|'), base }
}

/** Step time as a 16th-of-a-bar position counted from the phrase's first bar. */
function gridPosition(time: number, bars: readonly number[], startBar: number): number {
  let bar = startBar
  while (bar + 1 < bars.length - 1 && bars[bar + 1]! <= time) bar++
  const barStart = bars[bar]!
  const barLength = (bars[bar + 1] ?? barStart + 2) - barStart
  return (bar - startBar) * GRID_PER_BAR + Math.round(((time - barStart) / barLength) * GRID_PER_BAR)
}

/** Runs of consecutive bars where the part plays; a silent bar or more ends a run. */
export function activeRuns(active: readonly boolean[]): { start: number, end: number }[] {
  const runs: { start: number, end: number }[] = []
  active.forEach((on, bar) => {
    if (!on) return
    const last = runs[runs.length - 1]
    if (last && last.end === bar) last.end = bar + 1
    else runs.push({ start: bar, end: bar + 1 })
  })
  return runs
}

/**
 * Phrases of a part: runs split at rests of a bar or longer, then cut into 4-bar phrases
 * (2-bar when dense), on bar lines. Repeats are grouped so each pattern is learned once.
 */
export function partPhrases(part: Pick<Part, 'notes' | 'steps'>, bars: readonly number[]): Phrase[] {
  const runs = activeRuns(barActivity(part, bars))
  const stepsIn = (startBar: number, endBar: number) =>
    part.steps.filter((step) => step.time >= bars[startBar]! - 1e-6 && step.time < bars[endBar]! - 1e-6)

  const ranges: { startBar: number, endBar: number }[] = []
  for (const run of runs) {
    for (let bar = run.start; bar < run.end; bar += PHRASE_BARS) {
      const end = Math.min(run.end, bar + PHRASE_BARS)
      if (stepsIn(bar, end).length > DENSE_STEPS && end - bar > 2) {
        ranges.push({ startBar: bar, endBar: bar + 2 }, { startBar: bar + 2, endBar: end })
      } else {
        ranges.push({ startBar: bar, endBar: end })
      }
    }
  }

  const groups = new Map<string, { id: number, base: number }>()
  const phrases: Phrase[] = []
  for (const range of ranges) {
    const steps = stepsIn(range.startBar, range.endBar)
    if (steps.length === 0) continue
    const { signature, base } = phraseSignature(steps, bars, range.startBar)
    const key = `${range.endBar - range.startBar}#${signature}`
    let group = groups.get(key)
    const isNew = !group
    if (!group) {
      group = { id: groups.size, base }
      groups.set(key, group)
    }
    phrases.push({
      index: phrases.length,
      startBar: range.startBar,
      endBar: range.endBar,
      start: bars[range.startBar]!,
      end: bars[range.endBar]!,
      steps,
      group: group.id,
      transpose: base - group.base,
      isNew,
    })
  }
  return phrases
}

export interface Section {
  index: number
  startBar: number
  /** Exclusive. */
  endBar: number
  start: number
  end: number
  /** Channels that play in this section. */
  channels: number[]
}

/**
 * Sections of the song: a new section starts where the set of playing parts changes
 * (an instrument enters or leaves). Sections shorter than MIN_SECTION_BARS join the previous one.
 */
export function songSections(song: Pick<Song, 'bars' | 'parts'>): Section[] {
  const barCount = song.bars.length - 1
  if (barCount <= 0) return []
  const activity = song.parts.map((part) => ({ channel: part.channel, active: barActivity(part, song.bars) }))
  const playing = (bar: number) => activity.filter((item) => item.active[bar]).map((item) => item.channel)

  const raw: { startBar: number, endBar: number, key: string }[] = []
  for (let bar = 0; bar < barCount; bar++) {
    const key = playing(bar).join(',')
    const last = raw[raw.length - 1]
    if (last && last.key === key) last.endBar = bar + 1
    else raw.push({ startBar: bar, endBar: bar + 1, key })
  }

  const merged: { startBar: number, endBar: number }[] = []
  for (const piece of raw) {
    const last = merged[merged.length - 1]
    if (last && piece.endBar - piece.startBar < MIN_SECTION_BARS) last.endBar = piece.endBar
    else if (last && last.endBar - last.startBar < MIN_SECTION_BARS) last.endBar = piece.endBar
    else merged.push({ startBar: piece.startBar, endBar: piece.endBar })
  }

  return merged.map((section, index) => {
    const channels = new Set<number>()
    for (let bar = section.startBar; bar < section.endBar; bar++) playing(bar).forEach((channel) => channels.add(channel))
    return {
      index,
      startBar: section.startBar,
      endBar: section.endBar,
      start: song.bars[section.startBar]!,
      end: song.bars[section.endBar]!,
      channels: [...channels].sort((a, b) => a - b),
    }
  })
}

export type PartRole = 'bass' | 'chords' | 'melody' | 'effects' | 'drums'

/** Steps with this many notes on average make a chord part (pads play 3, a riff mostly 1-2). */
const CHORD_STEP_SIZE = 2.5

/** GM synth effects (96-103), percussive (112-119) and sound effects (120-127): colour, not lines to learn first. */
const isEffectProgram = (program: number) => (program >= 96 && program <= 103) || program >= 112

/** What a part does in the song, from its instrument, range and how many notes it plays together. */
export function partRole(part: Pick<Part, 'isDrum' | 'notes' | 'steps' | 'program'>): PartRole {
  if (part.isDrum) return 'drums'
  if (isEffectProgram(part.program)) return 'effects'
  const keys = part.notes.map((note) => note.key).sort((a, b) => a - b)
  const median = keys[Math.floor(keys.length / 2)] ?? 60
  const stepSize = part.steps.reduce((sum, step) => sum + step.keys.length, 0) / Math.max(1, part.steps.length)
  if (median < 48 && stepSize < CHORD_STEP_SIZE) return 'bass'
  if (stepSize >= CHORD_STEP_SIZE) return 'chords'
  return 'melody'
}

const ROLE_ORDER: Record<PartRole, number> = { bass: 0, chords: 1, melody: 2, effects: 3, drums: 4 }

/**
 * Order to learn the parts in, the way a song is built: the bass line first, then the chords
 * (which link to the chord levels), then melodies; easier parts (fewer steps) first within a role.
 * Drums are left out (they are learned on the pads later).
 */
export function suggestOrder(parts: readonly Part[]): { channel: number, role: PartRole }[] {
  return parts
    .filter((part) => !part.isDrum)
    .map((part) => ({ channel: part.channel, role: partRole(part), steps: part.steps.length }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.steps - b.steps || a.channel - b.channel)
    .map(({ channel, role }) => ({ channel, role }))
}
