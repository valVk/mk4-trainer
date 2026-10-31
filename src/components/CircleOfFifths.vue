<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSynth } from '@/composables/useSynth'
import { scaleKeys } from '@/lib/scales'

// The circle of fifths (plan step 22): the twelve major keys around the outside, each a fifth from the next, their
// relative minors inside. Tap a key: its scale goes up, then its tonic chord sounds. Signs per key: ♯ to the right
// of C, ♭ to the left.

const props = defineProps<{
  /** A chord to light up (the chain of «Функции»): ring and position, C at the top. */
  lit?: { minor: boolean, position: number } | null
}>()

const { t } = useI18n()
const { playChord } = useSynth()

/** Majors clockwise from C: tonic pitch class, label, signature (sharps positive). */
const MAJORS = [
  [0, 'C', 0], [7, 'G', 1], [2, 'D', 2], [9, 'A', 3], [4, 'E', 4], [11, 'B', 5],
  [6, 'F♯', 6], [1, 'D♭', -5], [8, 'A♭', -4], [3, 'E♭', -3], [10, 'B♭', -2], [5, 'F', -1],
] as const
/** Their relative minors, a minor third below. */
const MINORS = ['a', 'e', 'b', 'f♯', 'c♯', 'g♯', 'e♭', 'b♭', 'f', 'c', 'g', 'd'] as const

const SIZE = 300
const CENTER = SIZE / 2
const OUTER = 146
const MIDDLE = 102
const INNER = 62

const selected = ref<string | null>(null)
let timers: ReturnType<typeof setTimeout>[] = []
onBeforeUnmount(() => timers.forEach(clearTimeout))

/** A sector of a ring, as an SVG path; sector 0 is at the top. */
function sector(index: number, inner: number, outer: number): string {
  const step = (Math.PI * 2) / 12
  const from = index * step - Math.PI / 2 - step / 2
  const to = from + step
  const point = (radius: number, angle: number) => `${CENTER + radius * Math.cos(angle)} ${CENTER + radius * Math.sin(angle)}`
  return `M ${point(inner, from)} L ${point(outer, from)} A ${outer} ${outer} 0 0 1 ${point(outer, to)} L ${point(inner, to)} A ${inner} ${inner} 0 0 0 ${point(inner, from)} Z`
}

function labelAt(index: number, radius: number) {
  const angle = index * ((Math.PI * 2) / 12) - Math.PI / 2
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) }
}

/** The scale up, one note at a time, then the tonic chord (major or minor). */
function play(id: string, pc: number, minor: boolean) {
  selected.value = id
  timers.forEach(clearTimeout)
  timers = []
  const tonic = 60 + pc - (pc > 7 ? 12 : 0)
  const keys = scaleKeys(tonic, minor ? 'minor' : 'major')
  keys.forEach((key, i) => timers.push(setTimeout(() => playChord([key], 300), i * 260)))
  timers.push(setTimeout(() => playChord([tonic, tonic + (minor ? 3 : 4), tonic + 7], 1400), keys.length * 260 + 120))
}

const signs = (signature: number) => (signature === 0 ? '' : signature > 0 ? `${signature}♯` : `${-signature}♭`)
</script>

<template>
  <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" class="circle" role="group" :aria-label="t('theory.scales.circleLabel')">
    <g v-for="([pc, label, signature], i) in MAJORS" :key="label">
      <path
        :d="sector(i, MIDDLE, OUTER)"
        class="sector"
:class="{ 'sector--on': selected === label || (props.lit && !props.lit.minor && props.lit.position === i) }"
        role="button"
        :aria-label="t('theory.scales.circlePlay', { key: label })"
        @click="play(label, pc, false)"
      />
      <text v-bind="labelAt(i, (MIDDLE + OUTER) / 2 + 6)" text-anchor="middle" class="label">{{ label }}</text>
      <text v-bind="labelAt(i, (MIDDLE + OUTER) / 2 + 22)" text-anchor="middle" class="signs">{{ signs(signature) }}</text>
      <path
        :d="sector(i, INNER, MIDDLE)"
        class="sector sector--minor"
:class="{ 'sector--on': selected === MINORS[i] || (props.lit?.minor && props.lit.position === i) }"
        role="button"
        :aria-label="t('theory.scales.circlePlay', { key: MINORS[i] })"
        @click="play(MINORS[i]!, (pc + 9) % 12, true)"
      />
      <text v-bind="labelAt(i, (INNER + MIDDLE) / 2 + 5)" text-anchor="middle" class="label label--minor">{{ MINORS[i] }}</text>
    </g>
  </svg>
</template>

<style scoped>
.circle {
  width: 100%;
  max-height: 15rem;
  display: block;
}

.sector {
  fill: var(--ui-bg-elevated);
  stroke: var(--ui-border-accented);
  stroke-width: 1;
  cursor: pointer;
  transition: fill 150ms ease;
}

.sector--minor {
  fill: var(--ui-bg-muted);
}

.sector--on {
  fill: color-mix(in oklab, var(--color-pad-sky) 35%, var(--ui-bg-elevated));
}

.label {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 700;
  fill: var(--ui-text-highlighted);
  pointer-events: none;
}

.label--minor {
  font-size: 12px;
  fill: var(--ui-text-toned);
}

.signs {
  font-size: 9px;
  fill: var(--ui-text-muted);
  pointer-events: none;
}
</style>
