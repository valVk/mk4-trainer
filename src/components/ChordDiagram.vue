<script setup lang="ts">
import { computed } from 'vue'

import { intervalsBetween, pitchClass } from '@/lib/theory'

// Display-only keyboard: lit notes with semitone counts between them.
const props = withDefaults(defineProps<{
  lit: readonly number[]
  from?: number
  to?: number
  /** Light the notes one by one, lowest first, then show the gaps. */
  animated?: boolean
}>(), {
  from: 60,
  to: 72,
  animated: false,
})

const STEP_MS = 160
const BLACK_KEYS: ReadonlySet<number> = new Set([1, 3, 6, 8, 10])

const isBlack = (note: number) => BLACK_KEYS.has(pitchClass(note))

const sortedLit = computed(() => [...new Set(props.lit)].sort((a, b) => a - b))

const layout = computed(() => {
  const whites: number[] = []
  const blacks: { note: number, left: number }[] = []
  const centers = new Map<number, number>()
  for (let note = props.from; note <= props.to; note++) {
    if (isBlack(note)) {
      blacks.push({ note, left: whites.length })
      centers.set(note, whites.length)
    } else {
      centers.set(note, whites.length + 0.5)
      whites.push(note)
    }
  }
  const width = 100 / whites.length
  const sorted = sortedLit.value
  const gaps = intervalsBetween(sorted).map((semitones, i) => {
    const start = (centers.get(sorted[i] as number) ?? 0) * width
    const end = (centers.get(sorted[i + 1] as number) ?? 0) * width
    return { semitones, left: start, width: end - start, order: i + 1 }
  })
  return { whites, blacks, width, gaps }
})

function keyClass(note: number) {
  const order = sortedLit.value.indexOf(note)
  return order === -1 ? {} : { 'key--lit': true }
}

function keyDelay(note: number) {
  const order = sortedLit.value.indexOf(note)
  return order === -1 ? undefined : `${order * STEP_MS}ms`
}
</script>

<template>
  <div class="diagram" :class="{ 'diagram--animated': animated }">
    <div class="gaps" aria-hidden="true">
      <div
        v-for="gap in layout.gaps"
        :key="gap.left"
        class="gap"
        :style="{ left: `${gap.left}%`, width: `${gap.width}%`, '--delay': `${gap.order * STEP_MS + 80}ms` }"
      >
        <span>{{ gap.semitones }}</span>
      </div>
    </div>
    <div class="keys">
      <div
        v-for="note in layout.whites"
        :key="note"
        class="key key--white"
        :class="keyClass(note)"
        :style="{ width: `${layout.width}%`, '--delay': keyDelay(note) }"
      />
      <div
        v-for="black in layout.blacks"
        :key="black.note"
        class="key key--black"
        :class="keyClass(black.note)"
        :style="{ left: `${(black.left - 0.3) * layout.width}%`, width: `${layout.width * 0.6}%`, '--delay': keyDelay(black.note) }"
      />
    </div>
  </div>
</template>

<style scoped>
.diagram {
  --lit: var(--color-active);
}

.gaps {
  position: relative;
  height: 2.75rem;
}

.gap {
  position: absolute;
  bottom: 0.5rem;
  height: 0.75rem;
  border: 2px solid var(--lit);
  border-bottom: 0;
  border-radius: 0.5rem 0.5rem 0 0;
}

.gap span {
  position: absolute;
  left: 50%;
  bottom: 0.4rem;
  transform: translateX(-50%);
  font-family: var(--font-display);
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--lit);
}

.keys {
  position: relative;
  display: flex;
  height: 8.5rem;
}

.key {
  position: relative;
  overflow: hidden;
}

.key--white {
  height: 100%;
  border-right: 3px solid var(--ui-bg);
  border-radius: 0 0 0.5rem 0.5rem;
  background: var(--key-white);
  box-shadow: 0 0 0 1px var(--ui-border) inset, 0 3px 0 var(--rubber-edge);
}

.key--black {
  position: absolute;
  top: 0;
  height: 60%;
  border-radius: 0 0 0.375rem 0.375rem;
  background: var(--key-black);
  box-shadow: 0 3px 0 var(--rubber-edge);
}

/* Lit colour is a layer on top, so lighting up animates only opacity */
.key--lit::after {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--lit);
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--lit) 70%, var(--color-shade)) inset;
}

.diagram--animated .key--lit::after {
  animation: light 220ms var(--ease-out) var(--delay) both;
}

.diagram--animated .gap {
  animation: rise 260ms var(--ease-out) var(--delay) both;
}

@keyframes light {
  from { opacity: 0; }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .diagram--animated .gap {
    animation-name: light;
  }
}
</style>
