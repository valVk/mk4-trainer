import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { activeRuns, partPhrases, partRole, phraseSignature, songSections, suggestOrder } from '@/lib/phrases'
import { buildSteps, parseSong, type Part, type SongNote } from '@/lib/song'

/** 2 s per bar (120 BPM, 4/4). */
const bars = Array.from({ length: 33 }, (_, i) => i * 2)
const note = (key: number, start: number, length = 0.4): SongNote => ({ key, start, length, velocity: 90 })

function part(channel: number, notes: SongNote[], extra: Partial<Part> = {}): Part {
  const keys = notes.map((n) => n.key)
  return {
    channel,
    program: 0,
    isDrum: false,
    notes,
    steps: buildSteps(notes),
    range: { low: Math.min(...keys), high: Math.max(...keys) },
    maxPolyphony: 1,
    ...extra,
  }
}

/** A 2-bar motif (4 notes) starting at `bar`, moved by `shift` semitones. */
const motif = (bar: number, shift = 0) =>
  [0, 1, 2, 3].map((i) => note(60 + shift + [0, 4, 7, 4][i]!, bar * 2 + i))

describe('activeRuns', () => {
  it('splits at silent bars', () => {
    expect(activeRuns([true, true, false, true, false, false, true])).toEqual([
      { start: 0, end: 2 }, { start: 3, end: 4 }, { start: 6, end: 7 },
    ])
  })
})

describe('phraseSignature', () => {
  it('is the same for a moved and a transposed copy', () => {
    const first = phraseSignature(buildSteps(motif(0)), bars, 0)
    const later = phraseSignature(buildSteps(motif(4, 5)), bars, 4)
    expect(later.signature).toBe(first.signature)
    expect(later.base - first.base).toBe(5)
  })

  it('differs when the rhythm differs', () => {
    const straight = phraseSignature(buildSteps(motif(0)), bars, 0)
    const shifted = phraseSignature(buildSteps(motif(0).map((n, i) => (i === 1 ? { ...n, start: n.start + 0.5 } : n))), bars, 0)
    expect(shifted.signature).not.toBe(straight.signature)
  })
})

describe('partPhrases', () => {
  it('cuts 4-bar phrases on bar lines and splits at rests', () => {
    // Bars 0-3 and 4-7 play, bar 8 is silent, bars 9-10 play.
    const notes = [...motif(0), ...motif(2), ...motif(4), ...motif(6), ...motif(9)]
    const phrases = partPhrases(part(0, notes), bars)
    expect(phrases.map((p) => [p.startBar, p.endBar])).toEqual([[0, 4], [4, 8], [9, 11]])
    expect(phrases[0]!.start).toBe(0)
    expect(phrases[2]!.end).toBe(22)
  })

  it('groups exact and transposed repeats; only the first is new', () => {
    const notes = [...motif(0), ...motif(2), ...motif(4), ...motif(6), ...motif(8, 3), ...motif(10, 3), ...motif(12, 1), ...motif(14)]
    const phrases = partPhrases(part(0, notes), bars)
    expect(phrases.map((p) => p.group)).toEqual([0, 0, 0, 1])
    expect(phrases.map((p) => p.transpose)).toEqual([0, 0, 3, 0])
    expect(phrases.map((p) => p.isNew)).toEqual([true, false, false, true])
  })

  it('cuts dense phrases into 2-bar pieces', () => {
    // 8 notes per bar for 4 bars = 32 steps.
    const notes = Array.from({ length: 32 }, (_, i) => note(60 + (i % 5), i * 0.25, 0.2))
    const phrases = partPhrases(part(0, notes), bars)
    expect(phrases.map((p) => [p.startBar, p.endBar])).toEqual([[0, 2], [2, 4]])
  })
})

describe('songSections', () => {
  it('starts a new section where parts enter or leave, merging short pieces', () => {
    const drums = part(9, Array.from({ length: 8 }, (_, i) => note(36, 16 + i * 2)), { isDrum: true })
    const bass = part(1, Array.from({ length: 16 }, (_, i) => note(36, i * 2)))
    const lead = part(0, [...motif(0), ...motif(2)])
    const sections = songSections({ bars: bars.slice(0, 17), parts: [lead, bass, drums] })
    expect(sections.map((s) => [s.startBar, s.endBar])).toEqual([[0, 4], [4, 8], [8, 16]])
    expect(sections.map((s) => s.channels)).toEqual([[0, 1], [1], [1, 9]])
  })
})

describe('roles and order', () => {
  const bass = part(1, [note(36, 0), note(41, 1), note(43, 2)])
  const chords = part(2, [note(60, 0, 2), note(64, 0, 2), note(67, 0, 2)], { maxPolyphony: 3 })
  const melody = part(0, [note(72, 0), note(74, 1)])
  const busyMelody = part(3, Array.from({ length: 20 }, (_, i) => note(70 + (i % 3), i * 0.5)))
  const drums = part(9, [note(36, 0)], { isDrum: true })
  const crystal = part(8, [note(30, 0), note(55, 1)], { program: 98 })
  const riffWithDyads = part(4, [note(65, 0), note(68, 0), note(72, 1), note(75, 2), note(77, 3)], { maxPolyphony: 3 })

  it('recognises bass, chords, melody, effects and drums', () => {
    expect([bass, chords, melody, crystal, drums].map(partRole)).toEqual(['bass', 'chords', 'melody', 'effects', 'drums'])
  })

  it('calls a riff with an occasional dyad a melody, not chords', () => {
    expect(partRole(riffWithDyads)).toBe('melody')
  })

  it('suggests bass, then chords, then the easier melody first, effects last; no drums', () => {
    expect(suggestOrder([busyMelody, drums, crystal, melody, chords, bass])).toEqual([
      { channel: 1, role: 'bass' },
      { channel: 2, role: 'chords' },
      { channel: 0, role: 'melody' },
      { channel: 3, role: 'melody' },
      { channel: 8, role: 'effects' },
    ])
  })
})

const LOCAL_SONG = resolve(process.cwd(), '../happy-birthday-20240118103815-midisite.com.mid')

describe.skipIf(!existsSync(LOCAL_SONG))('local song (local file)', () => {
  const song = (() => {
    if (!existsSync(LOCAL_SONG)) return null
    const data = readFileSync(LOCAL_SONG)
    return parseSong(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), 'song.mid')
  })()

  it('finds few new patterns in the piano part: the riff repeats', () => {
    const piano = song!.parts.find((p) => p.channel === 0)!
    const phrases = partPhrases(piano, song!.bars)
    const fresh = phrases.filter((p) => p.isNew).length
    expect(phrases.length).toBeGreaterThan(20)
    expect(fresh).toBeLessThan(phrases.length / 2)
  })

  it('splits the song into several sections and suggests a bass line first', () => {
    const sections = songSections(song!)
    expect(sections.length).toBeGreaterThan(3)
    expect(sections.every((s) => s.endBar - s.startBar >= 4 || s.index === sections.length - 1)).toBe(true)
    expect(suggestOrder(song!.parts)[0]!.role).toBe('bass')
  })
})
