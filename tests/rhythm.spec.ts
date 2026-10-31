import { describe, expect, it } from 'vitest'

import {
  DURATIONS,
  barQuarters,
  countLabel,
  countLabels,
  fillsBars,
  generateBar,
  holdVerdict,
  noteQuarters,
  onTimeWindow,
  beatSeconds,
  countInBeat,
  quarterSeconds,
  scoreRhythm,
  sounds,
  splitBars,
  totalQuarters,
  type Duration,
  type Rhythm,
  type RhythmPress,
} from '@/lib/rhythm'

const FOUR = { numerator: 4, denominator: 4 }
const THREE = { numerator: 3, denominator: 4 }
const SIX_EIGHT = { numerator: 6, denominator: 8 }

describe('note values', () => {
  it('measures values, dots and tuplets in quarter notes', () => {
    expect(DURATIONS.map((duration) => noteQuarters({ duration }))).toEqual([4, 2, 1, 0.5, 0.25])
    expect(noteQuarters({ duration: 'half', dots: 1 })).toBe(3)
    expect(noteQuarters({ duration: 'quarter', dots: 1 })).toBe(1.5)
    expect(noteQuarters({ duration: 'quarter', dots: 2 })).toBe(1.75)
    // Three triplet eighths take one quarter.
    expect(3 * noteQuarters({ duration: 'eighth', tuplet: { actual: 3, normal: 2 } })).toBeCloseTo(1)
  })

  it('knows the bar of each meter and the beat the metronome counts', () => {
    expect([FOUR, THREE, SIX_EIGHT].map(barQuarters)).toEqual([4, 3, 3])
    expect(quarterSeconds(60, FOUR)).toBe(1)
    // In 6/8 the metronome counts eighths: at 120 an eighth is 0.5 s, a quarter 1 s.
    expect(quarterSeconds(120, SIX_EIGHT)).toBe(1)
  })

  it('counts down 4-3-2-1 in the last bar before the first note, then nothing', () => {
    // 60 bpm in 4/4: one beat a second.
    expect([-3.5, -2.5, -1.5, -0.5].map((position) => countInBeat(position, beatSeconds(60, FOUR), 4))).toEqual([4, 3, 2, 1])
    expect(countInBeat(0, 1, 4)).toBeNull()
    // A longer lead-in (a song's two bars): only its last bar is counted.
    expect(countInBeat(-6, 1, 4)).toBeNull()
    // 6/8 counts eighths: at 120 an eighth is half a second.
    expect(beatSeconds(120, SIX_EIGHT)).toBe(0.5)
    expect(countInBeat(-2.9, beatSeconds(120, SIX_EIGHT), 6)).toBe(6)
    expect(countInBeat(-0.25, 0.5, 6)).toBe(1)
  })
})

describe('sounds', () => {
  it('turns notes into seconds, merges ties and keeps rests silent', () => {
    const rhythm: Rhythm = {
      meter: FOUR,
      notes: [
        { duration: 'quarter' },
        { duration: 'quarter', tie: true },
        { duration: 'eighth' },
        { duration: 'eighth', rest: true },
        { duration: 'quarter' },
      ],
    }
    expect(sounds(rhythm, 60)).toEqual([
      { start: 0, length: 1, rest: false, index: 0 },
      { start: 1, length: 1.5, rest: false, index: 1 },
      { start: 2.5, length: 0.5, rest: true, index: 3 },
      { start: 3, length: 1, rest: false, index: 4 },
    ])
  })

  it('checks that a pickup and whole bars are filled exactly', () => {
    expect(fillsBars({ meter: FOUR, notes: [{ duration: 'whole' }] })).toBe(true)
    expect(fillsBars({ meter: FOUR, notes: [{ duration: 'half' }] })).toBe(false)
    expect(fillsBars({ meter: THREE, pickup: 1, notes: [{ duration: 'quarter' }, { duration: 'half', dots: 1 }] })).toBe(true)
  })
})

describe('generateBar', () => {
  // A fixed sequence instead of Math.random, so every run checks the same bars.
  const seeded = (seed: number) => () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const KNOWN: Duration[][] = [['whole', 'half'], ['half', 'quarter'], ['quarter', 'eighth'], ['quarter', 'eighth', 'sixteenth'], ['half', 'quarter', 'eighth', 'sixteenth']]

  it('always fills exactly one bar with the values the child knows', () => {
    for (const meter of [FOUR, THREE, { numerator: 2, denominator: 4 }, SIX_EIGHT]) {
      for (const durations of KNOWN) {
        for (let seed = 1; seed < 60; seed++) {
          const notes = generateBar(meter, { durations, rests: true, random: seeded(seed) })
          expect(totalQuarters({ notes })).toBeCloseTo(barQuarters(meter))
        }
      }
    }
  })

  it('never lets a note cross the middle of a 4/4 bar, and starts a half only on beat 1 or 3', () => {
    const crossing: string[] = []
    const misplacedHalves: number[] = []
    for (let seed = 1; seed < 200; seed++) {
      let position = 0
      for (const note of generateBar(FOUR, { durations: ['half', 'quarter', 'eighth'], random: seeded(seed) })) {
        const length = noteQuarters(note)
        if (position < 2 && position + length > 2) crossing.push(`${seed}@${position}`)
        if (note.duration === 'half' && position % 2 !== 0) misplacedHalves.push(position)
        position += length
      }
    }
    expect(crossing).toEqual([])
    expect(misplacedHalves).toEqual([])
  })

  it('never starts a bar with a rest', () => {
    for (let seed = 1; seed < 100; seed++) {
      expect(generateBar(FOUR, { durations: ['quarter'], rests: true, random: seeded(seed) })[0]!.rest).toBeFalsy()
    }
  })
})

describe('scoreRhythm', () => {
  // Four quarters at 60: notes at 0, 1, 2, 3 s, one second each.
  const quarters = sounds({ meter: FOUR, notes: Array.from({ length: 4 }, () => ({ duration: 'quarter' as const })) }, 60)
  const press = (time: number, held = 0.8): RhythmPress => ({ time, end: time + held })

  it('accepts a child a few dozen ms early or late as on time', () => {
    const score = scoreRhythm(quarters, [press(0.03), press(0.96), press(2.05), press(2.98)])
    expect(score.results.map((result) => result.verdict)).toEqual(['onTime', 'onTime', 'onTime', 'onTime'])
    expect(score.extra).toBe(0)
  })

  it('says early or late with the offset when a press is off but still belongs to the note', () => {
    const score = scoreRhythm(quarters, [press(0), press(0.85), press(2.15), press(3)])
    expect(score.results[1]).toMatchObject({ verdict: 'early' })
    expect(score.results[1]!.offset).toBeCloseTo(-0.15)
    expect(score.results[2]).toMatchObject({ verdict: 'late' })
  })

  it('counts a missed note and a double tap', () => {
    const score = scoreRhythm(quarters, [press(0), press(0.12), press(2), press(3)])
    expect(score.results.map((result) => result.verdict)).toEqual(['onTime', 'missed', 'onTime', 'onTime'])
    expect(score.extra).toBe(1)
  })

  it('does not count warming up before the first note', () => {
    expect(scoreRhythm(quarters, [press(-1.5), press(0), press(1), press(2), press(3)]).extra).toBe(0)
  })

  it('narrows the window for fast values: a quarter of a sixteenth at 60 is 62.5 ms', () => {
    const sixteenths = sounds({ meter: FOUR, notes: Array.from({ length: 16 }, () => ({ duration: 'sixteenth' as const })) }, 60)
    expect(onTimeWindow(sixteenths)).toBeCloseTo(0.0625)
    expect(onTimeWindow(quarters)).toBe(0.08)
  })

  it('checks how long a half note is held on keys, not on pads', () => {
    const halves = sounds({ meter: FOUR, notes: [{ duration: 'half' }, { duration: 'half' }] }, 60)
    // Let go after one count instead of two.
    const short = scoreRhythm(halves, [{ time: 0, end: 1 }, { time: 2, end: 3.9 }])
    expect(short.results.map((result) => result.hold)).toEqual(['short', 'ok'])
    const pads = scoreRhythm(halves, [{ time: 0, end: null }, { time: 2, end: null }], false)
    expect(pads.results.map((result) => result.hold)).toEqual([null, null])
  })

  it('calls a note too long only when it clearly runs into the next one', () => {
    expect(holdVerdict(1.1, 1)).toBe('ok')
    expect(holdVerdict(0.55, 1)).toBe('short')
    expect(holdVerdict(1.7, 1)).toBe('long')
    expect(holdVerdict(0.4, 0.25)).toBe('ok')
  })

  it('ignores taps during a rest only as extra, never as a hit for the next note', () => {
    const withRest = sounds({ meter: FOUR, notes: [{ duration: 'quarter' }, { duration: 'quarter', rest: true }, { duration: 'half' }] }, 60)
    const score = scoreRhythm(withRest, [press(0), press(1), press(2)])
    expect(score.results.map((result) => result.verdict)).toEqual(['onTime', 'onTime'])
    expect(score.extra).toBe(1)
  })
})

describe('splitBars', () => {
  it('cuts the notes into bars, with the pickup as its own short bar', () => {
    const rhythm: Rhythm = { meter: THREE, pickup: 1, notes: [{ duration: 'quarter' }, { duration: 'half', dots: 1 }, { duration: 'quarter' }, { duration: 'half' }] }
    expect(splitBars(rhythm).map((bar) => bar.map((item) => item.index))).toEqual([[0], [1], [2, 3]])
    expect(splitBars({ meter: FOUR, notes: [{ duration: 'whole' }, { duration: 'half' }, { duration: 'half' }] }).length).toBe(2)
  })
})

describe('counting under the notes', () => {
  it('says the beat number on a beat and «и» between beats', () => {
    expect([0, 1, 2, 3].map((position) => countLabel(position, FOUR))).toEqual(['1', '2', '3', '4'])
    expect(countLabel(1.5, FOUR)).toBe('и')
    expect(countLabel(0.25, FOUR)).toBe('')
  })

  it('counts eighths in 6/8', () => {
    expect([0, 0.5, 1, 1.5, 2, 2.5].map((position) => countLabel(position, SIX_EIGHT))).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('labels every note of a rhythm, not the rests, and counts a pickup from the end of its bar', () => {
    const labels = countLabels({ meter: FOUR, notes: [{ duration: 'quarter' }, { duration: 'quarter', rest: true }, { duration: 'eighth' }, { duration: 'eighth' }, { duration: 'quarter' }] })
    expect([...labels.entries()]).toEqual([[0, '1'], [2, '3'], [3, 'и'], [4, '4']])
    const pickup = countLabels({ meter: FOUR, pickup: 1, notes: [{ duration: 'quarter' }, { duration: 'whole' }] })
    expect([...pickup.values()]).toEqual(['4', '1'])
  })
})
