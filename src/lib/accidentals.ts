// Notes as they are written (plan step 20): a letter, an octave and an accidental. The same key can be written
// several ways (C♯ = D♭, E♯ = F): the staff shows the writing, the keyboard only knows the key. Pure code, no UI text.

/** Letters C D E F G A B as 0-6. */
export type Letter = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** −2 double flat, −1 flat, 0 plain, 1 sharp, 2 double sharp. */
export type Alter = -2 | -1 | 0 | 1 | 2

export interface Spelled {
  letter: Letter
  /** Scientific octave of the letter: C4 is middle C, whatever the accidental does to the key. */
  octave: number
  alter: Alter
  /** Print a natural sign (♮) before a plain note: it cancels a sharp or flat from before. */
  natural?: boolean
}

const LETTER_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const
const LETTERS = 'CDEFGAB'

/** The key a written note is played on. */
export function keyOf(note: Spelled): number {
  return (note.octave + 1) * 12 + LETTER_SEMITONES[note.letter] + note.alter
}

/** «C#4», «Bbb3», «Fx5»: letter, accidental (# b x bb, n for a natural), octave. */
export function spelled(text: string): Spelled {
  const match = /^([A-G])(bb|b|#|x|n)?(-?\d)$/.exec(text)
  if (!match) throw new Error(`Bad note ${text}`)
  const [, letter, sign, octave] = match
  const alter: Record<string, Alter> = { bb: -2, b: -1, '#': 1, x: 2, n: 0 }
  return { letter: LETTERS.indexOf(letter!) as Letter, octave: Number(octave), alter: sign ? alter[sign]! : 0, ...(sign === 'n' ? { natural: true } : {}) }
}

/** VexFlow accidental codes. */
const VEX_ACCIDENTAL: Record<Alter, string> = { [-2]: 'bb', [-1]: 'b', 0: 'n', 1: '#', 2: '##' }

/** The note for VexFlow: key like «f#/4» and the sign to print, if any. */
export function vexSpelling(note: Spelled): { key: string, accidental: string | null } {
  const sign = note.alter === 0 ? (note.natural ? 'n' : null) : VEX_ACCIDENTAL[note.alter]
  return { key: `${LETTERS[note.letter]!.toLowerCase()}${note.alter === 0 ? '' : VEX_ACCIDENTAL[note.alter]}/${note.octave}`, accidental: sign }
}

/** Every way to write a key with at most a double accidental, plainest first (none, then one sign, then two). */
export function spellings(key: number): Spelled[] {
  const all: Spelled[] = []
  for (const alter of [0, 1, -1, 2, -2] as Alter[]) {
    for (let letter = 0 as Letter; letter <= 6; letter = (letter + 1) as Letter) {
      const plain = key - alter
      const pc = ((plain % 12) + 12) % 12
      if (LETTER_SEMITONES[letter] !== pc) continue
      all.push({ letter, octave: Math.floor(plain / 12) - 1, alter })
    }
  }
  return all
}

/** Same key, other writing: C♯ and D♭, E♯ and F. */
export function enharmonic(a: Spelled, b: Spelled): boolean {
  return keyOf(a) === keyOf(b) && (a.letter !== b.letter || a.octave !== b.octave)
}

/** A step on the keyboard from a key, up or down: a semitone or a tone (step 20), or any interval (step 21). */
export interface StepTask {
  from: number
  semitones: number
  up: boolean
  /** The interval asked for (plan step 21), when the step is one: «большая терция вверх». */
  interval?: string
}

export function stepTarget(task: StepTask): number {
  return task.from + (task.up ? task.semitones : -task.semitones)
}

// Key signatures and signs in a bar (plan step 20): a sharp or flat at the clef holds for that letter in every
// octave; a sign before a note holds to the end of the bar, for that letter in that octave only; a natural
// cancels both.

export type KeySignature = 'C' | 'G' | 'D' | 'F'

/** Letters a key signature alters, and how. */
export const KEY_SIGNATURES: Readonly<Record<KeySignature, Partial<Record<Letter, Alter>>>> = {
  C: {},
  G: { 3: 1 },
  D: { 3: 1, 0: 1 },
  F: { 6: -1 },
}

/** A note as printed in a bar: letter and octave, and the sign before it (none, or ♯ ♭ ♮). */
export interface BarNote {
  letter: Letter
  octave: number
  sign: 1 | -1 | 'natural' | null
}

/** The keys a bar is played on, reading it as a musician does: key signature, then signs to the end of the bar. */
export function barKeys(key: KeySignature, notes: readonly BarNote[]): number[] {
  const signs = new Map<string, Alter>()
  return notes.map((note) => {
    const place = `${note.letter}/${note.octave}`
    if (note.sign !== null) signs.set(place, note.sign === 'natural' ? 0 : note.sign)
    const alter = signs.get(place) ?? KEY_SIGNATURES[key][note.letter] ?? 0
    return keyOf({ letter: note.letter, octave: note.octave, alter })
  })
}

/** The note for VexFlow inside a bar: the key as it sounds, the sign only where one is printed. */
export function barVexSpelling(key: KeySignature, notes: readonly BarNote[]): { key: string, accidental: string | null }[] {
  const keys = barKeys(key, notes)
  return notes.map((note, i) => {
    const alter = (keys[i]! - keyOf({ letter: note.letter, octave: note.octave, alter: 0 })) as Alter
    const name = `${LETTERS[note.letter]!.toLowerCase()}${alter === 0 ? '' : VEX_ACCIDENTAL[alter]}/${note.octave}`
    return { key: name, accidental: note.sign === null ? null : note.sign === 'natural' ? 'n' : VEX_ACCIDENTAL[note.sign] }
  })
}
