// Metronome model (plan step 15): meters, accents, tempo names, beats of a song, latency calibration.
// No audio here: composables/useMetronome plays what this module computes.

import type { NoteEvent } from './noteSource'

export const METERS = ['2/4', '3/4', '4/4', '6/8'] as const
export type MeterId = (typeof METERS)[number]

export const METRONOME_SOUNDS = ['click', 'wood', 'cowbell'] as const
export type MetronomeSound = (typeof METRONOME_SOUNDS)[number]

export const BPM_MIN = 40
export const BPM_MAX = 160

/** Strong beat, relatively strong beat (start of the second simple meter), weak beat. */
export type Accent = 'strong' | 'medium' | 'weak'

export interface MetronomeSettings {
  bpm: number
  meter: MeterId
  sound: MetronomeSound
  /** 0-1. */
  volume: number
}

export const DEFAULT_METRONOME: MetronomeSettings = { bpm: 60, meter: '4/4', sound: 'click', volume: 0.8 }

/** Beats per bar: the top number of the meter. In 6/8 the metronome counts eighths. */
export function beatsPerBar(meter: MeterId): number {
  return Number(meter.split('/')[0])
}

/**
 * Compound meters are simple meters added together: 4/4 = 2/4 + 2/4, 6/8 = 3/8 + 3/8.
 * The first beat of the bar is strong, the first beat of the second half is relatively strong.
 */
export function accentOf(beat: number, beats: number): Accent {
  if (beat === 0) return 'strong'
  if ((beats === 4 || beats === 6) && beat === beats / 2) return 'medium'
  return 'weak'
}

export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return DEFAULT_METRONOME.bpm
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(bpm)))
}

export function beatSeconds(bpm: number): number {
  return 60 / clampBpm(bpm)
}

/** Italian tempo names as printed on a metronome, slowest first, with the lowest BPM of each range. */
const TEMPO_NAMES = [
  { from: 0, id: 'largo' },
  { from: 60, id: 'larghetto' },
  { from: 66, id: 'adagio' },
  { from: 76, id: 'andante' },
  { from: 108, id: 'moderato' },
  { from: 120, id: 'allegro' },
  { from: 156, id: 'presto' },
] as const

export type TempoName = (typeof TEMPO_NAMES)[number]['id']

export function tempoName(bpm: number): TempoName {
  let name: TempoName = 'largo'
  for (const item of TEMPO_NAMES) if (bpm >= item.from) name = item.id
  return name
}

/** Settings read back from storage; anything unknown falls back to the default. */
export function parseMetronomeSettings(value: unknown): MetronomeSettings {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<keyof MetronomeSettings, unknown>>
  return {
    bpm: typeof raw.bpm === 'number' ? clampBpm(raw.bpm) : DEFAULT_METRONOME.bpm,
    meter: METERS.includes(raw.meter as MeterId) ? (raw.meter as MeterId) : DEFAULT_METRONOME.meter,
    sound: METRONOME_SOUNDS.includes(raw.sound as MetronomeSound) ? (raw.sound as MetronomeSound) : DEFAULT_METRONOME.sound,
    volume: typeof raw.volume === 'number' && raw.volume >= 0 && raw.volume <= 1 ? raw.volume : DEFAULT_METRONOME.volume,
  }
}

export interface SongBeat {
  /** Seconds from the start of the song. */
  time: number
  /** Beat in its bar, from 0. */
  beat: number
  accent: Accent
}

/** Every beat of a song, splitting each bar evenly by the meter's top number. */
export function songBeats(bars: readonly number[], beats: number): SongBeat[] {
  const count = Math.max(1, Math.round(beats))
  const result: SongBeat[] = []
  for (let bar = 0; bar + 1 < bars.length; bar++) {
    const start = bars[bar]!
    const length = (bars[bar + 1]! - start) / count
    for (let beat = 0; beat < count; beat++) result.push({ time: start + beat * length, beat, accent: accentOf(beat, count) })
  }
  return result
}

/** Index of the first beat at or after `time` (beats sorted by time). */
export function firstBeatFrom(beats: readonly { time: number }[], time: number): number {
  let low = 0
  let high = beats.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (beats[middle]!.time < time - 1e-6) low = middle + 1
    else high = middle
  }
  return low
}

/** Taps needed for a latency measurement. */
export const CALIBRATION_TAPS = 8
/** Taps further than this from a beat are not counted (seconds). */
const CALIBRATION_MAX_OFFSET_S = 0.25
/** A measurement is steady when the taps spread less than this around their median (seconds). */
const CALIBRATION_STEADY_S = 0.035

export interface LatencyEstimate {
  /** How late the taps come after the heard click, in ms (negative: early). */
  offsetMs: number
  /** Median distance of the taps from that offset, in ms. */
  spreadMs: number
  steady: boolean
  /** Taps that were matched to a beat. */
  taps: number
}

/** How many successful checks are kept; the delay used is their median. */
export const LATENCY_HISTORY = 5

/**
 * Stored checks, newest last. Older versions stored one number (the last check).
 * Anything else is dropped.
 */
export function parseLatencyHistory(value: unknown): number[] {
  const list = typeof value === 'number' ? (value === 0 ? [] : [value]) : Array.isArray(value) ? value : []
  return list.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)).map(Math.round).slice(-LATENCY_HISTORY)
}

/**
 * Where taps come from. Each has its own delay: on Android a touch on the screen
 * arrives later than a key or pad of the MK4.
 */
export const TAP_INPUTS = ['screen', 'midi', 'keys'] as const
export type TapInput = (typeof TAP_INPUTS)[number]
export type LatencyHistories = Record<TapInput, number[]>

/** Which input a key or pad press came from, for its own delay. */
export function tapInputOf(event: Pick<Extract<NoteEvent, { type: 'noteOn' | 'pad' }>, 'source' | 'onScreen'>): TapInput {
  if (event.source === 'midi') return 'midi'
  return event.onScreen ? 'screen' : 'keys'
}

/** Stored checks per input. Older versions kept one list (or one number) from the screen button. */
export function parseLatencyHistories(value: unknown): LatencyHistories {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const raw = value as Partial<Record<TapInput, unknown>>
    return { screen: parseLatencyHistory(raw.screen), midi: parseLatencyHistory(raw.midi), keys: parseLatencyHistory(raw.keys) }
  }
  return { screen: parseLatencyHistory(value), midi: [], keys: [] }
}

/** One hand-tapped check varies by ±20 ms: the median of the last checks is the steady value. */
export function combinedLatency(history: readonly number[]): number {
  return history.length ? Math.round(median(history)) : 0
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

/**
 * Matches each tap to the nearest click and takes the median delay, so one stray tap
 * does not move the result. Null until enough taps land near a click.
 */
export function estimateLatency(taps: readonly number[], clicks: readonly number[]): LatencyEstimate | null {
  if (clicks.length === 0) return null
  const offsets: number[] = []
  for (const tap of taps) {
    let nearest = clicks[0]!
    for (const click of clicks) if (Math.abs(tap - click) < Math.abs(tap - nearest)) nearest = click
    const offset = tap - nearest
    if (Math.abs(offset) <= CALIBRATION_MAX_OFFSET_S) offsets.push(offset)
  }
  if (offsets.length < CALIBRATION_TAPS - 2) return null
  const offset = median(offsets)
  const spread = median(offsets.map((value) => Math.abs(value - offset)))
  return {
    offsetMs: Math.round(offset * 1000),
    spreadMs: Math.round(spread * 1000),
    steady: spread < CALIBRATION_STEADY_S,
    taps: offsets.length,
  }
}

/**
 * The classic metronome scale (Maelzel), as printed on a mechanical metronome: tempos are picked from
 * it with one tap instead of stepping +/- many times.
 */
export const METRONOME_SCALE = [40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63, 66, 69, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 126, 132, 138, 144, 152, 160, 168, 176, 184, 192, 200, 208] as const

/** The marks of the scale between `low` and `high`, grouped by tempo name, slowest first. */
export function scaleGroups(low = 40, high = 208): { name: TempoName, marks: number[] }[] {
  const groups: { name: TempoName, marks: number[] }[] = []
  for (const mark of METRONOME_SCALE) {
    if (mark < low || mark > high) continue
    const name = tempoName(mark)
    const last = groups[groups.length - 1]
    if (last?.name === name) last.marks.push(mark)
    else groups.push({ name, marks: [mark] })
  }
  return groups
}
