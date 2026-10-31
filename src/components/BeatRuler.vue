<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { barQuarters, quarterSeconds } from '@/lib/rhythm'
import type { TimeSignature } from '@/lib/song'

// «Послушай и повтори» (plan step 17): the notes stay hidden until the attempt is over, so the ear does the work.
// Instead of an empty card the student sees the bars with their counts, where the music is now, and where their own
// taps landed: something to follow while listening and playing, without giving the rhythm away.
const props = defineProps<{
  meter: TimeSignature
  bpm: number
  /** Length of the rhythm in quarters. */
  quarters: number
  /** Seconds from the first note now (negative in the count-in); null while nothing plays. */
  getPosition: () => number | null
  /** The student's taps so far, seconds from the first note. */
  getTaps: () => readonly { time: number }[]
}>()

const beatQuarters = computed(() => 4 / props.meter.denominator)
const bars = computed(() => Math.max(1, Math.ceil(props.quarters / barQuarters(props.meter) - 1e-9)))
const beats = computed(() => Array.from({ length: bars.value * props.meter.numerator }, (_, i) => ({
  left: ((i * beatQuarters.value) / (bars.value * barQuarters(props.meter))) * 100,
  count: (i % props.meter.numerator) + 1,
  barStart: i % props.meter.numerator === 0,
})))
const totalSeconds = computed(() => bars.value * barQuarters(props.meter) * quarterSeconds(props.bpm, props.meter))

const playhead = ref<number | null>(null)
const taps = ref<number[]>([])
let frame = 0

function follow() {
  const position = props.getPosition()
  playhead.value = position === null || position < 0 ? null : Math.min(100, (position / totalSeconds.value) * 100)
  const now = props.getTaps().map((tap) => (tap.time / totalSeconds.value) * 100).filter((left) => left >= -2 && left <= 102)
  if (now.length !== taps.value.length) taps.value = now
  frame = requestAnimationFrame(follow)
}

onMounted(() => {
  frame = requestAnimationFrame(follow)
})
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <div class="ruler" aria-hidden="true">
    <div class="ruler__line">
      <span v-for="(beat, i) in beats" :key="i" class="ruler__beat" :class="{ 'ruler__beat--bar': beat.barStart }" :style="{ left: `${beat.left}%` }">
        <span class="ruler__count">{{ beat.count }}</span>
      </span>
      <span class="ruler__beat ruler__beat--bar" style="left: 100%" />
      <span v-for="(left, i) in taps" :key="`t${i}`" class="ruler__tap" :style="{ left: `${left}%` }" />
      <span v-if="playhead !== null" class="ruler__head" :style="{ left: `${playhead}%` }" />
    </div>
  </div>
</template>

<style scoped>
.ruler {
  width: 100%;
  padding: 2.5rem 0.75rem 3.5rem;
}

.ruler__line {
  position: relative;
  height: 2px;
  background: var(--ui-border-accented);
}

.ruler__beat {
  position: absolute;
  top: -0.375rem;
  width: 1px;
  height: 0.75rem;
  background: var(--ui-text-dimmed);
}

.ruler__beat--bar {
  top: -1.25rem;
  width: 2px;
  height: 2.5rem;
  background: var(--ui-text-muted);
}

.ruler__count {
  position: absolute;
  top: 1.75rem;
  left: 0;
  transform: translateX(-50%);
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--ui-text-muted);
}

/* A tap of the student: where it landed. */
.ruler__tap {
  position: absolute;
  top: -0.5rem;
  width: 1rem;
  height: 1rem;
  border-radius: 999px;
  background: var(--color-active);
  transform: translateX(-50%);
}

/* Where the music is now. */
.ruler__head {
  position: absolute;
  top: -1.75rem;
  width: 3px;
  height: 3.5rem;
  border-radius: 2px;
  background: var(--color-attention);
  transform: translateX(-50%);
}
</style>
