<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Accidental, Formatter, GhostNote, Stave, StaveConnector, StaveNote, Voice, type Note } from 'vexflow/bravura'

import { STAFF_COLOURS, staffContext } from '@/components/staffDrawing'

import { spellBar } from '@/lib/notation'
import { clefOf, mapBand, mapColumn, mapColumns, mapSign, type StaffClef } from '@/lib/staff'

// The octave map (plan step 19, owner's addition): the grand staff from C2 to C6 laid out by pitch, one
// column per white key. The 25 keys of the MK4 are a band over their columns; it moves as soon as the
// octave changes, and the keys held now are notes inside it. Names of the octaves under their C.

const props = defineProps<{
  windowStart: number
  held?: readonly number[]
  scale?: number
}>()

const { t } = useI18n()
const host = ref<HTMLDivElement | null>(null)

/** Unscaled: three spaces above the treble staff, the gap for middle C, two ledger lines under the bass staff. */
const TREBLE_Y = 0
const BASS_Y = 70
const HEIGHT = 170
const LEFT = 18
const SCALE = 1.2

const columns = mapColumns()
/** A band this narrow (px) has its words beside it, not in it. */
const NARROW_PX = 90
/** Pixel centre of each column after drawing, for the band and the names laid over the staff. */
const columnX = shallowRef<number[]>([])
const scaleUsed = ref(SCALE)

function staveNote(key: number, clef: StaffClef): StaveNote {
  const [spelled] = spellBar([[key]])[0]!
  const note = new StaveNote({ keys: [spelled!.key], duration: 'w', clef })
  if (spelled!.accidental) note.addModifier(new Accidental(spelled!.accidental), 0)
  note.setStyle({ fillStyle: STAFF_COLOURS.current, strokeStyle: STAFF_COLOURS.current })
  return note
}

function draw() {
  const element = host.value?.querySelector<HTMLDivElement>('.octave-map__staff')
  if (!element) return
  const scale = props.scale ?? SCALE
  scaleUsed.value = scale
  const { context, width } = staffContext(element, HEIGHT, scale)
  const staves = (['treble', 'bass'] as const).map((clef, i) => new Stave(LEFT, i === 0 ? TREBLE_Y : BASS_Y, width - LEFT - 2, { spaceAboveStaffLn: 3 }).addClef(clef).setContext(context))
  staves.forEach((stave) => stave.draw())
  new StaveConnector(staves[0]!, staves[1]!).setType('brace').setContext(context).draw()
  new StaveConnector(staves[0]!, staves[1]!).setType('singleLeft').setContext(context).draw()
  // One column per white key; a held key is a note in its column on its own staff, the rest are placeholders.
  const heldAt = new Map<number, number[]>()
  for (const key of props.held ?? []) {
    const column = mapColumn(key)
    if (column !== null) heldAt.set(column, [...(heldAt.get(column) ?? []), key])
  }
  const voices = (['treble', 'bass'] as const).map((clef) => new Voice({ numBeats: 4 * columns.length, beatValue: 4 }).setStrict(false).addTickables(
    columns.map((_, i): Note => {
      const key = heldAt.get(i)?.find((item) => clefOf(item) === clef)
      return key === undefined ? new GhostNote({ duration: 'w' }) : staveNote(key, clef)
    }),
  ))
  const formatter = new Formatter()
  voices.forEach((voice) => formatter.joinVoices([voice]))
  formatter.formatToStave(voices, staves[0]!)
  voices.forEach((voice, i) => voice.draw(context, staves[i]!))
  columnX.value = voices[0]!.getTickables().map((note) => (note.getAbsoluteX() + 6) * scale)
}

const band = computed(() => {
  const { from, to } = mapBand(props.windowStart)
  const xs = columnX.value
  if (xs.length < 2) return null
  const half = (xs[1]! - xs[0]!) / 2
  return { left: xs[from]! - half, width: xs[to]! - xs[from]! + half * 2 }
})
const names = computed(() => columns.flatMap((column, i) => (column.octave && columnX.value[i] !== undefined ? [{ name: column.octave, x: columnX.value[i]! }] : [])))
const sign = computed(() => mapSign(props.windowStart))

let observer: ResizeObserver | null = null
onMounted(() => {
  draw()
  observer = new ResizeObserver(() => draw())
  if (host.value) observer.observe(host.value)
})
onBeforeUnmount(() => observer?.disconnect())
watch(() => [props.held, props.scale], draw, { deep: true })
</script>

<template>
  <div ref="host" class="octave-map" role="img" :aria-label="t('theory.notes.octaveMapLabel')">
    <div class="octave-map__staff" />
    <span v-if="band" class="octave-map__band" :class="{ 'octave-map__band--narrow': band.width < NARROW_PX, 'octave-map__band--low': sign === '8vb' }" :style="{ left: `${band.left}px`, width: `${band.width}px` }">
      <!-- When the window goes past the map, the band is a strip at the edge: the words go beside it. -->
      <span class="octave-map__words">
        <span class="octave-map__mk4">MK4</span>
        <span v-if="sign" class="octave-map__sign">{{ sign }}</span>
      </span>
    </span>
    <span v-for="item in names" :key="item.name" class="octave-map__name" :style="{ left: `${item.x}px`, top: `${HEIGHT * scaleUsed}px` }">
      {{ t(`theory.octaves.${item.name}`) }}
    </span>
  </div>
</template>

<style scoped>
.octave-map {
  position: relative;
  width: 100%;
  padding-bottom: 1.5rem;
  color: var(--ui-text-highlighted);
}

.octave-map__band {
  position: absolute;
  top: 0;
  bottom: 1.5rem;
  border-radius: 0.5rem;
  background: color-mix(in oklab, var(--color-pad-sky) 16%, transparent);
  box-shadow: 0 0 0 2px var(--color-pad-sky) inset;
  transition: left 200ms var(--ease-out), width 200ms var(--ease-out);
  pointer-events: none;
}

.octave-map__words {
  position: absolute;
  top: 0.25rem;
  left: 0.5rem;
  right: 0.5rem;
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
  color: var(--color-pad-sky);
}

/* Past the top of the map: the words stand to the left of the strip; past the bottom, to its right. */
.octave-map__band--narrow .octave-map__words {
  left: auto;
  right: calc(100% + 0.375rem);
}

.octave-map__band--narrow.octave-map__band--low .octave-map__words {
  left: calc(100% + 0.375rem);
  right: auto;
}

.octave-map__name {
  position: absolute;
  translate: -50% 0;
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
  color: var(--ui-text-toned);
}

@media (prefers-reduced-motion: reduce) {
  .octave-map__band {
    transition: none;
  }
}
</style>
