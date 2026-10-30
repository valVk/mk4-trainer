import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { barAt, clefFor, drumPlace, markPlayed, needsGrandStaff, slotsPerBar, spellBar, spellSpan, writePart, writePlayed, type WrittenBar } from '@/lib/notation'
import { parseSong, type SongNote } from '@/lib/song'

const FOUR = { numerator: 4, denominator: 4 }
// 4/4 at 120: two seconds a bar, a quarter is 0.5 s, a sixteenth 0.125 s.
const bars = [0, 2, 4, 6]
const note = (key: number, start: number, length: number): SongNote => ({ key, start, length, velocity: 90 })
const values = (bar: WrittenBar) => bar.notes.map((item) => `${item.keys.length ? item.keys.join('+') : 'rest'}:${item.duration}${item.dots ? '.' : ''}${item.tie ? '~' : ''}`)
const slotsOf = { whole: 16, half: 8, quarter: 4, eighth: 2, sixteenth: 1 } as const
/** Sixteenths written in a bar; a bar rest fills the whole bar whatever the meter. */
const barSlots = (bar: WrittenBar, full: number) => (bar.notes[0]?.barRest ? full : bar.notes.reduce((sum, item) => sum + slotsOf[item.duration] * (item.dots ? 1.5 : 1), 0))

describe('spellSpan', () => {
  it('writes spans with values that start on their beat', () => {
    expect(spellSpan(0, 16, FOUR).map((p) => p.duration)).toEqual(['whole'])
    expect(spellSpan(0, 12, FOUR)).toMatchObject([{ duration: 'half', dots: 1 }])
    // A half starting on beat 2 would cross the middle: a quarter, then a quarter.
    expect(spellSpan(4, 8, FOUR).map((p) => p.duration)).toEqual(['quarter', 'quarter'])
    expect(spellSpan(0, 6, FOUR)).toMatchObject([{ duration: 'quarter', dots: 1 }])
    expect(spellSpan(2, 4, FOUR).map((p) => p.duration)).toEqual(['eighth', 'eighth'])
  })

  it('knows the bar of each meter', () => {
    expect(slotsPerBar(FOUR)).toBe(16)
    expect(slotsPerBar({ numerator: 3, denominator: 4 })).toBe(12)
    expect(slotsPerBar({ numerator: 6, denominator: 8 })).toBe(12)
  })
})

describe('writePart', () => {
  it('snaps notes played a little off the beat', () => {
    // Four quarters played by a human: up to 30 ms early or late, a little short.
    const played = [note(60, 0.02, 0.45), note(62, 0.48, 0.47), note(64, 1.03, 0.44), note(65, 1.49, 0.48)]
    const [first] = writePart(played, bars, FOUR)
    expect(values(first!)).toEqual(['60:quarter', '62:quarter', '64:quarter', '65:quarter'])
  })

  it('makes chords from notes starting together and fills gaps with rests', () => {
    const played = [note(60, 0, 0.5), note(64, 0.01, 0.5), note(67, 0, 0.5), note(62, 1.5, 0.5)]
    const [first] = writePart(played, bars, FOUR)
    expect(values(first!)).toEqual(['60+64+67:quarter', 'rest:quarter', 'rest:quarter', '62:quarter'])
  })

  it('ties a note across the bar line and writes an empty bar as a bar rest', () => {
    const written = writePart([note(67, 1, 2)], bars, FOUR)
    expect(values(written[0]!)).toEqual(['rest:half', '67:half~'])
    expect(values(written[1]!)).toEqual(['67:half', 'rest:half'])
    expect(written[2]!.notes).toMatchObject([{ barRest: true, keys: [] }])
  })

  it('cuts a held note where the next one starts', () => {
    const [first] = writePart([note(60, 0, 2), note(62, 1, 1)], bars, FOUR)
    expect(values(first!)).toEqual(['60:half', '62:half'])
  })

  it('keeps the song time of every written note', () => {
    const [first] = writePart([note(60, 0.5, 0.5)], bars, FOUR)
    expect(first!.notes.map((item) => item.time)).toEqual([0, 0.5, 1])
  })
})

describe('clef and accidentals', () => {
  it('uses a grand staff only when one clef would need too many ledger lines', () => {
    const keys = (list: number[]) => list.map((key) => ({ key }))
    // A left hand around C3 and a right hand around C5.
    expect(needsGrandStaff(keys([48, 52, 55, 72, 76, 79]))).toBe(true)
    // A melody with one low note stays on one staff.
    expect(needsGrandStaff(keys([72, 74, 76, 77, 79, 81, 55]))).toBe(false)
  })

  it('chooses the clef from where most notes are', () => {
    expect(clefFor([60, 64, 67, 72].map((key) => ({ key })))).toBe('treble')
    expect(clefFor([36, 43, 48, 62].map((key) => ({ key })))).toBe('bass')
  })

  it('prints a sharp once per bar and a natural when the plain note comes back', () => {
    const spelled = spellBar([[61], [61], [60], [72]])
    expect(spelled.map((chord) => chord.map((key) => `${key.key}${key.accidental ?? ''}`))).toEqual([['c#/4#'], ['c#/4'], ['c/4n'], ['c/5']])
  })

  it('finds the bar at a song time', () => {
    const written = writePart([note(60, 0, 0.5)], bars, FOUR)
    expect([barAt(written, 0), barAt(written, 2.1), barAt(written, 99)]).toEqual([0, 1, 2])
  })
})

const LOCAL_SONG = resolve(process.cwd(), '../happy-birthday-20240118103815-midisite.com.mid')

describe.skipIf(!existsSync(LOCAL_SONG))('local song (local file)', () => {
  const buffer = readFileSync(LOCAL_SONG)
  const song = parseSong(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), 'song.mid')
  const piano = song.parts.find((part) => part.channel === 0)!

  it('writes the piano part as whole bars of known values', () => {
    const written = writePart(piano.notes, song.bars, song.timeSignature)
    expect(written.length).toBe(song.bars.length - 1)
    expect(written.every((bar) => barSlots(bar, slotsPerBar(song.timeSignature)) === slotsPerBar(song.timeSignature))).toBe(true)
  })

  it('keeps every note of the piano part', () => {
    const written = writePart(piano.notes, song.bars, song.timeSignature)
    const writtenKeys = new Set(written.flatMap((bar) => bar.notes.flatMap((item) => item.keys)))
    expect(new Set(piano.notes.map((item) => item.key))).toEqual(writtenKeys)
  })

  it('writes the piano in the treble clef and the bass in the bass clef', () => {
    expect(needsGrandStaff(piano.notes)).toBe(false)
    expect(clefFor(piano.notes)).toBe('treble')
    const bass = song.parts.find((part) => part.channel === 6)!
    expect(clefFor(bass.notes)).toBe('bass')
  })
})

describe('what the child played', () => {
  // The part: C quarter, D quarter, rest half.
  const part = writePart([note(60, 0, 0.5), note(62, 0.5, 0.5)], bars, FOUR)

  it('writes the keys on the same grid and grows a held key until now', () => {
    const played = writePlayed([{ key: 60, start: 0.02, end: null }], bars, FOUR, 0.95)
    expect(values(played[0]!)).toEqual(['60:half', 'rest:half'])
  })

  it('marks right, too long and wrong notes like a teacher reading along', () => {
    const played = writePlayed([
      { key: 60, start: 0.01, end: 0.49 },
      { key: 62, start: 0.5, end: 1.4 },
      { key: 65, start: 1.5, end: 1.9 },
    ], bars, FOUR, 2)
    const marks = markPlayed(part, played)
    // The D held too long is written as two tied pieces; both are «off».
    expect(Object.values(marks)).toEqual(['right', 'off', 'off', 'wrong'])
  })

  it('accepts another octave only when asked', () => {
    const played = writePlayed([{ key: 72, start: 0, end: 0.5 }], bars, FOUR, 1)
    expect(Object.values(markPlayed(part, played))).toEqual(['wrong'])
    expect(Object.values(markPlayed(part, played, true))).toEqual(['right'])
  })
})

describe('drums on the percussion staff', () => {
  it('writes a drum hit as lasting until the next one, at most to the end of its beat', () => {
    // Kick, snare an eighth later, kick on beat 3; every MIDI note is 30 ms long.
    const hits = [note(36, 0, 0.03), note(38, 0.25, 0.03), note(36, 1, 0.03)]
    const [first] = writePart(hits, bars, FOUR, true)
    expect(values(first!)).toEqual(['36:eighth', '38:eighth', 'rest:quarter', '36:quarter', 'rest:quarter'])
  })

  it('puts each drum where drummers read it', () => {
    expect(drumPlace(36)).toBe('f/4')
    expect(drumPlace(38)).toBe('c/5')
    expect(drumPlace(42)).toBe('g/5/x2')
    expect(drumPlace(49)).toBe('a/5/x2')
    expect([drumPlace(50), drumPlace(45), drumPlace(41)]).toEqual(['e/5', 'd/5', 'a/4'])
  })
})
