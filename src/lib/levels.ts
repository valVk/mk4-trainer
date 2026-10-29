// Training levels: task generation, answer checking and hint fading. Pure code, no UI text.

import { KEYBOARD_KEYS } from './keyboard'
import {
  CHORD_FORMULAS,
  buildChord,
  checkChord,
  pitchClass,
  progressionChords,
  type ChordCheckStatus,
  type ChordType,
  type PitchClass,
} from './theory'

export type ProgressionId = 'pop' | 'rock' | 'jazz' | 'popMinor'

// Well-known progressions in a major key (plan 3.5), as 1-based scale degrees.
export const PROGRESSIONS: Readonly<Record<ProgressionId, readonly number[]>> = {
  pop: [1, 5, 6, 4],
  rock: [1, 4, 5],
  jazz: [2, 5, 1],
  popMinor: [6, 4, 1, 5],
}

export interface ProgressionStep {
  root: PitchClass
  type: ChordType
  roman: string
}

export type Task =
  | { kind: 'note', root: PitchClass }
  /** `inversion` set: the bass must match it (level 5). */
  | { kind: 'chord', root: PitchClass, type: ChordType, inversion?: number }
  /** `root` is the key (major). */
  | { kind: 'progression', root: PitchClass, progression: ProgressionId, steps: ProgressionStep[] }

/** What the keyboard shows to help. Each level fades from its first stage to its last. */
export type HintStage = 'names' | 'namesHighlight' | 'highlight' | 'formula' | 'none'

export interface Level {
  id: number
  kind: Task['kind']
  roots: readonly PitchClass[]
  types: readonly ChordType[]
  /** Ask for a specific inversion. */
  inversions: boolean
  stages: readonly HintStage[]
}

const WHITE_ROOTS: readonly PitchClass[] = [0, 2, 4, 5, 7, 9, 11]
const ALL_ROOTS: readonly PitchClass[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MAJOR_MINOR: readonly ChordType[] = ['maj', 'min']

// Plan 5.1: from single notes up to progressions; hints fade within each level.
export const LEVELS: readonly Level[] = [
  { id: 1, kind: 'note', roots: WHITE_ROOTS, types: [], inversions: false, stages: ['names', 'none'] },
  { id: 2, kind: 'chord', roots: WHITE_ROOTS, types: MAJOR_MINOR, inversions: false, stages: ['namesHighlight', 'highlight'] },
  { id: 3, kind: 'chord', roots: ALL_ROOTS, types: MAJOR_MINOR, inversions: false, stages: ['highlight', 'none'] },
  { id: 4, kind: 'chord', roots: ALL_ROOTS, types: MAJOR_MINOR, inversions: false, stages: ['formula'] },
  { id: 5, kind: 'chord', roots: ALL_ROOTS, types: MAJOR_MINOR, inversions: true, stages: ['highlight', 'none'] },
  { id: 6, kind: 'chord', roots: ALL_ROOTS, types: ['dim', 'aug', 'sus2', 'sus4'], inversions: false, stages: ['none'] },
  { id: 7, kind: 'chord', roots: ALL_ROOTS, types: ['7', 'maj7', 'm7'], inversions: false, stages: ['none'] },
  { id: 8, kind: 'progression', roots: WHITE_ROOTS, types: [], inversions: false, stages: ['none'] },
]

/** Correct answers in a row before the next, weaker hint stage. */
export const STREAK_TO_FADE = 3
/** Correct answers in a level for 1, 2 and 3 stars. */
export const STAR_THRESHOLDS = [5, 10, 20] as const

export function getLevel(id: number): Level {
  const level = LEVELS.find((item) => item.id === id)
  if (!level) throw new RangeError(`Level ${id} does not exist`)
  return level
}

export function progressionTask(key: PitchClass, progression: ProgressionId): Task {
  const steps = progressionChords(key, 'ionian', PROGRESSIONS[progression]).map((chord) => ({
    root: chord.root,
    // Diatonic triads of a major key are always in the formula table.
    type: chord.type as ChordType,
    roman: chord.roman,
  }))
  return { kind: 'progression', root: key, progression, steps }
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] as T
}

function sameTask(a: Task, b: Task): boolean {
  return taskId(a, String) === taskId(b, String)
}

function randomTask(level: Level, random: () => number, root: PitchClass): Task {
  if (level.kind === 'note') return { kind: 'note', root }
  if (level.kind === 'progression') {
    return progressionTask(root, pick(Object.keys(PROGRESSIONS) as ProgressionId[], random))
  }
  const type = pick(level.types, random)
  if (!level.inversions) return { kind: 'chord', root, type }
  return { kind: 'chord', root, type, inversion: Math.floor(random() * CHORD_FORMULAS[type].length) }
}

/** A random task for the level, never the same as the previous one. */
export function generateTask(levelId: number, random: () => number = Math.random, previous?: Task): Task {
  const level = getLevel(levelId)
  for (let attempt = 0; attempt < 20; attempt++) {
    const task = randomTask(level, random, pick(level.roots, random))
    if (!previous || !sameTask(task, previous)) return task
  }
  // Only reachable with a broken random source: take the next root to guarantee a change.
  const next = level.roots[(level.roots.indexOf(previous!.root) + 1) % level.roots.length] as PitchClass
  return randomTask(level, random, next)
}

/**
 * The notes to show or play on the 25 keys that start at `rangeStart` (always a C).
 * High inversions that would run off the top move down an octave.
 * For a progression, `step` picks the chord.
 */
export function taskNotes(task: Task, rangeStart: number, step = 0): number[] {
  if (task.kind === 'note') return [rangeStart + pitchClass(task.root)]
  const chord = task.kind === 'progression' ? task.steps[Math.min(step, task.steps.length - 1)]! : task
  const inversion = task.kind === 'chord' ? (task.inversion ?? 0) : 0
  const notes = buildChord(rangeStart + pitchClass(chord.root), chord.type, inversion)
  const top = rangeStart + KEYBOARD_KEYS - 1
  return Math.max(...notes) > top && Math.min(...notes) - 12 >= rangeStart ? notes.map((note) => note - 12) : notes
}

export interface TaskCheck {
  status: ChordCheckStatus
  missing: PitchClass[]
  extra: PitchClass[]
}

/**
 * Any octave counts. A note task is solved by holding just that note (doublings allowed).
 * A progression is checked one chord at a time: `step` is the chord being played.
 */
export function checkTask(task: Task, held: readonly number[], step = 0): TaskCheck {
  if (task.kind === 'chord') return checkChord(held, task)
  if (task.kind === 'progression') {
    const chord = task.steps[Math.min(step, task.steps.length - 1)]!
    return checkChord(held, chord)
  }
  if (held.length === 0) return { status: 'empty', missing: [], extra: [] }
  const played = [...new Set(held.map(pitchClass))]
  const extra = played.filter((pc) => pc !== task.root)
  const missing = played.includes(task.root) ? [] : [task.root]
  if (missing.length && extra.length) return { status: 'wrong', missing, extra }
  if (extra.length) return { status: 'extra', missing, extra }
  return { status: 'correct', missing, extra }
}

/** Current hint stage: one step weaker for every STREAK_TO_FADE correct answers in a row. */
export function hintStage(levelId: number, streak: number): HintStage {
  const { stages } = getLevel(levelId)
  const index = Math.min(stages.length - 1, Math.floor(streak / STREAK_TO_FADE))
  return stages[index] as HintStage
}

export function starsFor(correct: number): number {
  return STAR_THRESHOLDS.filter((threshold) => correct >= threshold).length
}

/** Short task id for the attempt log (plan 7, table `attempt`): "C#:min:inv1", "E:note", "G:pop". */
export function taskId(task: Task, name: (pc: PitchClass) => string): string {
  const root = name(task.root)
  if (task.kind === 'note') return `${root}:note`
  if (task.kind === 'progression') return `${root}:${task.progression}`
  return task.inversion === undefined ? `${root}:${task.type}` : `${root}:${task.type}:inv${task.inversion}`
}
