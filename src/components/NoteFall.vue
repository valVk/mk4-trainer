<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { keyboardKeys } from '@/lib/keyboard'
import { PAD_NOTE_MIN_S } from '@/lib/padLayout'
import { HOLD_SHARE } from '@/lib/rhythm'
import type { SongNote } from '@/lib/song'

// Falling notes above PianoKeyboard: each note falls in its key's lane and reaches the bottom edge
// when it should be pressed. Same key geometry as PianoKeyboard, so lanes line up with the keys.
const props = withDefaults(defineProps<{
  notes: readonly SongNote[]
  /** First key of the 25-key window (a C). */
  start: number
  /** Song time in seconds, read every frame. */
  getTime: () => number
  /** Seconds of song shown above the keyboard. */
  lookahead?: number
  /** Keys of the step the song waits on («Ждать меня»): they stay bright at the line. */
  pending?: readonly number[]
  /** Keys the student holds now: a note held while it sounds turns green and stays green after (played). */
  held?: readonly number[]
  /** The student plays along (not just listening): a note that passes unplayed turns red (missed). */
  judge?: boolean
  /**
   * Pad mode: the note of each of the 8 pads. Each pad has its own lane right above it in PadStrip
   * (left to right 1 5 2 6 3 7 4 8); notes carry their pad number, top-row lanes and notes are darker.
   */
  padKeys?: readonly (number | null)[]
  /** Share of a note to hold before letting go (lib/skill); less is cut short. */
  holdShare?: number
}>(), {
  lookahead: 3,
  pending: () => [],
  held: () => [],
  judge: false,
  padKeys: undefined,
  holdShare: HOLD_SHARE,
})

const canvas = ref<HTMLCanvasElement | null>(null)
let frame = 0
const PAD_ROW = 4
const PAD_LANES = 8

/** A press this much before a note starts still plays it (fingers come a little early). */
const HOLD_EARLY_S = 0.15
/** Nothing pressed this long after a note started: it is missed (a press later than this is a stray one). */
const MISS_AFTER_S = 0.25
/** Notes the student held while they sounded: they stay green after they pass. */
let played = new WeakSet<SongNote>()
/** Played but let go too soon (before holdShare of the note): red, like a missed one. */
let cutShort = new WeakSet<SongNote>()
let lastNow = 0

/** Pixels between a note and the next one on the same key, so repeats read as separate notes. */
const NOTE_GAP_PX = 3

/** For every note, when the next note on its key starts (none for the last one). */
const nextOnKey = computed(() => {
  const next = new Map<SongNote, number>()
  const last = new Map<number, SongNote>()
  for (const note of [...props.notes].sort((a, b) => b.start - a.start)) {
    const later = last.get(note.key)
    if (later) next.set(note, later.start)
    last.set(note.key, note)
  }
  return next
})

/** Left-to-right lane (0-7) of a pad index (0-7): bottom pads on even lanes, top pads on odd ones. */
function padLane(index: number): number {
  return index < PAD_ROW ? index * 2 : (index - PAD_ROW) * 2 + 1
}
let colors = { white: '#3d7bff', black: '#2a5ad1', played: '#22b8a6', missed: '#ff5a4e', outside: '#8a90ab', line: '#cfd5e3', label: '#fff' }

function readColors() {
  const style = getComputedStyle(document.documentElement)
  const pick = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  colors = {
    white: pick('--color-active', colors.white),
    black: pick('--color-active-deep', colors.black),
    played: pick('--color-correct', colors.played),
    missed: pick('--color-wrong', colors.missed),
    outside: pick('--ui-text-dimmed', colors.outside),
    line: pick('--ui-border', colors.line),
    label: pick('--color-on-fill', colors.label),
  }
}

type Layout = { keys: Map<number, { black: boolean, whiteIndex: number }>, whiteWidth: number, width: number }

function layoutFor(width: number): Layout {
  const list = keyboardKeys(props.start)
  return {
    keys: new Map(list.map((item) => [item.note, item])),
    whiteWidth: width / list.filter((item) => !item.black).length,
    width,
  }
}

/** Horizontal position and width of a key's lane, in CSS pixels. */
function lane(key: number, { keys, whiteWidth, width }: Layout): { x: number, w: number, outside: boolean } {
  if (props.padKeys) {
    const index = props.padKeys.indexOf(key)
    const laneWidth = width / PAD_LANES
    return index === -1 ? { x: 0, w: 0, outside: true } : { x: padLane(index) * laneWidth + 6, w: laneWidth - 12, outside: false }
  }
  const found = keys.get(key)
  if (!found) {
    // Outside the window: a thin strip at the edge it is beyond.
    return key < props.start ? { x: 0, w: whiteWidth * 0.3, outside: true } : { x: width - whiteWidth * 0.3, w: whiteWidth * 0.3, outside: true }
  }
  if (found.black) return { x: (found.whiteIndex - 0.32) * whiteWidth, w: whiteWidth * 0.64, outside: false }
  return { x: found.whiteIndex * whiteWidth + 3, w: whiteWidth - 6, outside: false }
}

function draw() {
  const element = canvas.value
  if (!element) return
  const ratio = window.devicePixelRatio || 1
  const width = element.clientWidth
  const height = element.clientHeight
  if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
    element.width = Math.round(width * ratio)
    element.height = Math.round(height * ratio)
  }
  const context = element.getContext('2d')
  if (!context) return
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)

  const layout = layoutFor(width)
  context.fillStyle = colors.line
  if (props.padKeys) {
    // Pad mode: top-row lanes shaded like their pads, with a line between lanes.
    const laneWidth = width / PAD_LANES
    context.globalAlpha = 0.35
    for (let lane = 1; lane < PAD_LANES; lane += 2) context.fillRect(lane * laneWidth, 0, laneWidth, height)
    context.globalAlpha = 1
    for (let lane = 1; lane < PAD_LANES; lane++) context.fillRect(lane * laneWidth, 0, 1, height)
  } else {
    // Faint lines at each C, so octaves are easy to follow.
    for (const key of layout.keys.keys()) {
      if (key % 12 === 0) context.fillRect(lane(key, layout).x - 3, 0, 1, height)
    }
  }

  const now = props.getTime()
  // Back in time (a new attempt): nothing is played yet.
  if (now < lastNow - 0.3) {
    played = new WeakSet()
    cutShort = new WeakSet()
  }
  lastNow = now
  const pxPerSecond = height / props.lookahead
  const nextStart = nextOnKey.value
  const pending = new Set(props.pending)
  const held = new Set(props.held)
  for (const note of props.notes) {
    const until = note.start - now
    if (until > props.lookahead || until + note.length < -0.5) continue
    const { x, w, outside } = lane(note.key, layout)
    const bottom = height - until * pxPerSecond
    const padIndex = props.padKeys ? props.padKeys.indexOf(note.key) : -1
    // Pad notes last at least PAD_NOTE_MIN_S (their pad stays lit as long) and are tall enough to carry their number.
    const tall = padIndex === -1
      ? bottom - Math.max(6, note.length * pxPerSecond)
      : bottom - Math.max(22, Math.max(note.length, PAD_NOTE_MIN_S) * pxPerSecond)
    // A note ends a little before the next one on its key: repeated notes (a drum roll) stay apart.
    const next = nextStart.get(note)
    const top = next === undefined ? tall : Math.max(tall, height - (next - now) * pxPerSecond + NOTE_GAP_PX)
    // Darker: black keys, or pads of the top row.
    const isBlack = props.padKeys ? padIndex >= PAD_ROW : [1, 3, 6, 8, 10].includes(note.key % 12)
    // Held while it sounds (a press a little early counts): played, green now and after. Not played: blue.
    const end = note.start + Math.max(note.length, padIndex === -1 ? 0 : PAD_NOTE_MIN_S)
    if (until <= HOLD_EARLY_S && now < end && held.has(note.key)) played.add(note)
    // Keys only (a pad hit has no length): let go before most of the note has sounded.
    if (props.judge && padIndex === -1 && played.has(note) && !held.has(note.key) && now - note.start < note.length * props.holdShare) cutShort.add(note)
    const isPlayed = played.has(note) && !cutShort.has(note)
    // Not pressed a moment after it started: missed, red while it still crosses the line (the one the song waits on
    // is not missed: it waits). Faded once it is over.
    const missed = props.judge && (cutShort.has(note) || (!isPlayed && now - note.start > MISS_AFTER_S && !pending.has(note.key)))
    const over = now >= end && !pending.has(note.key)
    context.globalAlpha = over ? 0.45 : 1
    context.fillStyle = outside ? colors.outside : isPlayed ? colors.played : missed ? colors.missed : isBlack ? colors.black : colors.white
    context.beginPath()
    context.roundRect(x, top, w, bottom - top, Math.min(6, w / 2))
    context.fill()
    if (padIndex !== -1) {
      context.fillStyle = colors.label
      context.font = '700 15px system-ui, sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(String(padIndex + 1), x + w / 2, bottom - 11)
    }
  }
  context.globalAlpha = 1
  frame = requestAnimationFrame(draw)
}

const themeObserver = new MutationObserver(readColors)

onMounted(() => {
  readColors()
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  frame = requestAnimationFrame(draw)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  themeObserver.disconnect()
})

</script>

<template>
  <!-- The canvas is positioned absolutely: its pixel size must never feed back into the layout. -->
  <div class="fall">
    <canvas ref="canvas" class="fall__canvas" aria-hidden="true" />
  </div>
</template>

<style scoped>
.fall {
  position: relative;
  overflow: hidden;
}

.fall__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
