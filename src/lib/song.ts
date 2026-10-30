// Song model for the «Песня» mode: a MIDI file split into parts (one per channel), the notes of each part
// grouped into steps (what is pressed together) and a bar grid. Pure code, no Vue, no UI text.

import { BasicMIDI } from 'spessasynth_core'

/** Notes starting closer than this are one step: a chord pressed together. */
export const STEP_WINDOW_S = 0.03
/** GM drums live on MIDI channel 10 (index 9). */
export const DRUM_CHANNEL = 9

export interface SongNote {
  key: number
  /** Seconds from the start of the song. */
  start: number
  length: number
  velocity: number
}

/** Keys to press together, at one moment of the part. */
export interface Step {
  time: number
  /** Sorted, without duplicates. */
  keys: number[]
}

export interface Part {
  /** 0-based MIDI channel (shown to people as channel + 1). */
  channel: number
  /** GM program in effect when the part starts. */
  program: number
  isDrum: boolean
  notes: SongNote[]
  steps: Step[]
  range: { low: number, high: number }
  /** Most notes sounding at the same time. */
  maxPolyphony: number
}

export interface TimeSignature {
  numerator: number
  denominator: number
}

export interface Song {
  name: string
  /** Seconds. */
  duration: number
  /** Tempo at the start of the song. */
  bpm: number
  timeSignature: TimeSignature
  /** Sharps (positive) or flats (negative) of the key signature at the start; 0 when the file has none. */
  keySignature: number
  /** Start time of every bar in seconds; the last entry is the end of the last bar. */
  bars: number[]
  /** Channels that have notes, in channel order. */
  parts: Part[]
}

const META_TIME_SIGNATURE = 0x58
const META_KEY_SIGNATURE = 0x59
const STATUS_PROGRAM_CHANGE = 0xc0

/** Groups notes into steps: each step starts with a note and takes every note within STEP_WINDOW_S of it. */
export function buildSteps(notes: readonly SongNote[]): Step[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.key - b.key)
  const steps: Step[] = []
  let current: { time: number, keys: Set<number> } | null = null
  for (const note of sorted) {
    if (!current || note.start - current.time >= STEP_WINDOW_S) {
      if (current) steps.push({ time: current.time, keys: [...current.keys].sort((a, b) => a - b) })
      current = { time: note.start, keys: new Set() }
    }
    current.keys.add(note.key)
  }
  if (current) steps.push({ time: current.time, keys: [...current.keys].sort((a, b) => a - b) })
  return steps
}

/** Most notes sounding at once; a note ending exactly when another starts does not overlap it. */
export function maxPolyphony(notes: readonly SongNote[]): number {
  const edges = notes.flatMap((note) => [[note.start, 1], [note.start + note.length, -1]] as const)
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let sounding = 0
  let most = 0
  for (const [, change] of edges) {
    sounding += change
    most = Math.max(most, sounding)
  }
  return most
}

interface MeterChange extends TimeSignature {
  ticks: number
}

/** Bar start ticks from the meter changes, up to (and including) the bar that contains `endTicks`. */
export function barTicks(meters: readonly MeterChange[], timeDivision: number, endTicks: number): number[] {
  const changes = [...meters].sort((a, b) => a.ticks - b.ticks)
  if (changes.length === 0 || changes[0]!.ticks > 0) changes.unshift({ ticks: 0, numerator: 4, denominator: 4 })
  const bars: number[] = []
  let tick = 0
  let index = 0
  while (tick <= endTicks) {
    bars.push(tick)
    while (index + 1 < changes.length && changes[index + 1]!.ticks <= tick) index++
    const meter = changes[index]!
    tick += Math.round((timeDivision * 4 * meter.numerator) / meter.denominator)
  }
  bars.push(tick)
  return bars
}

function readMeters(midi: BasicMIDI): MeterChange[] {
  const meters: MeterChange[] = []
  for (const track of midi.tracks) {
    for (const event of track.events) {
      if (event.statusByte === META_TIME_SIGNATURE && event.data.length >= 2) {
        meters.push({ ticks: event.ticks, numerator: event.data[0]!, denominator: 2 ** event.data[1]! })
      }
    }
  }
  return meters
}

/** The first key signature of the file: sharps positive, flats negative (a signed byte in the file). */
function readKeySignature(midi: BasicMIDI): number {
  const events = midi.tracks.flatMap((track) => track.events).filter((event) => event.statusByte === META_KEY_SIGNATURE && event.data.length >= 1)
  const first = events.sort((a, b) => a.ticks - b.ticks)[0]
  if (!first) return 0
  const value = first.data[0]!
  return value > 127 ? value - 256 : value
}

/** The program each channel has when its first note sounds (GM program 0 if none was set). */
function readPrograms(midi: BasicMIDI, firstNoteTicks: number[]): number[] {
  const programs = Array.from({ length: 16 }, () => 0)
  const changes: { ticks: number, channel: number, program: number }[] = []
  for (const track of midi.tracks) {
    for (const event of track.events) {
      if ((event.statusByte & 0xf0) === STATUS_PROGRAM_CHANGE) {
        changes.push({ ticks: event.ticks, channel: event.statusByte & 0x0f, program: event.data[0] ?? 0 })
      }
    }
  }
  changes.sort((a, b) => a.ticks - b.ticks)
  for (const change of changes) {
    if (change.ticks <= (firstNoteTicks[change.channel] ?? Infinity)) programs[change.channel] = change.program
  }
  return programs
}

export function parseSong(buffer: ArrayBuffer, name = 'song'): Song {
  const midi = BasicMIDI.fromArrayBuffer(buffer, name)
  const noteTimes = midi.getNoteTimes()
  const firstNoteTicks = noteTimes.map((notes) => (notes.length ? midi.secondsToMIDITicks(notes[0]!.start) : Infinity))
  const programs = readPrograms(midi, firstNoteTicks)

  const parts: Part[] = []
  noteTimes.forEach((times, channel) => {
    if (times.length === 0) return
    const notes = times.map((note) => ({ key: note.midiNote, start: note.start, length: note.length, velocity: note.velocity }))
    const keys = notes.map((note) => note.key)
    parts.push({
      channel,
      program: programs[channel] ?? 0,
      isDrum: channel === DRUM_CHANNEL,
      notes,
      steps: buildSteps(notes),
      range: { low: Math.min(...keys), high: Math.max(...keys) },
      maxPolyphony: maxPolyphony(notes),
    })
  })

  // tempoChanges are ordered from the last change to the first: the first entry at tick 0 is the one in effect.
  // MIDI stores microseconds per beat, so 135 BPM reads back as 135.00135: round to 0.01.
  const startTempo = Math.round((midi.tempoChanges.find((change) => change.ticks === 0)?.tempo ?? 120) * 100) / 100
  const meters = readMeters(midi)
  const firstMeter = [...meters].sort((a, b) => a.ticks - b.ticks)[0]
  const endTicks = midi.secondsToMIDITicks(midi.duration)
  const bars = barTicks(meters, midi.timeDivision, endTicks).map((ticks) => midi.midiTicksToSeconds(ticks))

  return {
    name: midi.getName() || name,
    duration: midi.duration,
    bpm: startTempo,
    timeSignature: firstMeter ? { numerator: firstMeter.numerator, denominator: firstMeter.denominator } : { numerator: 4, denominator: 4 },
    keySignature: readKeySignature(midi),
    bars,
    parts,
  }
}

/** For each bar, whether the part sounds in it (a note starts in the bar or is still held into it). */
export function barActivity(part: Pick<Part, 'notes'>, bars: readonly number[]): boolean[] {
  const active = Array.from({ length: Math.max(0, bars.length - 1) }, () => false)
  for (const note of part.notes) {
    const end = note.start + note.length
    for (let bar = 0; bar < active.length; bar++) {
      if (bars[bar + 1]! <= note.start) continue
      if (bars[bar]! >= end) break
      active[bar] = true
    }
  }
  return active
}

/** Song name from the file name: no extension, no download-site suffix like "-20240118103815-midisite.com". */
export function songNameFromFile(fileName: string): string {
  const base = fileName.replace(/\.(mid|midi|kar|rmi)$/i, '')
  const cleaned = base.replace(/[-_]\d{8,}.*$/, '').replace(/[-_]+/g, ' ').trim()
  return cleaned ? cleaned.replace(/(^|\s)\S/g, (first) => first.toUpperCase()) : base
}
