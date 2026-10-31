<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { barQuarters, quarterSeconds } from '@/lib/rhythm'
import type { TimeSignature } from '@/lib/song'

/** A stretch of time, seconds from the first note; `end` null while the key is still down. */
export interface RulerSpan {
  time: number
  end: number | null
}

// The bars of a rhythm drawn to time (plan step 17): the counts, where the music is now and the student's own presses
// as bars from press to release. With `notes` it also shows each note as a bar from the moment to press to the moment
// to release, so a half note on «1» plainly lasts through «2» and the next one starts on «3». Without them (listen and
// repeat) it gives nothing away and only follows the music.
const props = defineProps<{
  meter: TimeSignature
  bpm: number
  /** Length of the rhythm in quarters. */
  quarters: number
  /** Seconds from the first note now (negative in the count-in); null while nothing plays. */
  getPosition: () => number | null
  /** The student's presses so far. */
  getTaps: () => readonly RulerSpan[]
  /** The notes to play, seconds from the first note; shown as press-to-release bars. */
  notes?: readonly { start: number, length: number }[]
  /** Small, under the staff. */
  compact?: boolean
}>()

const beatQuarters = computed(() => 4 / props.meter.denominator)
const bars = computed(() => Math.max(1, Math.ceil(props.quarters / barQuarters(props.meter) - 1e-9)))
const beats = computed(() => Array.from({ length: bars.value * props.meter.numerator }, (_, i) => ({
  left: ((i * beatQuarters.value) / (bars.value * barQuarters(props.meter))) * 100,
  count: (i % props.meter.numerator) + 1,
  barStart: i % props.meter.numerator === 0,
})))
const totalSeconds = computed(() => bars.value * barQuarters(props.meter) * quarterSeconds(props.bpm, props.meter))
const percent = (seconds: number) => (seconds / totalSeconds.value) * 100

const noteBars = computed(() => (props.notes ?? []).map((note) => ({ left: percent(note.start), width: percent(note.length) })))

const playhead = ref<number | null>(null)
const held = ref<{ left: number, width: number, down: boolean }[]>([])
let frame = 0

function follow() {
  const position = props.getPosition()
  playhead.value = position === null || position < 0 ? null : Math.min(100, percent(position))
  held.value = props.getTaps().flatMap((tap) => {
    const end = tap.end ?? position ?? tap.time
    const left = Math.max(0, percent(tap.time))
    const right = Math.min(100, percent(end))
    return right < 0 || left > 100 ? [] : [{ left, width: Math.max(0.6, right - left), down: tap.end === null }]
  })
  frame = requestAnimationFrame(follow)
}

onMounted(() => {
  frame = requestAnimationFrame(follow)
})
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <div class="ruler" :class="{ 'ruler--compact': compact, 'ruler--notes': notes }" aria-hidden="true">
    <div class="ruler__lane">
      <span v-for="(beat, i) in beats" :key="i" class="ruler__beat" :class="{ 'ruler__beat--bar': beat.barStart }" :style="{ left: `${beat.left}%` }">
        <span class="ruler__count">{{ beat.count }}</span>
      </span>
      <span class="ruler__beat ruler__beat--bar" style="left: 100%" />
      <!-- Each note: press where the bar starts, keep holding, let go where it ends. -->
      <span v-for="(bar, i) in noteBars" :key="`n${i}`" class="ruler__note" :style="{ left: `${bar.left}%`, width: `calc(${bar.width}% - 4px)` }" />
      <span v-for="(bar, i) in held" :key="`h${i}`" class="ruler__held" :class="{ 'ruler__held--down': bar.down }" :style="{ left: `${bar.left}%`, width: `${bar.width}%` }" />
      <span v-if="playhead !== null" class="ruler__head" :style="{ left: `${playhead}%` }" />
    </div>
  </div>
</template>

<style scoped>
.ruler {
  --lane: 2.75rem;
  width: 100%;
  padding: 0.5rem 0.75rem 2.25rem;
}

.ruler--compact {
  --lane: 2.25rem;
  padding: 0 0.75rem 1.375rem;
}

.ruler__lane {
  position: relative;
  height: var(--lane);
  border-bottom: 2px solid var(--ui-border-accented);
}

.ruler__beat {
  position: absolute;
  bottom: -0.375rem;
  width: 1px;
  height: 0.75rem;
  background: var(--ui-text-dimmed);
}

.ruler__beat--bar {
  bottom: -0.375rem;
  width: 2px;
  height: calc(var(--lane) + 0.375rem);
  background: var(--ui-text-muted);
}

.ruler__count {
  position: absolute;
  top: calc(100% + 0.125rem);
  left: 0;
  transform: translateX(-50%);
  font-size: 1rem;
  font-weight: 600;
  color: var(--ui-text-muted);
}

.ruler--compact .ruler__count {
  font-size: 0.875rem;
}

/* A note to play: its left edge is the press, its right edge the release; the gap before the next is the re-press. */
.ruler__note {
  position: absolute;
  top: 0.1875rem;
  height: calc(var(--lane) / 2 - 0.25rem);
  border-radius: 0.375rem;
  border: 1.5px solid color-mix(in oklab, var(--color-active) 70%, transparent);
  border-left-width: 4px;
  border-left-color: var(--color-active);
  background: color-mix(in oklab, var(--color-active) 18%, transparent);
  box-sizing: border-box;
}

/* The student's own press, from press to release, under the note it answers. */
.ruler__held {
  position: absolute;
  bottom: 0.1875rem;
  height: calc(var(--lane) / 2 - 0.25rem);
  border-radius: 0.375rem;
  background: var(--color-correct);
  opacity: 0.85;
}

.ruler:not(.ruler--notes) .ruler__held {
  height: calc(var(--lane) - 0.5rem);
  background: var(--color-active);
}

.ruler__held--down {
  opacity: 1;
}

/* Phones in landscape: under the staff, which has the counts already, the bars alone. */
@media (orientation: landscape) and (max-height: 500px) {
  .ruler--compact {
    --lane: 1.5rem;
    padding-bottom: 0;
  }

  .ruler--compact .ruler__count {
    display: none;
  }
}

/* Where the music is now. */
.ruler__head {
  position: absolute;
  top: -0.25rem;
  bottom: -0.25rem;
  width: 3px;
  border-radius: 2px;
  background: var(--color-attention);
  transform: translateX(-50%);
}
</style>
