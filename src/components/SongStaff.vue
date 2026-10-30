<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Accidental, Beam, Dot, Formatter, Stave, StaveConnector, StaveNote, StaveTie, Voice, type RenderContext } from 'vexflow/bravura'

import { STAFF_COLOURS, STAFF_SCALE, staffContext } from '@/components/staffDrawing'
import { barAt, drumPlace, spellBar, type Clef, type PlayedMark, type WrittenBar, type WrittenNote } from '@/lib/notation'
import type { TimeSignature } from '@/lib/song'

// A song part as notes on a staff (plan step 16, owner's addition): a page of bars that turns as the
// song moves on, with the note being played in the accent colour. A wide part gets a grand staff
// (`lower` in the bass clef); in «Ноты» the child's line (`played`) sits under the part.

const props = withDefaults(defineProps<{
  bars: readonly WrittenBar[]
  clef: Clef
  meter: TimeSignature
  /** Song time in seconds, read every frame. */
  getTime: () => number
  /** Bars on one page; the page turns as a whole, so notes do not slide under the eyes. */
  perPage?: number
  /** The part's low notes on a bass staff under `bars` (grand staff), or null. */
  lower?: readonly WrittenBar[] | null
  /** What the child played, on the same bars: drawn on a staff right under the part. */
  played?: readonly WrittenBar[] | null
  /** Colour of each played note, keyed "bar:note". */
  marks?: Readonly<Record<string, PlayedMark>>
  /** Drawing scale; smaller when the staff shares the stage with the falling notes. */
  scale?: number
}>(), { perPage: 2, lower: null, played: null, marks: () => ({}), scale: STAFF_SCALE })

const host = ref<HTMLDivElement | null>(null)

const CODES = { whole: 'w', half: 'h', quarter: 'q', eighth: '8', sixteenth: '16' } as const
/** Height in unscaled staff units: one staff with room for ledger lines above and below. */
const STAFF_HEIGHT = 120
/** Each further staff sits this far under the one above; the two staves of a grand staff sit closer, as in piano music. */
const ROW_GAP = 95
const GRAND_GAP = 78
const MARK_COLOURS: Record<PlayedMark, string> = { right: STAFF_COLOURS.onTime, off: STAFF_COLOURS.off, wrong: STAFF_COLOURS.missed }
/** Where a rest sits: the middle line of the clef. */
const REST_KEY: Record<Clef, string> = { treble: 'b/4', bass: 'd/3', percussion: 'b/4' }

/** One staff of the system: its bars, its clef and how its notes are coloured. */
interface Row {
  bars: readonly WrittenBar[]
  clef: Clef
  colour: (bar: number, note: number, written: WrittenNote) => string | null
  /** The part itself (gets the time signature); false for the child's line. */
  part: boolean
  /** Distance from the staff above, unscaled. */
  gap: number
}

/** Page and the notes being played ("bar:note" on the upper and lower staff), changed only when they change. */
const page = ref(0)
const playing = ref<{ upper: string | null, lower: string | null }>({ upper: null, lower: null })

const rows = computed<Row[]>(() => {
  const list: Row[] = [{ bars: props.bars, clef: props.clef, part: true, gap: 0, colour: (bar, note) => (playing.value.upper === `${bar}:${note}` ? STAFF_COLOURS.current : null) }]
  if (props.lower) list.push({ bars: props.lower, clef: 'bass', part: true, gap: GRAND_GAP, colour: (bar, note) => (playing.value.lower === `${bar}:${note}` ? STAFF_COLOURS.current : null) })
  if (props.played) {
    list.push({
      bars: props.played,
      clef: props.clef,
      part: false,
      gap: ROW_GAP,
      colour: (bar, note, written) => {
        if (written.keys.length === 0) return 'var(--ui-text-dimmed)'
        const mark = props.marks[`${bar}:${note}`]
        return mark ? MARK_COLOURS[mark] : null
      },
    })
  }
  return list
})

const shownIndexes = computed(() => props.bars.slice(page.value * props.perPage, (page.value + 1) * props.perPage).map((bar) => bar.index))

/** VexFlow notes of one bar of a row. */
function barNotes(row: Row, bar: WrittenBar): StaveNote[] {
  const drums = row.clef === 'percussion'
  // Drums have no pitch to spell: each sits on its own place, without accidentals.
  const spelled = drums ? bar.notes.map((note) => note.keys.map((key) => ({ key: drumPlace(key), accidental: null }))) : spellBar(bar.notes.map((note) => note.keys))
  return bar.notes.map((note, i) => {
    const rest = note.keys.length === 0
    const staveNote = new StaveNote({
      keys: rest ? [REST_KEY[row.clef]] : [...new Set(spelled[i]!.map((key) => key.key))],
      duration: CODES[note.duration],
      dots: note.dots,
      type: rest ? 'r' : undefined,
      clef: row.clef,
      alignCenter: note.barRest,
    })
    if (!rest && !drums) spelled[i]!.forEach((key, k) => {
      if (key.accidental) staveNote.addModifier(new Accidental(key.accidental), k)
    })
    if (note.dots) Dot.buildAndAttach([staveNote], { all: true })
    const fill = row.colour(bar.index, i, note)
    if (fill) staveNote.setStyle({ fillStyle: fill, strokeStyle: fill })
    return staveNote
  })
}

function drawTies(row: Row, written: readonly WrittenNote[], notes: readonly StaveNote[], context: RenderContext) {
  // A drum hit does not sustain: no ties on the percussion staff.
  if (row.clef === 'percussion') return
  written.forEach((note, i) => {
    const next = notes[i + 1]
    if (note.tie && next) {
      const indexes = note.keys.map((_, k) => k)
      new StaveTie({ firstNote: notes[i]!, lastNote: next, firstIndexes: indexes, lastIndexes: indexes }).setContext(context).draw()
    }
  })
}

function draw() {
  const element = host.value
  if (!element || shownIndexes.value.length === 0) return
  const tops = rows.value.reduce<number[]>((list, row) => [...list, (list[list.length - 1] ?? 10) + row.gap], [])
  const { context, width } = staffContext(element, STAFF_HEIGHT + tops[tops.length - 1]! - 10, props.scale)
  const signature = `${props.meter.numerator}/${props.meter.denominator}`
  const lead = 70
  const barWidth = (width - 2 - lead) / props.perPage
  const drawn = rows.value.map(() => ({ notes: [] as StaveNote[], written: [] as WrittenNote[] }))
  let x = 1
  shownIndexes.value.forEach((index, b) => {
    const staveWidth = barWidth + (b === 0 ? lead : 0)
    const voices: Voice[] = []
    const staves: Stave[] = []
    const beams: Beam[] = []
    rows.value.forEach((row, r) => {
      const stave = new Stave(x, tops[r]!, staveWidth)
      if (b === 0) {
        stave.addClef(row.clef)
        if (row.part) stave.addTimeSignature(signature)
      }
      stave.setContext(context).draw()
      const bar = row.bars[index]
      const notes = bar ? barNotes(row, bar) : []
      drawn[r]!.notes.push(...notes)
      drawn[r]!.written.push(...(bar?.notes ?? []))
      voices.push(new Voice({ numBeats: props.meter.numerator, beatValue: props.meter.denominator }).setStrict(false).addTickables(notes))
      staves.push(stave)
      beams.push(...Beam.generateBeams(notes, { groups: Beam.getDefaultBeamGroups(signature) }))
    })
    // A grand staff is one instrument: a brace in front and bar lines joining both staves.
    if (props.lower) {
      if (b === 0) new StaveConnector(staves[0]!, staves[1]!).setType('brace').setContext(context).draw()
      new StaveConnector(staves[0]!, staves[1]!).setType('singleLeft').setContext(context).draw()
      new StaveConnector(staves[0]!, staves[1]!).setType('singleRight').setContext(context).draw()
    }
    // All staves are formatted together, so notes at the same moment stand one under another.
    const formatter = new Formatter()
    voices.forEach((voice) => formatter.joinVoices([voice]))
    formatter.format(voices, staves[0]!.getNoteEndX() - staves[0]!.getNoteStartX() - 10)
    voices.forEach((voice, v) => voice.draw(context, staves[v]!))
    beams.forEach((beam) => beam.setContext(context).draw())
    x += staves[0]!.getWidth()
  })
  rows.value.forEach((row, r) => drawTies(row, drawn[r]!.written, drawn[r]!.notes, context))
}

/** "bar:note" of the note sounding at `time` in these bars, or null in a rest. */
function noteAt(bars: readonly WrittenBar[], time: number): string | null {
  const bar = barAt(bars as WrittenBar[], time)
  const notes = bars[bar]?.notes ?? []
  let note = -1
  for (let i = 0; i < notes.length; i++) if (notes[i]!.time <= time + 1e-3) note = i
  return note >= 0 && notes[note]!.keys.length > 0 ? `${bar}:${note}` : null
}

let frame = 0
function follow() {
  const time = props.getTime()
  const nextPage = Math.floor(barAt(props.bars as WrittenBar[], time) / props.perPage)
  if (nextPage !== page.value) page.value = nextPage
  const upper = noteAt(props.bars, time)
  const lower = props.lower ? noteAt(props.lower, time) : null
  if (upper !== playing.value.upper || lower !== playing.value.lower) playing.value = { upper, lower }
  frame = requestAnimationFrame(follow)
}

let observer: ResizeObserver | null = null
onMounted(() => {
  follow()
  draw()
  observer = new ResizeObserver(() => draw())
  if (host.value) observer.observe(host.value)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  observer?.disconnect()
})
watch([shownIndexes, playing, rows, () => props.scale], draw)
</script>

<template>
  <div ref="host" class="song-staff" role="img" />
</template>

<style scoped>
.song-staff {
  width: 100%;
  color: var(--ui-text-highlighted);
}

.song-staff :deep(svg) {
  display: block;
  overflow: visible;
}
</style>
