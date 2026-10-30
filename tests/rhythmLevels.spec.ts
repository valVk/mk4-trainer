import { describe, expect, it } from 'vitest'

import { barQuarters, fillsBars, scoreRhythm, sounds, splitBars, totalQuarters, type RhythmPress } from '@/lib/rhythm'
import {
  PASSES_PER_TEMPO,
  RHYTHM_LEVELS,
  RHYTHM_TEMPOS,
  TASK_BARS,
  currentLevel,
  hintsFor,
  introRhythm,
  isOpen,
  levelTempo,
  makeTask,
  parseRhythmProgress,
  passes,
  rhythmLevel,
  starsOf,
  tempoOf,
} from '@/lib/rhythmLevels'

describe('rhythm levels', () => {
  it('has ten levels, and every intro example fills whole bars', () => {
    expect(RHYTHM_LEVELS.map((level) => level.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    for (const level of RHYTHM_LEVELS) for (const id of level.introduces) expect(fillsBars(introRhythm(id))).toBe(true)
  })

  it('makes tasks of exactly two bars (plus the pickup) in one of the level meters', () => {
    const unknownValues: string[] = []
    for (const level of RHYTHM_LEVELS) {
      for (let i = 0; i < 40; i++) {
        const task = makeTask(level)
        expect(level.meters).toContainEqual(task.meter)
        expect(totalQuarters(task)).toBeCloseTo((task.pickup ?? 0) + TASK_BARS * barQuarters(task.meter))
        // Free levels use only their values; cell levels use whatever their cells are made of.
        unknownValues.push(...(level.cells ? [] : task.notes.filter((note) => !level.durations.includes(note.duration)).map((note) => `Р${level.id}:${note.duration}`)))
      }
    }
    expect(unknownValues).toEqual([])
  })

  it('accents the strong beat of every bar on the level of accents', () => {
    const level = rhythmLevel(7)
    for (let i = 0; i < 20; i++) {
      const task = makeTask(level)
      const bars = splitBars(task)
      expect(bars.every((bar) => bar[0]!.note.rest || bar[0]!.note.accent)).toBe(true)
      expect(task.notes.filter((note) => note.accent).length).toBeLessThanOrEqual(TASK_BARS)
    }
  })

  it('ties only real notes, and keeps triplets in whole groups of three', () => {
    for (let i = 0; i < 40; i++) {
      const tied = makeTask(rhythmLevel(6))
      const badTies = tied.notes.filter((note, n) => note.tie && (note.rest || tied.notes[n + 1]?.rest || !tied.notes[n + 1]))
      expect(badTies).toEqual([])
      const triplets = makeTask(rhythmLevel(9)).notes.map((note) => Boolean(note.tuplet))
      const runs = triplets.join(',').split('false').map((run) => run.split('true').length - 1).filter(Boolean)
      expect(runs.every((run) => run % 3 === 0)).toBe(true)
    }
  })

  it('counts 6/8 in eighths: its tempo steps are doubled', () => {
    expect(levelTempo(rhythmLevel(10), 0)).toBe(120)
    expect(levelTempo(rhythmLevel(1), 0)).toBe(60)
  })

  it('climbs 60, 80, 100 with three passed rhythms per step and a star for each step', () => {
    expect([0, 2, 3, 5, 6, 9, 20].map(tempoOf)).toEqual([60, 60, 80, 80, 100, 100, 100])
    expect([0, 2, 3, 6, 9, 20].map(starsOf)).toEqual([0, 0, 1, 2, 3, 3])
    expect(PASSES_PER_TEMPO * RHYTHM_TEMPOS.length).toBe(9)
  })

  it('opens a level after all stars in the one before, and keeps unbuilt levels closed', () => {
    expect(isOpen(1, {})).toBe(true)
    expect(isOpen(2, { 1: { passes: 8 } })).toBe(false)
    expect(isOpen(2, { 1: { passes: 9 } })).toBe(true)
    expect(isOpen(6, { 5: { passes: 9 } })).toBe(true)
    expect(isOpen(11, {})).toBe(false)
  })

  it('reads saved progress and drops anything broken', () => {
    expect(parseRhythmProgress({ 1: { passes: 4 }, 2: { passes: -1 }, 99: { passes: 3 }, 3: 'x' })).toEqual({ 1: { passes: 4 } })
    expect(parseRhythmProgress(null)).toEqual({})
  })

  it('opens on the first open level that still lacks stars', () => {
    expect(currentLevel({})).toBe(1)
    expect(currentLevel({ 1: { passes: 9 }, 2: { passes: 4 } })).toBe(2)
    expect(currentLevel({ 1: { passes: 9 }, 2: { passes: 9 } })).toBe(3)
  })
})

describe('passing and hints', () => {
  // Four quarters at 60: notes at 0, 1, 2, 3 s.
  const quarters = sounds({ meter: { numerator: 4, denominator: 4 }, notes: Array.from({ length: 4 }, () => ({ duration: 'quarter' as const })) }, 60)
  const press = (time: number, held = 0.8): RhythmPress => ({ time, end: time + held })

  it('passes a steady attempt and praises it', () => {
    const score = scoreRhythm(quarters, [press(0.02), press(1.03), press(1.98), press(3.01)])
    expect(passes(score)).toBe(true)
    expect(hintsFor(score)).toEqual(['great'])
  })

  it('tells a hurrying child to wait for the click', () => {
    const score = scoreRhythm(quarters, [press(0), press(0.85), press(1.84), press(2.86)])
    expect(passes(score)).toBe(false)
    expect(hintsFor(score)).toContain('rushing')
  })

  it('never praises an attempt with a note off time', () => {
    const score = scoreRhythm(quarters, [press(0), press(1), press(2), press(3.14)])
    expect(hintsFor(score)).toEqual(['dragging'])
  })

  it('puts a missed note and taps in a rest first', () => {
    const score = scoreRhythm(quarters, [press(0), press(0.5), press(2), press(3)])
    expect(passes(score)).toBe(false)
    expect(hintsFor(score)).toEqual(['missed', 'extra'])
  })

  it('asks for a louder strong beat when accents were played the same', () => {
    const accented = { meter: { numerator: 4, denominator: 4 }, notes: [{ duration: 'quarter' as const, accent: true }, { duration: 'quarter' as const }, { duration: 'quarter' as const }, { duration: 'quarter' as const }] }
    const heard = sounds(accented, 60)
    const flat = scoreRhythm(heard, [0, 1, 2, 3].map((time) => ({ time, end: time + 0.8, velocity: 80 })))
    expect(hintsFor(flat, accented)).toEqual(['accent'])
    const loud = scoreRhythm(heard, [0, 1, 2, 3].map((time) => ({ time, end: time + 0.8, velocity: time === 0 ? 110 : 80 })))
    expect(hintsFor(loud, accented)).toEqual(['great'])
    // No velocity (screen taps): nothing to say about accents.
    const screen = scoreRhythm(heard, [0, 1, 2, 3].map((time) => ({ time, end: time + 0.8 })))
    expect(hintsFor(screen, accented)).toEqual(['great'])
  })

  it('reminds to hold a half note for two counts', () => {
    const halves = sounds({ meter: { numerator: 4, denominator: 4 }, notes: [{ duration: 'half' }, { duration: 'half' }] }, 60)
    const score = scoreRhythm(halves, [{ time: 0, end: 0.9 }, { time: 2, end: 3.9 }])
    expect(hintsFor(score)).toEqual(['holdLonger'])
  })
})
