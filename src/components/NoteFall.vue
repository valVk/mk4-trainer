<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { keyboardKeys } from '@/lib/keyboard'
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
  /** Keys of the step waiting to be played, drawn brighter. */
  pending?: readonly number[]
}>(), {
  lookahead: 3,
  pending: () => [],
})

const canvas = ref<HTMLCanvasElement | null>(null)
let frame = 0
let colors = { white: '#3d7bff', black: '#2a5ad1', pending: '#22b8a6', outside: '#8a90ab', line: '#cfd5e3' }

function readColors() {
  const style = getComputedStyle(document.documentElement)
  const pick = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  colors = {
    white: pick('--color-pad-sky', colors.white),
    black: '#2a5ad1',
    pending: pick('--color-pad-aqua', colors.pending),
    outside: pick('--ui-text-dimmed', colors.outside),
    line: pick('--ui-border', colors.line),
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
  // Faint lines at each C, so octaves are easy to follow.
  context.fillStyle = colors.line
  for (const key of layout.keys.keys()) {
    if (key % 12 === 0) context.fillRect(lane(key, layout).x - 3, 0, 1, height)
  }

  const now = props.getTime()
  const pxPerSecond = height / props.lookahead
  const pending = new Set(props.pending)
  for (const note of props.notes) {
    const until = note.start - now
    if (until > props.lookahead || until + note.length < -0.5) continue
    const { x, w, outside } = lane(note.key, layout)
    const bottom = height - until * pxPerSecond
    const top = bottom - Math.max(6, note.length * pxPerSecond)
    const isBlack = [1, 3, 6, 8, 10].includes(note.key % 12)
    context.globalAlpha = until < 0 ? 0.35 : 1
    context.fillStyle = outside ? colors.outside : pending.has(note.key) && Math.abs(until) < 0.15 ? colors.pending : isBlack ? colors.black : colors.white
    context.beginPath()
    context.roundRect(x, top, w, bottom - top, Math.min(6, w / 2))
    context.fill()
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
