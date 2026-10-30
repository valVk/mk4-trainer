import { describe, expect, it } from 'vitest'

import { KEYBOARD_KEYS } from '@/lib/keyboard'
import { PIECES, buildPieceMidi, builtinId, pieceFileName, pitch, rhythmVoice, voice, voiceQuarters } from '@/lib/pieces'
import { barQuarters } from '@/lib/rhythm'
import { RHYTHM_LEVELS } from '@/lib/rhythmLevels'
import { parseSong } from '@/lib/song'

describe('writing pieces', () => {
  it('reads note names and values', () => {
    expect([pitch('C4'), pitch('A4'), pitch('D#5'), pitch('Bb3'), pitch('E2')]).toEqual([60, 69, 75, 58, 40])
    expect(voice('E5/16 r/8 A4/4.')).toEqual([
      { key: 76, duration: 'sixteenth', dots: 0 },
      { key: null, duration: 'eighth', dots: 0 },
      { key: 69, duration: 'quarter', dots: 1 },
    ])
  })

  it('turns a tune into drum hits with the same rhythm', () => {
    expect(rhythmVoice(voice('C4/4 r/4 D4/2'), 38).map((note) => note.key)).toEqual([38, null, 38])
  })

  it('names stored copies by id and version', () => {
    expect(pieceFileName({ id: 'fur-elise', version: 2 })).toBe('builtin-fur-elise-v2.mid')
    expect(builtinId('builtin-fur-elise-v2.mid')).toBe('fur-elise')
    expect(builtinId('My song.mid')).toBeNull()
  })
})

describe.each(PIECES.map((piece) => [piece.title, piece] as const))('%s', (_, piece) => {
  const song = parseSong(buildPieceMidi(piece), pieceFileName(piece))
  const learner = song.parts.find((part) => part.channel === piece.learner)!

  it('fills whole bars in every voice', () => {
    const bar = barQuarters(piece.meter)
    for (const item of piece.voices) expect(voiceQuarters(item.notes) / bar % 1).toBeCloseTo(0)
  })

  it('reads back as a song with its meter, every voice and the part to learn', () => {
    expect(song.timeSignature).toEqual(piece.meter)
    expect(song.parts.map((part) => part.channel).sort()).toEqual(piece.voices.map((item) => item.channel).sort())
    expect(learner.notes.length).toBe(piece.voices.find((item) => item.channel === piece.learner)!.notes.filter((note, index, notes) => note.key !== null && !notes[index - 1]?.tie).length)
  })

  it('fits the 25 keys of the MK4 (plan: every built-in piece)', () => {
    expect(learner.range.high - learner.range.low).toBeLessThan(KEYBOARD_KEYS)
  })

  it('a rhythm piece taps exactly when the tune plays', () => {
    if (piece.kind !== 'rhythm' || piece.groove) return
    const tune = song.parts.find((part) => part.channel === 0)!
    expect(learner.notes.map((note) => note.start.toFixed(3))).toEqual(tune.notes.map((note) => note.start.toFixed(3)))
  })
})

describe('rhythm pieces in «Теория»', () => {
  it('each comes after a real level and has a short chip name', () => {
    for (const piece of PIECES.filter((item) => item.kind === 'rhythm')) {
      expect(RHYTHM_LEVELS.some((level) => level.id === piece.afterLevel)).toBe(true)
      expect(piece.short!.length).toBeLessThanOrEqual(12)
    }
  })
})

describe('ties', () => {
  it('writes a tie after the value and sounds the tied notes as one', () => {
    expect(voice('C5/4~ C5/16')).toEqual([{ key: 72, duration: 'quarter', dots: 0, tie: true }, { key: 72, duration: 'sixteenth', dots: 0 }])
    const piece = PIECES.find((item) => item.id === 'entertainer')!
    const song = parseSong(buildPieceMidi(piece), pieceFileName(piece))
    const tune = song.parts.find((part) => part.channel === 0)!
    // The first long C: a sixteenth tied over the bar line to a quarter and a sixteenth, six sixteenths at 56 BPM.
    const longC = tune.notes.find((note) => note.key === 72 && note.length > 0.6)!
    expect(longC.length).toBeCloseTo((60 / 56) * 1.5, 1)
  })
})
