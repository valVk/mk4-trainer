// «Теория» → «Ноты» (plan step 19): read a note, press its key. First the names on the keys, then the
// landmarks of the treble and bass clefs, then exact octaves inside the 25 keys of the MK4, then ledger
// lines that need the octave buttons. Pure code, no Vue, no UI text.

import { isGraze, type Press } from './ladder'
import { STAR_THRESHOLDS, starsFor } from './levels'
import { pitch } from './staff'
import { pitchClass } from './theory'

export type NoteIntroId = 'keyboard' | 'names' | 'treble' | 'bass' | 'grand' | 'ledgers' | 'timed'

/** How the task is shown: the note's name only, or the note on a staff. */
export type NoteShow = 'name' | 'treble' | 'bass' | 'grand'

export interface NoteLevel {
  id: number
  show: NoteShow
  keys: readonly number[]
  /** Any octave counts (first levels); otherwise the very key on the staff. */
  anyOctave: boolean
  introduces: NoteIntroId[]
  /** Upper levels: only an answer within this many ms earns its star (plan step 19: «на время только на верхних уровнях»). */
  timed?: number
}

const keys = (names: string) => names.trim().split(/\s+/).map(pitch)

export const NOTE_LEVELS: readonly NoteLevel[] = [
  { id: 1, show: 'name', keys: keys('C4 D4 E4 F4 G4 A4 B4'), anyOctave: true, introduces: ['keyboard', 'names'] },
  // Landmarks of the treble clef (соль on the 2nd line, до on the 1st ledger line below, соль above the 5th) and their neighbours.
  { id: 2, show: 'treble', keys: keys('C4 D4 F4 G4 A4 F5 G5'), anyOctave: true, introduces: ['treble'] },
  { id: 3, show: 'treble', keys: keys('C4 D4 E4 F4 G4 A4 B4 C5'), anyOctave: false, introduces: [] },
  // Landmarks of the bass clef (фа on the 4th line, фа under the 1st, до on the 1st ledger line above) and their neighbours.
  { id: 4, show: 'bass', keys: keys('F2 G2 E3 F3 G3 B3 C4'), anyOctave: true, introduces: ['bass'] },
  { id: 5, show: 'bass', keys: keys('C3 D3 E3 F3 G3 A3 B3 C4'), anyOctave: false, introduces: [] },
  // With the MK4 at C3-C5 both clefs fit without moving the octave (plan step 19).
  { id: 6, show: 'grand', keys: keys('C3 E3 G3 B3 D4 F4 A4 C5 D3 F3 A3 C4 E4 G4 B4'), anyOctave: false, introduces: ['grand'] },
  // Ledger lines past the 25 keys: the child moves the octave on the MK4, which is what 8va means.
  { id: 7, show: 'grand', keys: keys('D5 E5 G5 A5 C6 C2 E2 G2 B2'), anyOctave: false, introduces: ['ledgers'] },
  // Reading at sight: every note of both clefs inside C3-C5, a few seconds each. No key hint here: it would give the answer.
  { id: 8, show: 'grand', keys: keys('C3 D3 E3 F3 G3 A3 B3 C4 D4 E4 F4 G4 A4 B4 C5'), anyOctave: false, introduces: ['timed'], timed: 4000 },
]

/** Whether a right answer counts towards the stars: on a timed level only a quick one does. */
export function countsForStars(level: NoteLevel, answerMs: number): boolean {
  return level.timed === undefined || answerMs <= level.timed
}

export interface NoteLevelProgress {
  correct: number
}

export function parseNoteProgress(value: unknown): Record<number, NoteLevelProgress> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const progress: Record<number, NoteLevelProgress> = {}
  for (const [key, item] of Object.entries(value)) {
    const correct = (item as Partial<NoteLevelProgress> | null)?.correct
    if (NOTE_LEVELS.some((level) => level.id === Number(key)) && typeof correct === 'number' && correct >= 0) progress[Number(key)] = { correct: Math.floor(correct) }
  }
  return progress
}

/** Stars as in «Аккорды»: 5, 10 and 20 notes found. */
export function noteStars(progress: Readonly<Record<number, NoteLevelProgress>>, id: number): number {
  return starsFor(progress[id]?.correct ?? 0)
}

export function isNoteLevelOpen(id: number, progress: Readonly<Record<number, NoteLevelProgress>>): boolean {
  if (!NOTE_LEVELS.some((level) => level.id === id)) return false
  return id === 1 || noteStars(progress, id - 1) >= STAR_THRESHOLDS.length
}

/** Where to open: the first open level that still lacks stars, or the last open one. */
export function currentNoteLevel(progress: Readonly<Record<number, NoteLevelProgress>>): number {
  const open = NOTE_LEVELS.filter((level) => isNoteLevelOpen(level.id, progress))
  return (open.find((level) => noteStars(progress, level.id) < STAR_THRESHOLDS.length) ?? open[open.length - 1] ?? NOTE_LEVELS[0]!).id
}

/** The next note to find: never the same as the one before, so the child sees that the task changed. */
export function nextNote(level: NoteLevel, previous: number | null, random: () => number = Math.random): number {
  const choices = level.keys.filter((key) => key !== previous)
  return choices[Math.floor(random() * choices.length)] ?? level.keys[0]!
}

/**
 * What the held keys say about the task. `right`: the key (or, with any octave, the same note in another
 * octave) is down, and every other key is a brushed neighbour. `octave`: the right note in the wrong octave on
 * an exact level. `wrong`: anything else. Pressing many keys at once is never right.
 */
export function checkNote(target: number, held: readonly Press[], anyOctave: boolean): 'empty' | 'right' | 'octave' | 'wrong' {
  if (held.length === 0) return 'empty'
  const hit = held.find((item) => (anyOctave ? pitchClass(item.key) === pitchClass(target) : item.key === target))
  const others = held.filter((item) => item !== hit)
  if (hit && others.every((item) => isGraze(item, [hit], 1))) return 'right'
  if (!anyOctave && held.length === 1 && pitchClass(held[0]!.key) === pitchClass(target)) return 'octave'
  return 'wrong'
}
