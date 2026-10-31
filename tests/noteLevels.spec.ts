import { describe, expect, it } from 'vitest'

import { keyOf } from '@/lib/accidentals'
import { interval, intervalBetween, type IntervalId } from '@/lib/intervals'
import { playOrder } from '@/lib/form'
import { KEY_INFO } from '@/lib/scales'
import { checkChord } from '@/lib/theory'

import { KEYBOARD_KEYS } from '@/lib/keyboard'
import { FUNCTION_LEVELS, INTERVAL_LEVELS, NOTE_LEVELS, SCALE_LEVELS, SEVENTH_LEVELS, SEVENTH_TYPES, articulationVerdict, checkVoicing, dominantSeventh, makeChoice, type NoteTask, checkNote, countsForStars, makeMelody, noteStars, readMarks, readingPasses, currentNoteLevel, isNoteLevelOpen, nextTask, makeKeyBar, ACCIDENTAL_LEVELS, parseNoteProgress } from '@/lib/noteLevels'
import { octaveShift } from '@/lib/staff'

const level = (id: number) => NOTE_LEVELS.find((item) => item.id === id)!
/** The MK4 out of the box: C3 to C5. */
const MK4_START = 48

describe('note levels', () => {
  it('start with any octave, then ask for the very key', () => {
    expect(NOTE_LEVELS.slice(0, 2).every((item) => item.anyOctave)).toBe(true)
    expect(level(3).anyOctave).toBe(false)
  })

  it('fit the 25 keys at C3-C5 until the ledger-line level, which needs the octave buttons', () => {
    for (const item of NOTE_LEVELS.filter((entry) => !entry.anyOctave && entry.id !== 7)) {
      expect(item.keys.every((key) => octaveShift(key, MK4_START) === 0)).toBe(true)
    }
    expect(level(7).keys.some((key) => octaveShift(key, MK4_START) !== 0)).toBe(true)
    // One octave press at most: the window can always reach the note.
    expect(level(7).keys.every((key) => Math.abs(octaveShift(key, MK4_START)) <= 1)).toBe(true)
    expect(KEYBOARD_KEYS).toBe(25)
  })

  it('never asks for the same note twice in a row', () => {
    const first = level(3)
    let previous: NoteTask | null = null
    for (let i = 0; i < 50; i++) {
      const next: NoteTask = nextTask(first, previous, () => (i * 0.37) % 1)
      expect(next.key).not.toBe(previous?.key)
      previous = next
    }
  })
})

describe('checking the keys', () => {
  it('praises the key, and on the first levels the same note in any octave', () => {
    expect(checkNote(64, [{ key: 64, time: 0 }], false)).toBe('right')
    expect(checkNote(64, [{ key: 76, time: 0 }], true)).toBe('right')
    expect(checkNote(64, [], true)).toBe('empty')
  })

  it('forgives a neighbour brushed with the right key, not a key pressed later', () => {
    expect(checkNote(64, [{ key: 64, time: 0 }, { key: 65, time: 0.03 }], false)).toBe('right')
    expect(checkNote(64, [{ key: 64, time: 0 }, { key: 65, time: 0.5 }], false)).toBe('wrong')
  })

  it('does not reward pressing many keys at once', () => {
    const mash = [60, 62, 64, 65, 67].map((key) => ({ key, time: 0 }))
    expect(checkNote(64, mash, false)).toBe('wrong')
  })

  it('tells the right note in the wrong octave apart on exact levels', () => {
    expect(checkNote(64, [{ key: 76, time: 0 }], false)).toBe('octave')
    expect(checkNote(64, [{ key: 65, time: 0 }], false)).toBe('wrong')
  })
})

describe('note progress', () => {
  it('opens a level after all stars of the one before', () => {
    expect(isNoteLevelOpen(1, {})).toBe(true)
    expect(isNoteLevelOpen(2, { 1: { correct: 19 } })).toBe(false)
    expect(isNoteLevelOpen(2, { 1: { correct: 20 } })).toBe(true)
    expect(isNoteLevelOpen(99, {})).toBe(false)
    expect(currentNoteLevel({ 1: { correct: 20 }, 2: { correct: 4 } })).toBe(2)
  })

  it('reads saved progress and drops what is broken', () => {
    expect(parseNoteProgress({ 1: { correct: 7.5 }, 2: { correct: -1 }, 99: { correct: 3 }, 3: null })).toEqual({ 1: { correct: 7 } })
    expect(parseNoteProgress('x')).toEqual({})
  })
})

describe('the timed level', () => {
  it('is the upper one, and only quick answers earn stars there', () => {
    const timed = level(8)
    expect(NOTE_LEVELS.filter((item) => item.timed !== undefined).map((item) => item.id)).toEqual([8])
    expect(countsForStars(timed, 2500)).toBe(true)
    expect(countsForStars(timed, timed.timed! + 1)).toBe(false)
    expect(countsForStars(level(3), 60_000)).toBe(true)
  })

  it('stays inside the 25 keys at C3-C5', () => {
    expect(level(8).keys.every((key) => octaveShift(key, MK4_START) === 0)).toBe(true)
  })
})

describe('reading melodies in rhythm', () => {
  const reading = level(9)
  const seeds = Array.from({ length: 40 }, (_, seed) => {
    let state = seed + 1
    return () => {
      state = (state * 16807) % 2147483647
      return state / 2147483647
    }
  })

  it('writes tunes for one hand on C4-G4, by step or a third, ending on C', () => {
    for (const random of seeds) {
      const melody = makeMelody(reading, random)
      const played = melody.notes.filter((note) => !note.rest)
      expect(played.every((note) => note.key !== undefined && reading.keys.includes(note.key))).toBe(true)
      expect(melody.notes.filter((note) => note.rest).every((note) => note.key === undefined)).toBe(true)
      const scale = [...reading.keys].sort((a, b) => a - b)
      played.slice(1).forEach((note, i) => {
        expect(Math.abs(scale.indexOf(note.key!) - scale.indexOf(played[i]!.key!))).toBeLessThanOrEqual(2)
      })
    }
  })

  it('ends on C, the note it started from', () => {
    // A last note tied from the one before keeps that one's key, so look at the last note that is struck.
    const lastStruck = seeds.map((random) => makeMelody(reading, random)).map((melody) => {
      const struck = melody.notes.filter((note, i) => !note.rest && !melody.notes[i - 1]?.tie)
      return struck[struck.length - 1]!.key
    })
    expect(new Set(lastStruck)).toEqual(new Set([60]))
  })

  it('keeps the key over a tie', () => {
    const pairs = seeds.flatMap((random) => {
      const melody = makeMelody(reading, random)
      return melody.notes.flatMap((note, i) => (note.tie && !note.rest && melody.notes[i + 1] && !melody.notes[i + 1]!.rest ? [[note.key, melody.notes[i + 1]!.key]] : []))
    })
    expect(pairs.every(([from, to]) => from === to)).toBe(true)
  })

  const melody = { meter: { numerator: 4, denominator: 4 }, notes: [{ duration: 'quarter' as const, key: 60 }, { duration: 'quarter' as const, key: 62 }, { duration: 'half' as const, key: 64 }] }
  const result = (index: number, verdict: 'onTime' | 'late' | 'missed', key: number | null) => ({ index, verdict, offset: verdict === 'missed' ? null : 0, hold: null, held: null, velocity: null, key })

  it('marks each note: right, off time, wrong key or missed', () => {
    const score = { results: [result(0, 'onTime', 60), result(1, 'late', 62), result(2, 'onTime', 65)], extra: 0, onTime: 2, total: 3 }
    expect(readMarks(melody, score)).toEqual({ 0: 'right', 1: 'off', 2: 'wrongKey' })
    expect(readingPasses(melody, score)).toBe(false)
  })

  it('passes with the right keys and the rhythm of «Ритм»', () => {
    const score = { results: [result(0, 'onTime', 60), result(1, 'onTime', 62), result(2, 'onTime', 64)], extra: 0, onTime: 3, total: 3 }
    expect(readingPasses(melody, score)).toBe(true)
    const missed = { results: [result(0, 'onTime', 60), result(1, 'missed', null), result(2, 'onTime', 64)], extra: 0, onTime: 2, total: 3 }
    expect(readingPasses(melody, missed)).toBe(false)
  })

  it('gives stars for 3, 6 and 9 melodies', () => {
    expect([2, 3, 6, 9].map((correct) => noteStars({ 9: { correct } }, 9))).toEqual([0, 1, 2, 3])
    expect(noteStars({ 3: { correct: 5 } }, 3)).toBe(1)
  })
})

describe('«Полутоны и знаки»', () => {
  const accidental = (id: number) => ACCIDENTAL_LEVELS.find((item) => item.id === id)!
  // Mulberry32: well mixed from the very first number, whatever the seed.
  const random = (seed: number) => {
    let state = seed * 2654435761
    return () => {
      state = (state + 0x6d2b79f5) | 0
      let x = Math.imul(state ^ (state >>> 15), 1 | state)
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296
    }
  }

  it('asks for a half or whole step that lands on C4-C5, both ways, both sizes', () => {
    const tasks = Array.from({ length: 200 }, (_, seed) => nextTask(accidental(1), null, random(seed)))
    expect(tasks.every((task) => task.key >= 60 && task.key <= 72)).toBe(true)
    expect(tasks.every((task) => task.key === task.step!.from + (task.step!.up ? task.step!.semitones : -task.step!.semitones))).toBe(true)
    expect(new Set(tasks.map((task) => `${task.step!.semitones}${task.step!.up}`)).size).toBe(4)
  })

  it('writes the notes with signs, and each sounds on its key', () => {
    const task = nextTask(accidental(3), null, () => 0.3)
    expect(task.written).toBeDefined()
    expect(accidental(3).keys).toContain(task.key)
    // F double sharp is G, B double flat is A.
    expect(accidental(3).keys).toEqual(expect.arrayContaining([67, 69]))
  })

  it('stays inside the 25 keys of the MK4 out of the box (C3-C5)', () => {
    expect(ACCIDENTAL_LEVELS.flatMap((item) => item.keys).every((key) => octaveShift(key, MK4_START) === 0)).toBe(true)
  })

  it('makes bars under a key signature that always use its letter, on C4-C5', () => {
    const bars = Array.from({ length: 100 }, (_, seed) => makeKeyBar(random(seed)))
    expect(new Set(bars.map((bar) => bar.key))).toEqual(new Set(['G', 'F']))
    expect(bars.every((bar) => bar.notes.length === 4 && bar.notes.some((note) => note.letter === (bar.key === 'G' ? 3 : 6)))).toBe(true)
    expect(bars.every((bar) => bar.keys.every((key) => key >= 60 && key <= 72))).toBe(true)
    // Both lessons come up: a natural, and a sign held later in the bar.
    expect(bars.some((bar) => bar.notes.some((note) => note.sign === 'natural'))).toBe(true)
    expect(bars.some((bar) => bar.notes[0]!.sign !== null && bar.notes[0]!.sign !== 'natural' && bar.keys[1] === bar.keys[0])).toBe(true)
  })

  it('opens and counts on its own levels', () => {
    expect(isNoteLevelOpen(2, { 1: { correct: 20 } }, ACCIDENTAL_LEVELS)).toBe(true)
    expect(isNoteLevelOpen(6, { 5: { correct: 10 } }, ACCIDENTAL_LEVELS)).toBe(false)
    expect(currentNoteLevel({ 1: { correct: 20 } }, ACCIDENTAL_LEVELS)).toBe(2)
  })
})

describe('«Интервалы»', () => {
  const at = (id: number) => INTERVAL_LEVELS.find((item) => item.id === id)!
  const mixed = (seed: number) => {
    let state = seed * 2654435761
    return () => {
      state = (state + 0x6d2b79f5) | 0
      let x = Math.imul(state ^ (state >>> 15), 1 | state)
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296
    }
  }

  it('builds every interval of a level from a key, landing on C4-C5', () => {
    for (const level of INTERVAL_LEVELS.filter((item) => item.show === 'step')) {
      const tasks = Array.from({ length: 200 }, (_, seed) => nextTask(level, null, mixed(seed)))
      expect(tasks.every((task) => task.key >= 60 && task.key <= 72)).toBe(true)
      expect(tasks.every((task) => Math.abs(task.key - task.step!.from) === interval(task.step!.interval as IntervalId).semitones)).toBe(true)
      expect(new Set(tasks.map((task) => task.step!.interval))).toEqual(new Set(level.intervals))
    }
  })

  it('offers the answer once among other sizes, and writes it with the right letters', () => {
    for (const id of [4, 5, 6]) {
      for (let seed = 0; seed < 100; seed++) {
        const choice = makeChoice(at(id), null, mixed(seed))
        expect(choice.options).toContain(choice.answer)
        expect(choice.options).toHaveLength(at(id).options!)
        expect(new Set(choice.options.map((option) => interval(option).semitones)).size).toBe(choice.options.length)
        expect(intervalBetween(choice.low, choice.high)?.id).toBe(choice.answer)
        expect(keyOf(choice.high)).toBeLessThanOrEqual(72)
      }
    }
  })

  it('never asks the same interval twice in a row', () => {
    let previous: IntervalId | null = null
    for (let seed = 0; seed < 50; seed++) {
      const choice = makeChoice(at(5), previous, mixed(seed))
      expect(choice.answer).not.toBe(previous)
      previous = choice.answer
    }
  })
})

describe('«Гаммы»', () => {
  const at = (id: number) => SCALE_LEVELS.find((item) => item.id === id)!
  const seeded = (seed: number) => {
    let state = seed * 2654435761
    return () => {
      state = (state + 0x6d2b79f5) | 0
      let x = Math.imul(state ^ (state >>> 15), 1 | state)
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296
    }
  }

  it('builds scales of eight notes inside C3-C5, written as they sound', () => {
    for (const id of [1, 2, 3]) {
      for (let seed = 0; seed < 60; seed++) {
        const task = nextTask(at(id), null, seeded(seed))
        const sequence = task.sequence!
        expect(sequence.keys).toHaveLength(8)
        expect(sequence.keys[0]).toBeGreaterThanOrEqual(48)
        expect(sequence.keys[7]).toBeLessThanOrEqual(72)
        expect(sequence.written.map(keyOf)).toEqual(sequence.keys)
        expect(at(id).scales).toContain(sequence.scale!.kind)
      }
    }
  })

  it('offers a key with its relative key among the choices', () => {
    for (let seed = 0; seed < 60; seed++) {
      const choice = nextTask(at(4), null, seeded(seed)).keyChoice!
      expect(choice.options).toContain(choice.answer)
      expect(choice.options).toHaveLength(4)
      expect(new Set(choice.options).size).toBe(4)
      // The last bar ends on the tonic.
      expect(keyOf(choice.written[3]!) % 12).toBe(keyOf(KEY_INFO[choice.answer].tonic) % 12)
    }
  })

  it('asks where an unstable degree resolves, on a stable one', () => {
    for (let seed = 0; seed < 60; seed++) {
      const task = nextTask(at(5), null, seeded(seed))
      const resolution = task.resolution!
      const tonic = keyOf(KEY_INFO[resolution.key].tonic)
      expect([0, 4, 7, 12]).toContain(task.key - tonic)
      expect(Math.abs(task.key - keyOf(resolution.written[2]!))).toBeLessThanOrEqual(2)
    }
  })

  it('moves a known melody up a semitone or a tone, staying inside C3-C5', () => {
    for (let seed = 0; seed < 60; seed++) {
      const sequence = nextTask(at(6), null, seeded(seed)).sequence!
      expect([1, 2]).toContain(sequence.shift)
      expect(sequence.keys).toEqual(sequence.written.map((note) => keyOf(note) + sequence.shift!))
      expect(Math.max(...sequence.keys)).toBeLessThanOrEqual(72)
    }
  })
})

describe('«Функции»', () => {
  const at = (id: number) => FUNCTION_LEVELS.find((item) => item.id === id)!
  const seeded = (seed: number) => {
    let state = seed * 2654435761
    return () => {
      state = (state + 0x6d2b79f5) | 0
      let x = Math.imul(state ^ (state >>> 15), 1 | state)
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296
    }
  }

  it('asks chords whose own voicing is right and inside C3-C5', () => {
    for (const id of [1, 2, 3, 4, 5]) {
      for (let seed = 0; seed < 40; seed++) {
        const chord = nextTask(at(id), null, seeded(seed)).chordQuestion!.chord
        expect(checkChord(chord.keys, chord.target).status).toBe('correct')
        expect(Math.min(...chord.keys)).toBeGreaterThanOrEqual(48)
        expect(Math.max(...chord.keys)).toBeLessThanOrEqual(72)
      }
    }
  })

  it('asks the inversion on the inversion level, root position elsewhere', () => {
    const inversions = new Set(Array.from({ length: 40 }, (_, seed) => nextTask(at(2), null, seeded(seed)).chordQuestion!.inversion))
    expect(inversions).toEqual(new Set([1, 2]))
    expect(nextTask(at(1), null, seeded(3)).chordQuestion!.inversion).toBe(0)
  })

  it('harmonises bars with T, S or D', () => {
    const answers = new Set(Array.from({ length: 60 }, (_, seed) => nextTask(at(6), null, seeded(seed)).harmony!.answer))
    expect(answers).toEqual(new Set(['T', 'S', 'D']))
  })

  it('plays the A minor chain on the first chain levels, any of the twelve on the last', () => {
    expect(nextTask(at(7), null, seeded(1)).chain!.map((chord) => chord.name)).toEqual(['Am', 'Dm', 'G', 'C'])
    const starts = new Set(Array.from({ length: 200 }, (_, seed) => nextTask(at(9), null, seeded(seed)).chain![0]!.position))
    expect(starts.size).toBe(12)
  })

  it('takes a voicing only when exactly its keys are down', () => {
    expect(checkVoicing([57, 64, 72], [{ key: 57, time: 0 }, { key: 64, time: 0 }, { key: 72, time: 0.01 }])).toBe('right')
    expect(checkVoicing([57, 64, 72], [{ key: 57, time: 0 }, { key: 64, time: 0 }])).toBe('partial')
    // The third under the fifth: the same chord, not the voicing asked for.
    expect(checkVoicing([57, 64, 72], [{ key: 57, time: 0 }, { key: 60, time: 0 }, { key: 64, time: 0 }])).toBe('wrong')
  })
})

describe('«Септаккорды»', () => {
  const at = (id: number) => SEVENTH_LEVELS.find((item) => item.id === id)!
  const seeded = (seed: number) => {
    let state = seed * 2654435761
    return () => {
      state = (state + 0x6d2b79f5) | 0
      let x = Math.imul(state ^ (state >>> 15), 1 | state)
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296
    }
  }

  it('asks all seven seventh chords and D7 inversions, voiced inside C3-C5', () => {
    const types = new Set<string>()
    for (const id of [1, 3]) {
      for (let seed = 0; seed < 80; seed++) {
        const chord = nextTask(at(id), null, seeded(seed)).chordQuestion!.chord
        if (id === 1) types.add(chord.target.type)
        expect(checkChord(chord.keys, chord.target).status).toBe('correct')
        expect(Math.min(...chord.keys)).toBeGreaterThanOrEqual(48)
        expect(Math.max(...chord.keys)).toBeLessThanOrEqual(72)
      }
    }
    expect(types).toEqual(new Set(SEVENTH_TYPES))
  })

  it('builds D7 on the fifth degree, from the harmonic minor in minor', () => {
    expect(dominantSeventh('C').symbol).toBe('G7')
    expect(dominantSeventh('Am').symbol).toBe('E7')
    expect(dominantSeventh('C', 1).symbol).toBe('G7/B')
    const steps = nextTask(at(2), null, seeded(4)).chordSteps!
    expect(steps.chords.map((chord) => chord.target.type)).toEqual(['7', expect.stringMatching(/maj|min/)])
  })

  it('asks the order of bars with the answer from the form', () => {
    const task = nextTask(at(4), null, seeded(2))
    expect(task.form!.order).toEqual(playOrder(task.form!.bars))
  })

  it('judges articulation by hold time and, for an accent, by velocity', () => {
    expect(articulationVerdict('staccato', 0.2, null)).toBe('right')
    expect(articulationVerdict('staccato', 0.5, null)).toBe('shorter')
    expect(articulationVerdict('tenuto', 0.3, null)).toBe('longer')
    expect(articulationVerdict('accent', 0.3, 60)).toBe('louder')
    expect(articulationVerdict('accent', 0.3, 110)).toBe('right')
    // The screen and computer keys have no velocity: an accent counts.
    expect(articulationVerdict('accent', 0.3, null)).toBe('right')
  })
})
