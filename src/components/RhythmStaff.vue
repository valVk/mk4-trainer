<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Beam, Dot, Formatter, Stave, StaveNote, StaveTie, Tuplet, Voice } from 'vexflow/bravura'

import { STAFF_COLOURS, staffContext } from '@/components/staffDrawing'

import { barQuarters, noteQuarters, splitBars, type Duration, type Rhythm, type TimingVerdict } from '@/lib/rhythm'

// A rhythm on a one-line staff (plan step 16): time signature, bars, beams, rests, dots, ties, triplets.
// VexFlow draws it with the Bravura music font built into the bundle, so it works offline.

const props = defineProps<{
  rhythm: Rhythm
  /** Index of the note playing now: drawn in the accent colour. */
  current?: number | null
  /** Result per note index after an attempt. */
  marks?: Readonly<Record<number, TimingVerdict>>
}>()

const host = ref<HTMLDivElement | null>(null)

const CODES: Record<Duration, string> = { whole: 'w', half: 'h', quarter: 'q', eighth: '8', sixteenth: '16' }
/** Height in unscaled staff units. */
const STAFF_HEIGHT = 84
/** Extra room per note, in quarter notes of width. */
const NOTE_ROOM = 0.35
/** Rhythm sits on the middle line of a five-line staff whose other lines are hidden: rests and bar lines then land where musicians expect. */
const LINE_KEY = 'b/4'
const ONLY_MIDDLE_LINE = [false, false, true, false, false].map((visible) => ({ visible }))

function colourOf(index: number): string | null {
  if (props.current === index) return STAFF_COLOURS.current
  const mark = props.marks?.[index]
  if (mark === 'onTime') return STAFF_COLOURS.onTime
  if (mark === 'early' || mark === 'late') return STAFF_COLOURS.off
  if (mark === 'missed') return STAFF_COLOURS.missed
  return null
}

function draw() {
  const element = host.value
  if (!element) return
  const { context, width } = staffContext(element, STAFF_HEIGHT)

  const bars = splitBars(props.rhythm)
  const { numerator, denominator } = props.rhythm.meter
  const signature = `${numerator}/${denominator}`
  const full = barQuarters(props.rhythm.meter)
  // The first bar also holds the time signature: give it a little more room.
  const extra = 40
  // A bar's width follows its length and how many notes it holds, so busy bars are not squeezed.
  const weightOf = (bar: (typeof bars)[number]) => Math.max(bar.reduce((sum, item) => sum + noteQuarters(item.note), 0), full * 0.5) + bar.length * NOTE_ROOM
  const unit = (width - 2 - extra) / bars.reduce((sum, bar) => sum + weightOf(bar), 0)
  const staveNotes = new Map<number, StaveNote>()
  let x = 1
  bars.forEach((bar, b) => {
    const quarters = bar.reduce((sum, item) => sum + noteQuarters(item.note), 0)
    const stave = new Stave(x, -6, weightOf(bar) * unit + (b === 0 ? extra : 0))
    stave.setConfigForLines(ONLY_MIDDLE_LINE)
    if (b === 0) stave.addTimeSignature(signature)
    stave.setContext(context).draw()
    const notes = bar.map(({ note, index }) => {
      const staveNote = new StaveNote({
        keys: [LINE_KEY],
        duration: CODES[note.duration],
        dots: note.dots ?? 0,
        type: note.rest ? 'r' : undefined,
      })
      if (note.dots) Dot.buildAndAttach([staveNote], { all: true })
      const colour = colourOf(index)
      if (colour) staveNote.setStyle({ fillStyle: colour, strokeStyle: colour })
      staveNotes.set(index, staveNote)
      return staveNote
    })
    const voice = new Voice({ numBeats: quarters * (denominator / 4), beatValue: denominator }).setStrict(false)
    voice.addTickables(notes)
    // Tuplets first: they change the notes' lengths, and beams are grouped by those lengths.
    const tuplets = tupletsOf(bar.map((item) => item.note), notes)
    // Beam groups follow the meter: eighths in pairs in 4/4, in threes in 6/8.
    const beams = Beam.generateBeams(notes, { groups: Beam.getDefaultBeamGroups(signature) })
    new Formatter().joinVoices([voice]).format([voice], stave.getNoteEndX() - stave.getNoteStartX() - 10)
    voice.draw(context, stave)
    beams.forEach((beam) => beam.setContext(context).draw())
    tuplets.forEach((tuplet) => tuplet.setContext(context).draw())
    x += stave.getWidth()
  })
  // Ties, also across bar lines.
  props.rhythm.notes.forEach((note, index) => {
    const first = staveNotes.get(index)
    const last = staveNotes.get(index + 1)
    if (note.tie && !note.rest && first && last) {
      new StaveTie({ firstNote: first, lastNote: last, firstIndexes: [0], lastIndexes: [0] }).setContext(context).draw()
    }
  })
}

/** Groups notes written as tuplets (3 in the time of 2) into brackets. */
function tupletsOf(written: Rhythm['notes'], notes: StaveNote[]): Tuplet[] {
  const tuplets: Tuplet[] = []
  let i = 0
  while (i < written.length) {
    const tuplet = written[i]!.tuplet
    if (!tuplet) {
      i++
      continue
    }
    const group = notes.slice(i, i + tuplet.actual)
    tuplets.push(new Tuplet(group, { numNotes: tuplet.actual, notesOccupied: tuplet.normal }))
    i += tuplet.actual
  }
  return tuplets
}

let observer: ResizeObserver | null = null
onMounted(() => {
  draw()
  observer = new ResizeObserver(() => draw())
  if (host.value) observer.observe(host.value)
})
onBeforeUnmount(() => observer?.disconnect())
watch(() => [props.rhythm, props.current, props.marks], draw, { deep: true })
</script>

<template>
  <div ref="host" class="rhythm-staff" role="img" />
</template>

<style scoped>
.rhythm-staff {
  width: 100%;
  color: var(--ui-text-highlighted);
}

.rhythm-staff :deep(svg) {
  display: block;
  overflow: visible;
}
</style>
