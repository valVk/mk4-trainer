<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Annotation, AnnotationVerticalJustify, Articulation, Beam, Dot, Formatter, ModifierPosition, Stave, StaveNote, StaveTie, Tuplet, Voice } from 'vexflow/bravura'

import { STAFF_COLOURS, staffContext } from '@/components/staffDrawing'

import { barQuarters, countLabels, noteQuarters, splitBars, type Duration, type Rhythm, type TimingVerdict } from '@/lib/rhythm'

// A rhythm on a one-line staff (plan step 16): time signature, bars, beams, rests, dots, ties, triplets.
// VexFlow draws it with the Bravura music font built into the bundle, so it works offline.

const props = defineProps<{
  rhythm: Rhythm
  /** Index of the note playing now: drawn in the accent colour. */
  current?: number | null
  /** Result per note index after an attempt. */
  marks?: Readonly<Record<number, TimingVerdict>>
  /** Drawing scale; bigger where the rhythm is the whole task. */
  scale?: number
  /** A second hand on its own line under the first (Р10, «2 против 3»), same meter and bars. */
  lower?: Rhythm | null
  /** Result per note index of the lower line. */
  lowerMarks?: Readonly<Record<number, TimingVerdict>>
  /** The count to press on under every note («1», «и», «4»…), for reading a rhythm. */
  counts?: boolean
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

function colourOf(index: number, marks: Readonly<Record<number, TimingVerdict>> | undefined, current: number | null | undefined): string | null {
  if (current === index) return STAFF_COLOURS.current
  const mark = marks?.[index]
  if (mark === 'onTime') return STAFF_COLOURS.onTime
  if (mark === 'early' || mark === 'late') return STAFF_COLOURS.off
  if (mark === 'missed') return STAFF_COLOURS.missed
  return null
}

/** The second line sits this far under the first, unscaled. */
const LINE_GAP = 70

interface Line {
  rhythm: Rhythm
  marks?: Readonly<Record<number, TimingVerdict>>
  current?: number | null
}

function draw() {
  const element = host.value
  if (!element) return
  const lines: Line[] = [{ rhythm: props.rhythm, marks: props.marks, current: props.current }]
  if (props.lower) lines.push({ rhythm: props.lower, marks: props.lowerMarks })
  const { context, width } = staffContext(element, STAFF_HEIGHT + (lines.length - 1) * LINE_GAP, props.scale)

  const barsOf = lines.map((line) => splitBars(line.rhythm))
  const labelsOf = lines.map((line) => (props.counts ? countLabels(line.rhythm) : new Map<number, string>()))
  const { numerator, denominator } = props.rhythm.meter
  const signature = `${numerator}/${denominator}`
  const full = barQuarters(props.rhythm.meter)
  // The first bar also holds the time signature: give it a little more room.
  const extra = 40
  // A bar's width follows its length and how many notes it holds (in the busier hand), so busy bars are not squeezed.
  const weightOf = (b: number) => Math.max(...barsOf.map((bars) => {
    const bar = bars[b] ?? []
    return Math.max(bar.reduce((sum, item) => sum + noteQuarters(item.note), 0), full * 0.5) + bar.length * NOTE_ROOM
  }))
  const barCount = barsOf[0]!.length
  const unit = (width - 2 - extra) / Array.from({ length: barCount }, (_, b) => weightOf(b)).reduce((sum, value) => sum + value, 0)
  const staveNotes = lines.map(() => new Map<number, StaveNote>())
  let x = 1
  for (let b = 0; b < barCount; b++) {
    const staveWidth = weightOf(b) * unit + (b === 0 ? extra : 0)
    const voices: Voice[] = []
    const staves: Stave[] = []
    const beams: Beam[] = []
    const tuplets: Tuplet[] = []
    lines.forEach((line, l) => {
      const bar = barsOf[l]![b] ?? []
      // Rounded to a 1/96 grid: three triplet eighths add up to 0.9999… in floating point, and VexFlow
      // compares the lengths of the two hands' bars exactly.
      const quarters = Math.round(bar.reduce((sum, item) => sum + noteQuarters(item.note), 0) * 96) / 96
      const stave = new Stave(x, -6 + l * LINE_GAP, staveWidth)
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
        // Accent (>) always above the staff, where children look for it.
        if (note.accent && !note.rest) staveNote.addModifier(new Articulation('a>').setPosition(ModifierPosition.ABOVE), 0)
        const label = labelsOf[l]!.get(index)
        if (label) {
          const count = new Annotation(label).setVerticalJustification(AnnotationVerticalJustify.BOTTOM)
          count.setFont({ family: 'sans-serif', size: 13, weight: 'bold' })
          staveNote.addModifier(count, 0)
        }
        const colour = colourOf(index, line.marks, line.current)
        if (colour) staveNote.setStyle({ fillStyle: colour, strokeStyle: colour })
        staveNotes[l]!.set(index, staveNote)
        return staveNote
      })
      // Tuplets first: they change the notes' lengths, which the voice adds up and the beams are grouped by.
      tuplets.push(...tupletsOf(bar.map((item) => item.note), notes))
      voices.push(new Voice({ numBeats: quarters * (denominator / 4), beatValue: denominator }).setStrict(false).addTickables(notes))
      staves.push(stave)
      // Beam groups follow the meter: eighths in pairs in 4/4, in threes in 6/8.
      beams.push(...Beam.generateBeams(notes, { groups: Beam.getDefaultBeamGroups(signature) }))
    })
    // Both hands are formatted together, so notes at the same moment stand one above the other.
    const formatter = new Formatter()
    voices.forEach((voice) => formatter.joinVoices([voice]))
    formatter.format(voices, staves[0]!.getNoteEndX() - staves[0]!.getNoteStartX() - 10)
    voices.forEach((voice, v) => voice.draw(context, staves[v]!))
    beams.forEach((beam) => beam.setContext(context).draw())
    tuplets.forEach((tuplet) => tuplet.setContext(context).draw())
    x += staves[0]!.getWidth()
  }
  // Ties, also across bar lines.
  lines.forEach((line, l) => line.rhythm.notes.forEach((note, index) => {
    const first = staveNotes[l]!.get(index)
    const last = staveNotes[l]!.get(index + 1)
    if (note.tie && !note.rest && first && last) {
      new StaveTie({ firstNote: first, lastNote: last, firstIndexes: [0], lastIndexes: [0] }).setContext(context).draw()
    }
  }))
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
watch(() => [props.rhythm, props.current, props.marks, props.scale, props.lower, props.lowerMarks, props.counts], draw, { deep: true })
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
