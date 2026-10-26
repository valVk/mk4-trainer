<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'

import { useNoteNames } from '@/composables/useNoteNames'
import { KEYBOARD_KEYS, keyboardKeys } from '@/lib/keyboard'
import { intervalsBetween, midiName, noteName } from '@/lib/theory'

// The MK4 on screen: 25 keys, held notes lit, playable with fingers (multi-touch and slides).
const props = withDefaults(defineProps<{
  start: number
  held?: readonly number[]
  /** Notes to suggest, drawn as an outline (for hints in training). */
  hint?: readonly number[]
  showNames?: boolean
  showIntervals?: boolean
}>(), {
  held: () => [],
  hint: () => [],
  showNames: false,
  showIntervals: false,
})

const emit = defineEmits<{
  press: [note: number]
  release: [note: number]
}>()

const { localName } = useNoteNames()

const keys = computed(() => keyboardKeys(props.start))
const whiteCount = computed(() => keys.value.filter((key) => !key.black).length)
const whiteWidth = computed(() => 100 / whiteCount.value)

function centerOf(note: number): number {
  const key = keys.value.find((item) => item.note === note)
  if (!key) return note < props.start ? 0 : 100
  return (key.black ? key.whiteIndex : key.whiteIndex + 0.5) * whiteWidth.value
}

const gaps = computed(() => {
  if (!props.showIntervals) return []
  const sorted = [...new Set(props.held)].sort((a, b) => a - b)
  return intervalsBetween(sorted).map((semitones, i) => {
    const left = centerOf(sorted[i] as number)
    return { semitones, left, width: centerOf(sorted[i + 1] as number) - left }
  })
})

const heldSet = computed(() => new Set(props.held))
const hintSet = computed(() => new Set(props.hint))

// Each finger plays one note; sliding to another key moves that finger's note.
const fingers = new Map<number, number>()

function noteAt(x: number, y: number): number | null {
  const element = document.elementFromPoint(x, y)
  const value = element instanceof HTMLElement ? element.dataset.note : undefined
  return value === undefined ? null : Number(value)
}

function onDown(event: PointerEvent) {
  const note = noteAt(event.clientX, event.clientY)
  if (note === null) return
  event.preventDefault()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  fingers.set(event.pointerId, note)
  emit('press', note)
}

function onMove(event: PointerEvent) {
  const current = fingers.get(event.pointerId)
  if (current === undefined) return
  const note = noteAt(event.clientX, event.clientY)
  if (note === null || note === current) return
  emit('release', current)
  fingers.set(event.pointerId, note)
  emit('press', note)
}

function onUp(event: PointerEvent) {
  const note = fingers.get(event.pointerId)
  if (note === undefined) return
  fingers.delete(event.pointerId)
  emit('release', note)
}

onBeforeUnmount(() => {
  fingers.forEach((note) => emit('release', note))
  fingers.clear()
})
</script>

<template>
  <div class="piano">
    <div v-if="showIntervals" class="gaps" aria-hidden="true">
      <div
        v-for="gap in gaps"
        :key="`${gap.left}-${gap.semitones}`"
        class="gap"
        :style="{ left: `${gap.left}%`, width: `${gap.width}%` }"
      >
        <span>{{ gap.semitones }}</span>
      </div>
    </div>

    <div
      class="keys"
      role="group"
      :aria-label="`${midiName(start)} – ${midiName(start + KEYBOARD_KEYS - 1)}`"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @contextmenu.prevent
    >
      <template v-for="key in keys" :key="key.note">
        <div
          v-if="!key.black"
          class="key key--white"
          :class="{ 'key--held': heldSet.has(key.note), 'key--hint': hintSet.has(key.note) }"
          :style="{ width: `${whiteWidth}%` }"
          :data-note="key.note"
        >
          <span v-if="showNames" class="key__name">
            {{ noteName(key.note) }}
            <span v-if="localName(key.note, true)" class="key__local">{{ localName(key.note, true) }}</span>
          </span>
          <span v-else-if="key.note % 12 === 0" class="key__name key__name--c">{{ midiName(key.note) }}</span>
        </div>
      </template>
      <template v-for="key in keys" :key="`b${key.note}`">
        <div
          v-if="key.black"
          class="key key--black"
          :class="{ 'key--held': heldSet.has(key.note), 'key--hint': hintSet.has(key.note) }"
          :style="{ left: `${(key.whiteIndex - 0.32) * whiteWidth}%`, width: `${whiteWidth * 0.64}%` }"
          :data-note="key.note"
        >
          <span v-if="showNames" class="key__name key__name--black">
            {{ noteName(key.note) }}
            <span v-if="localName(key.note, true)" class="key__local">{{ localName(key.note, true) }}</span>
          </span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.piano {
  --lit: var(--color-pad-sky);
  --hint: var(--color-pad-aqua);
  user-select: none;
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
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--lit);
}

.keys {
  position: relative;
  display: flex;
  height: clamp(9rem, 32vh, 15rem);
  touch-action: none;
  -webkit-touch-callout: none;
}

.key {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  /* Light-up is instant on press and fades a little on release */
  transition: background-color 120ms ease, transform 60ms ease-out;
}

.key--white {
  height: 100%;
  border-right: 3px solid var(--ui-bg);
  border-radius: 0 0 0.625rem 0.625rem;
  background: var(--key-white);
  box-shadow: 0 0 0 1px var(--ui-border) inset, 0 4px 0 var(--rubber-edge);
}

.key--black {
  position: absolute;
  top: 0;
  z-index: 1;
  height: 60%;
  border-radius: 0 0 0.5rem 0.5rem;
  background: var(--key-black);
  box-shadow: 0 4px 0 var(--rubber-edge);
}

.key--held {
  background: var(--lit);
  transform: translateY(2px);
  transition-duration: 0ms, 60ms;
}

.key--white.key--held {
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--lit) 70%, #000) inset, 0 2px 0 color-mix(in oklab, var(--lit) 55%, #000);
}

/* Hint: tinted and outlined, so a child spots it at a glance */
.key--white.key--hint:not(.key--held) {
  background: color-mix(in oklab, var(--hint) 28%, var(--key-white));
  box-shadow: 0 0 0 3px var(--hint) inset, 0 4px 0 var(--rubber-edge);
}

.key--black.key--hint:not(.key--held) {
  background: color-mix(in oklab, var(--hint) 70%, var(--key-black));
  box-shadow: 0 0 0 2px var(--hint) inset, 0 4px 0 var(--rubber-edge);
}

.key__name {
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  line-height: 1.1;
  margin-bottom: 0.75rem;
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 600;
  color: var(--key-label);
}

.key__local {
  margin-top: 0.125rem;
  font-family: var(--font-sans);
  font-size: 0.8125rem;
  font-weight: 500;
}

.key__name--black .key__local {
  font-size: 0.625rem;
}

.key__name--c {
  font-size: 0.75rem;
  color: var(--key-label-dim);
}

.key--held .key__name {
  color: #fff;
}

.key__name--black {
  margin-bottom: 0.5rem;
  font-size: 0.6875rem;
  color: #c9cee2;
}

@media (prefers-reduced-motion: reduce) {
  .key,
  .key--held {
    transform: none;
  }
}
</style>
