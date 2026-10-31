<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Accidental, Annotation, Articulation, ModifierPosition, AnnotationVerticalJustify, Formatter, GhostNote, Stave, StaveConnector, StaveNote, Voice, type Note } from 'vexflow/bravura'

import { paintNote, STAFF_COLOURS, staffContext } from '@/components/staffDrawing'
import { useNoteSource } from '@/composables/useNoteSource'

import { vexSpelling, type Spelled } from '@/lib/accidentals'
import { spellBar } from '@/lib/notation'
import { clefOf, type StaffClef } from '@/lib/staff'

// Single notes to read (plan step 19, «Теория» → «Ноты»): whole notes on the treble, bass or grand staff,
// with an optional name under each. On the grand staff a note goes to the clef it is read in.

export interface StaffNote {
  key: number
  /** How the note is written (plan step 20): D♭ stays D♭ on the staff although it is the key of C♯. */
  written?: Spelled
  /** Exact VexFlow writing inside a bar under a key signature: the sounding key, the sign only where printed. */
  vex?: { key: string, accidental: string | null }
  /** Written under the note, e.g. «соль». */
  label?: string
  /** CSS colour: right and wrong answers. */
  colour?: string
  /** A sign above the note: VexFlow's code ('a.' staccato, 'a-' tenuto, 'a>' accent). */
  articulation?: string
}

const props = defineProps<{
  notes: readonly StaffNote[]
  show: StaffClef | 'grand'
  scale?: number
  /** Key signature at the clef, as VexFlow names it ('G', 'F', 'D'). */
  keySignature?: string
  /** Fill the height the parent gives (a flex child), scaled up to `scale` at most. */
  fit?: boolean
  /** A note turns green once its very key is pressed, and stays so until the notes change (owner's rule). */
  playable?: boolean
}>()

const { heldNotes } = useNoteSource()
/** Keys of the notes already found on the keyboard. */
const found = ref<number[]>([])
watch(() => props.notes.map((item) => item.key).join(), () => {
  found.value = []
})
watch(heldNotes, (held) => {
  if (!props.playable) return
  const hit = props.notes.map((item) => item.key).filter((key) => held.includes(key) && !found.value.includes(key))
  if (hit.length) found.value = [...found.value, ...hit]
})
/** The note's own colour, else green once found. */
const colourOf = (item: StaffNote) => item.colour ?? (found.value.includes(item.key) ? STAFF_COLOURS.onTime : undefined)

const host = ref<HTMLDivElement | null>(null)

/** Staff spaces of room above the top line: three ledger lines. */
const SPACE_ABOVE = 3
/** Unscaled height of one staff: three ledger lines above and below, and a name under the lowest. */
const STAFF_HEIGHT = 104
/** The bass staff of the grand staff sits this far under the treble one: middle C fits between them. */
const STAFF_GAP = 70
/** Room for the clef and the brace before the first note. */
const LEFT = 12
/** Narrowest staff, unscaled, for a fitted staff: room for the clef and a few notes. */
const MIN_WIDTH = 200

/** Room under the staff for the names of the notes, unscaled. */
const LABEL_ROOM = 18

/** A whole note; a single one sits in the middle of the staff. */
function staveNote(item: StaffNote, clef: StaffClef, alone: boolean): StaveNote {
  const spelled = item.vex ?? (item.written ? vexSpelling(item.written) : spellBar([[item.key]])[0]![0]!)
  const note = new StaveNote({ keys: [spelled.key], duration: 'w', clef, alignCenter: alone })
  if (spelled.accidental) note.addModifier(new Accidental(spelled.accidental), 0)
  if (item.articulation) note.addModifier(new Articulation(item.articulation).setPosition(ModifierPosition.ABOVE), 0)
  if (item.label) {
    note.addModifier(new Annotation(item.label).setVerticalJustification(AnnotationVerticalJustify.BOTTOM).setFont('sans-serif', 13, 'bold'), 0)
  }
  paintNote(note, colourOf(item))
  return note
}

function draw() {
  const element = host.value
  if (!element) return
  const clefs: StaffClef[] = props.show === 'grand' ? ['treble', 'bass'] : [props.show]
  const height = STAFF_HEIGHT + (clefs.length - 1) * STAFF_GAP + (props.notes.some((item) => item.label) ? LABEL_ROOM : 0)
  const most = props.scale ?? 1.5
  const scale = props.fit ? Math.max(0.7, Math.min(most, element.clientHeight / height, element.clientWidth / MIN_WIDTH)) : props.scale
  const { context, width } = staffContext(element, height, scale)
  const staves = clefs.map((clef, i) => new Stave(LEFT, i * STAFF_GAP, width - LEFT - 2, { spaceAboveStaffLn: SPACE_ABOVE }).addClef(clef).addKeySignature(props.keySignature ?? 'C').setContext(context))
  staves.forEach((stave) => stave.draw())
  if (staves.length === 2) {
    new StaveConnector(staves[0]!, staves[1]!).setType('brace').setContext(context).draw()
    new StaveConnector(staves[0]!, staves[1]!).setType('singleLeft').setContext(context).draw()
    new StaveConnector(staves[0]!, staves[1]!).setType('singleRight').setContext(context).draw()
  }
  if (props.notes.length === 0) return
  // One voice per staff; where the note is on the other staff, an invisible placeholder keeps the columns.
  const voices = clefs.map((clef) => {
    const tickables: Note[] = props.notes.map((item) => (clefs.length === 1 || clefOf(item.key) === clef ? staveNote(item, clef, props.notes.length === 1) : new GhostNote({ duration: 'w' })))
    return new Voice({ numBeats: 4 * props.notes.length, beatValue: 4 }).setStrict(false).addTickables(tickables)
  })
  const formatter = new Formatter()
  voices.forEach((voice) => formatter.joinVoices([voice]))
  formatter.format(voices, Math.max(40, staves[0]!.getNoteEndX() - staves[0]!.getNoteStartX() - 16))
  voices.forEach((voice, i) => voice.draw(context, staves[i]!))
}

let observer: ResizeObserver | null = null
onMounted(() => {
  draw()
  observer = new ResizeObserver(() => draw())
  if (host.value) observer.observe(host.value)
})
onBeforeUnmount(() => observer?.disconnect())
watch(() => [props.notes, props.show, props.scale, props.keySignature, found.value], draw, { deep: true })
</script>

<template>
  <div ref="host" class="note-staff" :class="{ 'note-staff--fit': fit }" />
</template>

<style scoped>
.note-staff {
  width: 100%;
  color: var(--ui-text-highlighted);
}

/* The drawing takes its size from the box, never the other way round, so it can shrink with the screen. */
.note-staff--fit {
  position: relative;
  overflow: hidden;
}

.note-staff--fit :deep(svg) {
  position: absolute;
  inset: 0 auto auto 50%;
  translate: -50% 0;
}
</style>
