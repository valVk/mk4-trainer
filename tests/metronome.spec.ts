import { describe, expect, it } from 'vitest'

import {
  CALIBRATION_TAPS,
  DEFAULT_METRONOME,
  accentOf,
  beatSeconds,
  beatsPerBar,
  clampBpm,
  combinedLatency,
  estimateLatency,
  firstBeatFrom,
  parseLatencyHistories,
  parseLatencyHistory,
  parseMetronomeSettings,
  songBeats,
  tapInputOf,
  tempoName,
} from '@/lib/metronome'

describe('meters and accents', () => {
  it('counts the top number of the meter', () => {
    expect(beatsPerBar('2/4')).toBe(2)
    expect(beatsPerBar('3/4')).toBe(3)
    expect(beatsPerBar('6/8')).toBe(6)
  })

  it('marks strong and relatively strong beats like the video: 4/4 on 1 and 3, 6/8 on 1 and 4', () => {
    expect([0, 1, 2, 3].map((beat) => accentOf(beat, 4))).toEqual(['strong', 'weak', 'medium', 'weak'])
    expect([0, 1, 2, 3, 4, 5].map((beat) => accentOf(beat, 6))).toEqual(['strong', 'weak', 'weak', 'medium', 'weak', 'weak'])
    expect([0, 1, 2].map((beat) => accentOf(beat, 3))).toEqual(['strong', 'weak', 'weak'])
    expect([0, 1].map((beat) => accentOf(beat, 2))).toEqual(['strong', 'weak'])
  })
})

describe('tempo', () => {
  it('keeps the tempo in the metronome range', () => {
    expect(clampBpm(20)).toBe(40)
    expect(clampBpm(200)).toBe(160)
    expect(clampBpm(72.4)).toBe(72)
    expect(clampBpm(Number.NaN)).toBe(DEFAULT_METRONOME.bpm)
  })

  it('makes one beat a second at 60', () => {
    expect(beatSeconds(60)).toBe(1)
    expect(beatSeconds(120)).toBe(0.5)
  })

  it('names the tempo like a metronome does', () => {
    expect(tempoName(40)).toBe('largo')
    expect(tempoName(60)).toBe('larghetto')
    expect(tempoName(100)).toBe('andante')
    expect(tempoName(120)).toBe('allegro')
    expect(tempoName(160)).toBe('presto')
  })
})

describe('parseMetronomeSettings', () => {
  it('keeps valid settings and replaces broken ones', () => {
    expect(parseMetronomeSettings({ bpm: 90, meter: '3/4', sound: 'wood', volume: 0.5 })).toEqual({ bpm: 90, meter: '3/4', sound: 'wood', volume: 0.5 })
    expect(parseMetronomeSettings({ bpm: 'fast', meter: '5/4', sound: 'drum', volume: 3 })).toEqual(DEFAULT_METRONOME)
    expect(parseMetronomeSettings(null)).toEqual(DEFAULT_METRONOME)
  })
})

describe('songBeats', () => {
  it('splits every bar evenly and accents the first beat', () => {
    const beats = songBeats([0, 2, 4], 4)
    expect(beats.map((item) => item.time)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5])
    expect(beats[4]).toEqual({ time: 2, beat: 0, accent: 'strong' })
  })

  it('finds the next beat from a song position', () => {
    const beats = songBeats([0, 2, 4], 4)
    expect(firstBeatFrom(beats, 0)).toBe(0)
    expect(firstBeatFrom(beats, 0.7)).toBe(2)
    expect(firstBeatFrom(beats, 1)).toBe(2)
    expect(firstBeatFrom(beats, 9)).toBe(beats.length)
  })
})

describe('estimateLatency', () => {
  const clicks = Array.from({ length: 12 }, (_, i) => i * 0.75)

  it('takes the median delay of the taps', () => {
    const taps = clicks.slice(1, 1 + CALIBRATION_TAPS).map((click, i) => click + 0.06 + (i % 2 ? 0.01 : -0.01))
    expect(estimateLatency(taps, clicks)).toEqual({ offsetMs: 60, spreadMs: 10, steady: true, taps: CALIBRATION_TAPS })
  })

  it('ignores a stray tap far from any click', () => {
    const taps = [...clicks.slice(1, 1 + CALIBRATION_TAPS).map((click) => click + 0.05), 3.4]
    expect(estimateLatency(taps, clicks)?.offsetMs).toBe(50)
  })

  it('counts early taps as a negative delay', () => {
    const taps = clicks.slice(1, 1 + CALIBRATION_TAPS).map((click) => click - 0.03)
    expect(estimateLatency(taps, clicks)?.offsetMs).toBe(-30)
  })

  it('says unsteady when the taps scatter', () => {
    const taps = clicks.slice(1, 1 + CALIBRATION_TAPS).map((click, i) => click + (i % 2 ? 0.15 : -0.05))
    expect(estimateLatency(taps, clicks)?.steady).toBe(false)
  })

  it('waits for enough taps', () => {
    expect(estimateLatency([0.05, 0.8], clicks)).toBeNull()
    expect(estimateLatency([0.05], [])).toBeNull()
  })
})

describe('latency history', () => {
  it('reads the old single number and the new list, keeping the last five', () => {
    expect(parseLatencyHistory(59)).toEqual([59])
    expect(parseLatencyHistory(0)).toEqual([])
    expect(parseLatencyHistory([38, 9, 19, 22, 34, 22, 36, 0, 15])).toEqual([34, 22, 36, 0, 15])
    expect(parseLatencyHistory(['x', 12.6, null])).toEqual([13])
    expect(parseLatencyHistory(undefined)).toEqual([])
  })

  it('uses the median of the checks, so one odd try does not move it', () => {
    expect(combinedLatency([34, 22, 36, 0, 15])).toBe(22)
    expect(combinedLatency([20, 30])).toBe(25)
    expect(combinedLatency([])).toBe(0)
  })
})

describe('latency per input', () => {
  it('keeps the screen, the MK4 and the computer keyboard apart', () => {
    expect(parseLatencyHistories({ screen: [57, 84], midi: [12], keys: 'x' })).toEqual({ screen: [57, 84], midi: [12], keys: [] })
  })

  it('reads the older single list as screen checks', () => {
    expect(parseLatencyHistories([15, 57])).toEqual({ screen: [15, 57], midi: [], keys: [] })
    expect(parseLatencyHistories(54)).toEqual({ screen: [54], midi: [], keys: [] })
    expect(parseLatencyHistories(null)).toEqual({ screen: [], midi: [], keys: [] })
  })
})

describe('tapInputOf', () => {
  it('tells the MK4, the screen and the computer keyboard apart', () => {
    expect(tapInputOf({ source: 'midi' })).toBe('midi')
    expect(tapInputOf({ source: 'virtual', onScreen: true })).toBe('screen')
    expect(tapInputOf({ source: 'virtual' })).toBe('keys')
  })
})
