import { describe, expect, it } from 'vitest'

import { barQuarters, noteQuarters, scoreRhythm, sounds, type RhythmPress } from '@/lib/rhythm'
import {
  PASSES_PER_TEMPO,
  RHYTHM_LEVELS,
  RHYTHM_TEMPOS,
  TASK_BARS,
  currentLevel,
  hintsFor,
  isOpen,
  makeTask,
  parseRhythmProgress,
  passes,
  rhythmLevel,
  starsOf,
  tempoOf,
} from '@/lib/rhythmLevels'

describe('rhythm levels', () => {
  it('has ten levels, each bringing in no value it does not use', () => {
    expect(RHYTHM_LEVELS.map((level) => level.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    for (const level of RHYTHM_LEVELS) expect(level.introduces.every((value) => level.durations.includes(value))).toBe(true)
  })

  it('makes tasks of exactly two bars from the level values', () => {
    for (const level of RHYTHM_LEVELS.filter((item) => !item.soon)) {
      for (let i = 0; i < 30; i++) {
        const task = makeTask(level)
        expect(task.notes.reduce((sum, note) => sum + noteQuarters(note), 0)).toBeCloseTo(TASK_BARS * barQuarters(level.meter))
        expect(task.notes.every((note) => level.durations.includes(note.duration))).toBe(true)
      }
    }
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
    expect(isOpen(6, { 5: { passes: 9 } })).toBe(rhythmLevel(6).soon !== true)
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

  it('reminds to hold a half note for two counts', () => {
    const halves = sounds({ meter: { numerator: 4, denominator: 4 }, notes: [{ duration: 'half' }, { duration: 'half' }] }, 60)
    const score = scoreRhythm(halves, [{ time: 0, end: 0.9 }, { time: 2, end: 3.9 }])
    expect(hintsFor(score)).toEqual(['holdLonger'])
  })
})
