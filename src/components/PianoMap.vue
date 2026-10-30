<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { KEYBOARD_KEYS, isBlackKey } from '@/lib/keyboard'
import { OCTAVE_NAMES, PIANO_HIGH, PIANO_LOW, octaveOf } from '@/lib/staff'

// The whole piano as a picture (plan step 19): 88 keys, the name of every octave under it, and the
// 25 keys of the MK4 that are under the hands now as a band. A picture only: it is not played.

const props = defineProps<{
  /** First key of the MK4 window. */
  windowStart: number
  /** Where the window usually is (C3-C5, the small and first octaves, as the MK4 starts): a calm outline, to see how far it moved. */
  homeStart?: number
}>()

const { t } = useI18n()

const WHITE_W = 10
const WHITE_H = 56
const BLACK_W = 6
const BLACK_H = 34
const LABEL_H = 18

const keys = computed(() => {
  const whites: { key: number, x: number }[] = []
  const blacks: { key: number, x: number }[] = []
  for (let key = PIANO_LOW; key <= PIANO_HIGH; key++) {
    if (isBlackKey(key)) blacks.push({ key, x: whites.length * WHITE_W - BLACK_W / 2 })
    else whites.push({ key, x: whites.length * WHITE_W })
  }
  return { whites, blacks, width: whites.length * WHITE_W }
})

const xOf = (key: number) => keys.value.whites.find((item) => item.key >= key)?.x ?? keys.value.width

/** Octave names under the keys: each from its C (or the first key) to the next C. */
const octaves = computed(() => OCTAVE_NAMES.map((name, octave) => {
  const first = Math.max(PIANO_LOW, (octave + 1) * 12)
  const last = Math.min(PIANO_HIGH, (octave + 2) * 12 - 1)
  const from = xOf(first)
  const to = last >= PIANO_HIGH ? keys.value.width : xOf(last + 1)
  return { name, from, to }
}).filter((item) => item.to > item.from))

const bandOf = (start: number) => ({ from: xOf(start), to: xOf(start + KEYBOARD_KEYS) })
const band = computed(() => bandOf(props.windowStart))
const home = computed(() => (props.homeStart === undefined || props.homeStart === props.windowStart ? null : bandOf(props.homeStart)))
</script>

<template>
  <svg :viewBox="`0 0 ${keys.width} ${WHITE_H + LABEL_H}`" class="piano-map" role="img" :aria-label="t('theory.notes.mapLabel')">
    <rect v-for="item in keys.whites" :key="item.key" :x="item.x + 0.3" y="0" :width="WHITE_W - 0.6" :height="WHITE_H" rx="1.2" class="white" />
    <rect v-for="item in keys.blacks" :key="item.key" :x="item.x" y="0" :width="BLACK_W" :height="BLACK_H" rx="0.8" class="black" />
    <rect v-if="home" :x="home.from" y="-1" :width="home.to - home.from" :height="WHITE_H + 2" rx="2" class="home" />
    <text v-if="home" :x="(home.from + home.to) / 2" :y="WHITE_H - 5" text-anchor="middle" class="home__label">{{ t('theory.notes.homeWindow') }}</text>
    <!-- The MK4 window: 25 keys under the hands now. -->
    <!-- Moved with a transform, so the band slides to its new place when the octave changes. -->
    <g class="band__move" :style="{ transform: `translateX(${band.from}px)` }">
      <rect x="0" y="-1" :width="band.to - band.from" :height="WHITE_H + 2" rx="2" class="band" />
      <text :x="(band.to - band.from) / 2" :y="WHITE_H - 5" text-anchor="middle" class="band__label">MK4</text>
    </g>
    <g v-for="(item, i) in octaves" :key="item.name">
      <line :x1="item.from" :x2="item.from" :y1="WHITE_H + 2" :y2="WHITE_H + LABEL_H - 2" class="tick" />
      <text :x="(item.from + item.to) / 2" :y="WHITE_H + LABEL_H - 5" text-anchor="middle" class="octave" :class="{ 'octave--first': i === octaveOf(60) }">
        {{ t(`theory.octavesShort.${item.name}`) }}
      </text>
    </g>
  </svg>
</template>

<style scoped>
.piano-map {
  width: 100%;
  max-height: 8.5rem;
  display: block;
}

.white {
  fill: var(--ui-bg-elevated);
  stroke: var(--ui-border-accented);
  stroke-width: 0.5;
}

.black {
  fill: var(--ui-text-highlighted);
}

.band {
  fill: color-mix(in oklab, var(--color-pad-sky) 22%, transparent);
  stroke: var(--color-pad-sky);
  stroke-width: 1.2;
}

.home {
  fill: color-mix(in oklab, var(--ui-text-muted) 10%, transparent);
  stroke: var(--ui-text-muted);
  stroke-width: 0.8;
  stroke-dasharray: 3 2;
}

.home__label {
  font-size: 8px;
  font-weight: 600;
  fill: var(--ui-text-muted);
}

.band__move {
  transition: transform 200ms var(--ease-out);
}

@media (prefers-reduced-motion: reduce) {
  .band__move {
    transition: none;
  }
}

.band__label {
  font-size: 9px;
  font-weight: 700;
  fill: var(--color-pad-sky);
}

.tick {
  stroke: var(--ui-border-accented);
  stroke-width: 0.6;
}

.octave {
  font-size: 7px;
  fill: var(--ui-text-toned);
}

.octave--first {
  font-weight: 700;
  fill: var(--ui-text-highlighted);
}
</style>
