import { MIDIBuilder } from 'spessasynth_core'
import { describe, expect, it } from 'vitest'

import { STEP_WINDOW_S, barActivity, barTicks, buildSteps, maxPolyphony, parseSong, songNameFromFile, type SongNote } from '@/lib/song'

const TPQ = 480

/** A small format-0 song: piano chords on channel 1, a bass line on channel 2, drums on channel 10. */
function buildTestSong(): ArrayBuffer {
  const midi = new MIDIBuilder({ timeDivision: TPQ, initialTempo: 120, format: 0, name: 'Test song' })
  const beat = TPQ
  midi.programChange(0, 0, 0, 0)
  midi.programChange(0, 0, 1, 33)
  // Bar 1: C major then F major as chords, one beat each, with a 2-beat rest.
  for (const [at, chord] of [[0, [60, 64, 67]], [beat, [65, 69, 72]]] as const) {
    for (const key of chord) midi.noteOn(at, 0, 0, key, 90)
    for (const key of chord) midi.noteOff(at + beat, 0, 0, key)
  }
  // Bass: one note per beat over two bars.
  for (let i = 0; i < 8; i++) {
    midi.noteOn(i * beat, 0, 1, 36 + (i % 2) * 7, 80)
    midi.noteOff((i + 1) * beat, 0, 1, 36 + (i % 2) * 7)
  }
  // Drums: kick on beats 1 and 3 of bar 2.
  for (const at of [4 * beat, 6 * beat]) {
    midi.noteOn(at, 0, 9, 36, 100)
    midi.noteOff(at + beat / 4, 0, 9, 36)
  }
  midi.flush()
  return midi.writeMIDI()
}

const note = (key: number, start: number, length = 0.5): SongNote => ({ key, start, length, velocity: 90 })

describe('buildSteps', () => {
  it('groups notes starting together into one step with sorted keys', () => {
    const steps = buildSteps([note(67, 0), note(60, 0.01, 1), note(64, 0.02), note(65, 0.5)])
    // Each key keeps its note's length: the student must hold it.
    expect(steps).toEqual([{ time: 0, keys: [60, 64, 67], lengths: [1, 0.5, 0.5] }, { time: 0.5, keys: [65], lengths: [0.5] }])
  })

  it('splits notes that are further apart than the window', () => {
    const steps = buildSteps([note(60, 0), note(62, STEP_WINDOW_S)])
    expect(steps.map((step) => step.keys)).toEqual([[60], [62]])
  })

  it('drops repeated keys inside a step', () => {
    expect(buildSteps([note(60, 0), note(60, 0.005, 2)])).toEqual([{ time: 0, keys: [60], lengths: [2] }])
  })
})

describe('maxPolyphony', () => {
  it('counts overlapping notes, not touching ones', () => {
    expect(maxPolyphony([note(60, 0, 1), note(64, 0, 1), note(67, 0.5, 1)])).toBe(3)
    expect(maxPolyphony([note(60, 0, 0.5), note(62, 0.5, 0.5)])).toBe(1)
  })
})

describe('barTicks', () => {
  it('builds 4/4 bars up to the end', () => {
    expect(barTicks([], TPQ, 4 * TPQ * 2 - 1)).toEqual([0, 1920, 3840])
  })

  it('follows meter changes', () => {
    const meters = [{ ticks: 0, numerator: 3, denominator: 4 }, { ticks: 1440, numerator: 4, denominator: 4 }]
    // One 3/4 bar (1440 ticks), then 4/4 bars (1920 ticks); the last entry closes the bar holding tick 3000.
    expect(barTicks(meters, TPQ, 3000)).toEqual([0, 1440, 3360])
  })
})

describe('barActivity', () => {
  const bars = [0, 2, 4, 6]

  it('marks bars where notes start or are still held', () => {
    expect(barActivity({ notes: [note(60, 0.5, 0.5)] }, bars)).toEqual([true, false, false])
    expect(barActivity({ notes: [note(60, 1, 2)] }, bars)).toEqual([true, true, false])
    expect(barActivity({ notes: [note(60, 5, 0.2)] }, bars)).toEqual([false, false, true])
  })

  it('does not count a note that ends exactly on the bar line', () => {
    expect(barActivity({ notes: [note(60, 0, 2)] }, bars)).toEqual([true, false, false])
  })
})

describe('songNameFromFile', () => {
  it('drops the extension and the download-site suffix', () => {
    expect(songNameFromFile('happy-birthday-20240118103815-midisite.com.mid')).toBe('Happy Birthday')
    expect(songNameFromFile('My_Song.MIDI')).toBe('My Song')
    expect(songNameFromFile('tune.mid')).toBe('Tune')
  })
})

describe('parseSong', () => {
  const song = parseSong(buildTestSong(), 'test.mid')

  it('reads tempo, meter, name and length', () => {
    expect(song.bpm).toBe(120)
    expect(song.timeSignature).toEqual({ numerator: 4, denominator: 4 })
    expect(song.name).toBe('Test song')
    expect(song.duration).toBeCloseTo(4, 1)
  })

  it('makes one part per channel with notes', () => {
    expect(song.parts.map((part) => part.channel)).toEqual([0, 1, 9])
    expect(song.parts.map((part) => part.isDrum)).toEqual([false, false, true])
  })

  it('reads programs, ranges, steps and polyphony', () => {
    const [piano, bass] = song.parts
    expect(piano!.program).toBe(0)
    expect(bass!.program).toBe(33)
    expect(piano!.range).toEqual({ low: 60, high: 72 })
    expect(piano!.steps.map((step) => step.keys)).toEqual([[60, 64, 67], [65, 69, 72]])
    expect(piano!.maxPolyphony).toBe(3)
    expect(bass!.steps).toHaveLength(8)
    expect(bass!.maxPolyphony).toBe(1)
  })

  it('builds the bar grid in seconds (120 BPM, 4/4: 2 s per bar)', () => {
    expect(song.bars.slice(0, 3).map((t) => +t.toFixed(3))).toEqual([0, 2, 4])
  })
})
