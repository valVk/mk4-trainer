<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChordDiagram from '@/components/ChordDiagram.vue'
import ExamBadge from '@/components/ExamBadge.vue'
import HelpSwitch from '@/components/HelpSwitch.vue'
import LevelRow from '@/components/LevelRow.vue'
import CircleOfFifths from '@/components/CircleOfFifths.vue'
import ChoiceTask from '@/pages/theory/ChoiceTask.vue'
import FormOrder from '@/pages/theory/FormOrder.vue'
import NoteStaff, { type StaffNote } from '@/components/NoteStaff.vue'
import OctaveMap from '@/components/OctaveMap.vue'
import NoteReading from '@/pages/theory/NoteReading.vue'
import SongPractice from '@/pages/SongPractice.vue'
import PianoKeyboard from '@/components/PianoKeyboard.vue'
import PianoMap from '@/components/PianoMap.vue'
import SkillPicker from '@/components/SkillPicker.vue'
import StarRating from '@/components/StarRating.vue'
import { STAFF_COLOURS } from '@/components/staffDrawing'
import { useCleanChord } from '@/composables/useCleanChord'
import { useHelp } from '@/composables/useHelp'
import { useKeyboardWindow } from '@/composables/useKeyboardWindow'
import { useNextAfterRelease } from '@/composables/useNextAfterRelease'
import { usePadActions } from '@/composables/usePadActions'
import { useNoteNames } from '@/composables/useNoteNames'
import { useNoteSource } from '@/composables/useNoteSource'
import { useProgress } from '@/composables/useProgress'
import { SETTLE_MS, useSettled } from '@/composables/useSettled'
import { useShortScreen } from '@/composables/useShortScreen'
import { useSynth } from '@/composables/useSynth'
import { useTheoryPiece } from '@/composables/useTheoryPiece'
import { useTeacherWait } from '@/composables/useTeacherWait'
import { useTheoryPieces } from '@/composables/useTheoryPieces'
import { useWakeLock } from '@/composables/useWakeLock'
import { KEYBOARD_KEYS } from '@/lib/keyboard'
import { EXAM_STARS, STAR_THRESHOLDS } from '@/lib/levels'
import { barKeys, barVexSpelling, keyOf, spelled, vexInKey, type Alter, type BarNote, type Spelled } from '@/lib/accidentals'
import { NOTE_SECTIONS, SEVENTH_TYPES, articulationVerdict, checkNote, checkVoicing, countsForStars, currentNoteLevel, isNoteLevelOpen, nextTask, noteStars, type NoteIntroId, type NoteSectionId, type NoteTask } from '@/lib/noteLevels'
import { keySignatureName } from '@/lib/notation'
import { KEY_INFO, scaleKeys } from '@/lib/scales'
import { functionChord } from '@/lib/functions'
import { checkChord } from '@/lib/theory'
import { octaveShift, pitch, windowOctaves } from '@/lib/staff'
import { pitchClass } from '@/lib/theory'

// «Теория» → «Ноты» (plan step 19) and «Полутоны и знаки» (step 20): a note on the staff (or its name, or a
// step from a key) → press the key. Praise at once; «not this one» only after the fingers have settled; the
// key lights up only after the child has had time to look for it. Exact-octave levels say which octave button
// the MK4 needs. Each section brings its own levels, progress and intros; the loop is the same.

const props = withDefaults(defineProps<{ section?: NoteSectionId }>(), { section: 'notes' })

/** Pause after a right note before the next one, once the keys are up. */

const { t } = useI18n()
useWakeLock()
const progress = useProgress()
const { heldNotes, pressNote, releaseNote, onEvent } = useNoteSource()
const { playCue } = useSynth()
const { localName } = useNoteNames()
const windowStart = useKeyboardWindow()
const { piecesAfter } = useTheoryPieces(props.section)
/** A piece played inside the section: the task waits, its keys belong to the piece. */
const { piece: openPiece, closePiece } = useTheoryPiece()
const levels = NOTE_SECTIONS[props.section]
const short = useShortScreen()

const passed = computed(() => progress.noteProgress.value[props.section])
const level = ref(currentNoteLevel(passed.value, levels))
const info = computed(() => levels.find((item) => item.id === level.value)!)
const stars = computed(() => noteStars(passed.value, level.value, levels))
/**
 * Help is the app's «С подсказкой» switch (plan step 29), as in chords: on, the key lights up after a teacher's wait
 * and a chain shows its chord; off, nothing lights. From two stars the level is in its exam: no help, and a chord
 * counts only when its keys go down together.
 */
const { exam, guideOn } = useHelp(() => stars.value >= EXAM_STARS)
const levelTabs = computed(() => levels.map((item) => ({ id: item.id, open: isNoteLevelOpen(item.id, passed.value, levels), stars: noteStars(passed.value, item.id, levels) })))
/** «Н3», «П2»: the level's short name in this section. */
const tabName = (id: number) => t(`theory.sectionTab.${props.section}`, { n: id })
const isOpenHere = (id: number) => isNoteLevelOpen(id, passed.value, levels)

// Progress comes from the database a moment after the page opens: start on the child's level then.
let settledLevel = false
watch(passed, (value) => {
  if (settledLevel) return
  settledLevel = true
  level.value = currentNoteLevel(value, levels)
})

const introSeen = ref(new Set<number>())
const phase = ref<'intro' | 'task'>('task')
const task = ref<NoteTask>(nextTask(info.value, null))
/** In a bar (П5): the note to play now; the bar is done when its last note is played. */
const barIndex = ref(0)
/** After a note of a bar is found, the next counts only once the keys are up: the same key twice is two presses. */
const armed = ref(true)
/** What to change in an articulation (С5): shorter, longer, louder. */
const articulationHint = ref<string | null>(null)
/** Keys played one after the other: a bar (П5), a scale or a moved melody (Г1–Г3, Г6). */
const sequenceKeys = computed(() => task.value.bar?.keys ?? task.value.sequence?.keys ?? null)
const target = computed(() => sequenceKeys.value ? sequenceKeys.value[barIndex.value]! : task.value.key)
/** The chord of a chain to play now (Ф7–Ф9). */
const chainChord = computed(() => task.value.chain?.[barIndex.value] ?? null)
/** Answered with buttons (or taps on bars): the keys are free to try things on. */
const buttonTask = computed(() => Boolean(task.value.choice || task.value.keyChoice || task.value.harmony || task.value.form))
/** The chord to play now: a chord task, or the current one of chords in a row (D7 → T). */
const currentChord = computed(() => task.value.chordQuestion?.chord ?? task.value.chordSteps?.chords[barIndex.value] ?? null)
const solved = ref(false)
const levelDone = ref(false)
/** The key lights up after the teacher's wait (when help is on). */
const teacher = useTeacherWait()
const keyHint = teacher.shown
// Next note once the keys are up, so it starts from silence; the level-done card waits for the student.
const { cancel: cancelNext } = useNextAfterRelease(() => solved.value, () => levelDone.value, () => newTask(task.value))
/** A right answer on the timed level that came too late for a star. */
const slowAnswer = ref(false)
/** Counts the notes shown, so the timer bar restarts for each. */
const taskNumber = ref(0)
let shownAt = performance.now()

function newTask(previous: NoteTask | null) {
  cancelNext()
  teacher.stop()
  task.value = nextTask(info.value, previous)
  barIndex.value = 0
  armed.value = true
  articulationHint.value = null
  solved.value = false
  slowAnswer.value = false
  taskNumber.value++
  shownAt = performance.now()
  waitForHint()
}

/** The key lights up after a while to look for it; never on the timed level (it would give the answer away), nor for melodies. */
function waitForHint() {
  teacher.stop()
  if (!guideOn.value) return
  // Melodies have no single key; the timed level would give the answer away; chains light up (or not) on their own.
  if (info.value.timed !== undefined || info.value.readingBpm !== undefined || buttonTask.value || task.value.chain) return
  teacher.restart()
}

function openLevel(id: number) {
  if (!isOpenHere(id)) return
  closePiece()
  level.value = id
}

watch(level, () => {
  levelDone.value = false
  phase.value = info.value.introduces.length && !introSeen.value.has(level.value) ? 'intro' : 'task'
  newTask(null)
}, { immediate: true })

/**
 * The main button, last on the right: «Понятно» in the intro, «Дальше» once found (the next comes by itself when the
 * keys are up, this is quicker), the next level when this one is done; else waiting for the keys.
 */
const primary = computed<{ icon: string, label: string, disabled: boolean, run: () => void }>(() => {
  if (phase.value === 'intro') return { icon: 'i-lucide-check', label: t('theory.intro.ok'), disabled: false, run: closeIntro }
  if (levelDone.value && isOpenHere(level.value + 1)) return { icon: 'i-lucide-arrow-right', label: t('theory.nextLevel'), disabled: false, run: () => openLevel(level.value + 1) }
  if (levelDone.value) return { icon: 'i-lucide-rotate-ccw', label: t('theory.notes.stay'), disabled: false, run: () => { levelDone.value = false } }
  return { icon: 'i-lucide-arrow-right', label: t('theory.next'), disabled: !solved.value, run: () => newTask(task.value) }
})

// Pads as on every screen: 1 the main button, 4 skip. «Читаем с ритмом» and a piece have their own.
usePadActions({
  next: () => {
    if (!reading.value && !openPiece.value && !primary.value.disabled) primary.value.run()
  },
  skip: () => {
    if (!reading.value && !openPiece.value && phase.value === 'task' && !solved.value && !levelDone.value) newTask(task.value)
  },
})

function closeIntro() {
  introSeen.value = new Set([...introSeen.value, level.value])
  phase.value = 'task'
  newTask(null)
}

// When each held key went down: a neighbour brushed in the same moment is forgiven, one pressed later is not.
const downAt = new Map<number, number>()
const presses = computed(() => heldNotes.value.map((key) => {
  if (!downAt.has(key)) downAt.set(key, performance.now() / 1000)
  return { key, time: downAt.get(key)! }
}))
watch(heldNotes, (held) => {
  for (const key of downAt.keys()) if (!held.includes(key)) downAt.delete(key)
})

/** How the chord task stands: the chord with its inversion (Ф1–Ф5). */
const chordStatus = computed(() => (currentChord.value ? checkChord(heldNotes.value, currentChord.value.target).status : null))
const check = computed(() => {
  if (currentChord.value) return chordStatus.value === 'empty' ? 'empty' : chordStatus.value === 'correct' ? 'right' : 'wrong'
  if (chainChord.value) {
    const voicing = checkVoicing(chainChord.value.keys, presses.value)
    return voicing === 'right' ? 'right' : voicing === 'empty' ? 'empty' : 'wrong'
  }
  return checkNote(target.value, presses.value, info.value.anyOctave)
})
// «Wrong» and «other octave» wait until the fingers have landed.
const settledHeld = useSettled(heldNotes, (next) => (next.length === 0 ? 0 : SETTLE_MS))
// Tasks answered with buttons: the keys are free to try things on, never «wrong».
const settledCheck = computed(() => (settledHeld.value.length === 0 || !armed.value || buttonTask.value ? 'empty' : check.value))

watch(() => heldNotes.value.length, (count) => {
  if (count === 0) armed.value = true
})

// Turned on in the middle of a task: the wait starts now.
watch(guideOn, (on) => {
  if (on && !solved.value) waitForHint()
})

/** The exam asks a chord's keys to land together. */
const { notTogether, together } = useCleanChord()

watch(check, (status) => {
  // An articulation is judged when the key is let go (see below), not when it goes down.
  if (notTogether.value) return
  if (status === 'right' && exam.value && currentChord.value && !together()) return
  if (openPiece.value || buttonTask.value || task.value.articulation || status !== 'right' || solved.value || !armed.value || phase.value !== 'task' || info.value.readingBpm !== undefined) return
  // A bar: on to its next note; the bar is one answer, counted when its last note is played.
  const length = task.value.chain?.length ?? task.value.chordSteps?.chords.length ?? sequenceKeys.value?.length
  if (length && barIndex.value < length - 1) {
    barIndex.value++
    armed.value = false
    playCue('step')
    waitForHint()
    return
  }
  answeredRight()
})

/** A right answer, by keys or by a button: praised at once, counted towards the stars. */
function answeredRight() {
  solved.value = true
  teacher.stop()
  // Right is always praised; on the timed level a slow answer just does not count towards the stars.
  if (!countsForStars(info.value, performance.now() - shownAt)) {
    slowAnswer.value = true
    playCue('success')
    return
  }
  const before = noteStars(passed.value, level.value, levels)
  void progress.addNoteCorrect(level.value, props.section).then(() => {
    const done = before < STAR_THRESHOLDS.length && noteStars(passed.value, level.value, levels) === STAR_THRESHOLDS.length
    levelDone.value = done
    playCue(done ? 'levelDone' : 'success')
  })
}


/** Octave buttons the target needs on an exact level; 0 when it is under the hands (or any octave counts). */
const shiftNeeded = computed(() => (info.value.anyOctave || buttonTask.value || task.value.chain || currentChord.value ? 0 : octaveShift(target.value, windowStart.value)))
/** The key to light up as a hint: the target itself, or on «any octave» the same note inside the window. */
const hintKey = computed(() => {
  if (!info.value.anyOctave) return shiftNeeded.value === 0 ? target.value : null
  for (let key = windowStart.value; key < windowStart.value + KEYBOARD_KEYS; key++) if (pitchClass(key) === pitchClass(target.value)) return key
  return null
})

/** Keys lit as the hint: a chain on its first level always, a chord or a note after the wait. */
const hintKeys = computed<number[]>(() => {
  if (!guideOn.value) return []
  if (chainChord.value) return info.value.chainHints ? chainChord.value.keys : []
  if (!keyHint.value) return []
  if (currentChord.value) return currentChord.value.keys
  return hintKey.value === null ? [] : [hintKey.value]
})

/** What is wrong with a chord, in words, once the fingers have settled. */
const chordHint = computed(() => {
  const question = currentChord.value
  if (question) {
    const status = chordStatus.value
    if (status === 'incomplete') return t('theory.functions.missing')
    if (status === 'extra') return t('theory.functions.extra')
    if (status === 'wrongInversion') return t('theory.functions.bass', { note: name(question.keys[0]!) })
    return t('theory.functions.otherChord')
  }
  const chord = chainChord.value
  if (!chord) return null
  // A note of the voicing not down: name it and its role («в Dm нужна ля — квинта»); all there but placed wrong: the third goes up.
  const missing = chord.keys.findIndex((key) => !heldNotes.value.includes(key))
  if (missing === -1) return null
  const pcs = new Set(heldNotes.value.map(pitchClass))
  if (chord.keys.every((key) => pcs.has(pitchClass(key)))) return t('theory.functions.chainVoicing')
  return t('theory.functions.chainMissing', { chord: chord.name, note: name(chord.keys[missing]!), role: t(`theory.functions.roles.${chord.roles[missing]}`) })
})

// Articulation (С5): the right key, judged by how long it is held and how hard it is hit, when it is let go.
let articulationDown: { at: number, velocity: number | null } | null = null
onEvent((event) => {
  const kind = task.value.articulation
  if (!kind || openPiece.value || solved.value || phase.value !== 'task') return
  if (event.type === 'noteOn' && event.note === target.value) {
    articulationDown = { at: performance.now(), velocity: event.source === 'midi' ? event.velocity : null }
    articulationHint.value = null
  } else if (event.type === 'noteOff' && event.note === target.value && articulationDown) {
    const verdict = articulationVerdict(kind, (performance.now() - articulationDown.at) / 1000, articulationDown.velocity)
    articulationDown = null
    if (verdict === 'right') answeredRight()
    else articulationHint.value = t(`theory.sevenths.articulationHints.${verdict}`)
  }
})

/** «Читаем с ритмом» runs its own attempts (NoteReading) once its intro is closed. */
const reading = computed(() => info.value.readingBpm !== undefined && phase.value === 'task')

/** One more melody read right: it counts like a note found, and may finish the level. */
async function onMelodyPassed() {
  const before = noteStars(passed.value, level.value, levels)
  await progress.addNoteCorrect(level.value, props.section)
  const done = before < STAR_THRESHOLDS.length && noteStars(passed.value, level.value, levels) === STAR_THRESHOLDS.length
  levelDone.value = done
  playCue(done ? 'levelDone' : 'success')
}

/** Keys on the screen while a task runs, and in the octave-map intro, which is played with. */
const keysShown = computed(() => phase.value === 'task' || info.value.introduces.includes('ledgers'))

const name = (key: number) => localName(pitchClass(key))
/** «фа-диез», «си-дубль-бемоль»: the name of a note as written. */
const LETTER_KEYS = [60, 62, 64, 65, 67, 69, 71]
const writtenName = (note: Spelled) => {
  const base = name(LETTER_KEYS[note.letter]!)
  return note.alter === 0 ? base : t(`theory.accidentals.alter.${note.alter}`, { name: base })
}
/** A bar: every note as printed, played ones green with their name, the one to play now blue. */
const barNotes = computed<StaffNote[]>(() => {
  const bar = task.value.bar
  if (!bar) return []
  const writing = barVexSpelling(bar.key, bar.notes)
  return bar.notes.map((note, i) => {
    const done = solved.value || i < barIndex.value
    const alter = (bar.keys[i]! - keyOf({ letter: note.letter, octave: note.octave, alter: 0 })) as Alter
    return {
      key: bar.keys[i]!,
      vex: writing[i]!,
      label: done ? writtenName({ letter: note.letter, octave: note.octave, alter }) : undefined,
      colour: done ? STAFF_COLOURS.onTime : i === barIndex.value ? STAFF_COLOURS.current : undefined,
    }
  })
})
/**
 * A scale (Г1–Г3) shows only what is played, so the staff fills in note by note; a melody to move (Г6) stands whole,
 * played notes green and the one to move now blue. Written under the task's key signature.
 */
const sequenceNotes = computed<StaffNote[]>(() => {
  const sequence = task.value.sequence
  if (!sequence) return []
  return sequence.written.flatMap((note, i) => {
    const done = solved.value || i < barIndex.value
    if (sequence.reveal && !done) return []
    return [{ key: keyOf(note), vex: vexInKey(note, sequence.signature), label: sequence.reveal ? writtenName(note) : undefined, colour: done ? STAFF_COLOURS.onTime : i === barIndex.value ? STAFF_COLOURS.current : undefined }]
  })
})
/** A melody to finish (Г5): its notes, and the note it resolves to once found. */
const resolutionNotes = computed<StaffNote[]>(() => {
  const resolution = task.value.resolution
  if (!resolution) return []
  const signature = KEY_INFO[resolution.key].signature
  const notes: StaffNote[] = resolution.written.map((note) => ({ key: keyOf(note), vex: vexInKey(note, signature) }))
  if (solved.value) notes.push({ key: keyOf(resolution.resolution), vex: vexInKey(resolution.resolution, signature), label: writtenName(resolution.resolution), colour: STAFF_COLOURS.onTime })
  return notes
})
/** The key signature on the task's staff, VexFlow's name. */
const staffKeySignature = computed(() => {
  if (task.value.bar) return task.value.bar.key
  if (task.value.sequence) return keySignatureName(task.value.sequence.signature)
  if (task.value.resolution) return keySignatureName(KEY_INFO[task.value.resolution.key].signature)
  return undefined
})
/** VexFlow's codes for the signs of С5. */
const ARTICULATION_CODES = { staccato: 'a.', tenuto: 'a-', accent: 'a>' } as const
const staffNotes = computed<StaffNote[]>(() => task.value.articulation
  ? [{ key: target.value, articulation: ARTICULATION_CODES[task.value.articulation], colour: solved.value ? STAFF_COLOURS.onTime : undefined, label: solved.value ? name(target.value) : undefined }]
  : task.value.bar ? barNotes.value : task.value.sequence ? sequenceNotes.value : task.value.resolution ? resolutionNotes.value : [{
  key: target.value,
  written: task.value.written,
  label: solved.value ? (task.value.written ? writtenName(task.value.written) : name(target.value)) : undefined,
  colour: solved.value ? STAFF_COLOURS.onTime : undefined,
}])
/** What the task asks, in one line over the card. */
const prompt = computed(() => {
  const show = info.value.show
  if (show === 'name') return t('theory.notes.pressName')
  if (show === 'step') return info.value.intervals ? t('theory.intervals.buildPrompt') : t('theory.accidentals.stepPrompt')
  if (show === 'bar') return t('theory.accidentals.barPrompt')
  if (show === 'ear') return t(info.value.harmonic ? 'theory.intervals.earHarmonicPrompt' : 'theory.intervals.earPrompt')
  if (show === 'read') return t('theory.intervals.readPrompt')
  const sequence = task.value.sequence
  if (show === 'scale' && sequence?.scale) return t('theory.scales.buildPrompt', { scale: t(`theory.scales.kinds.${sequence.scale.kind}`, { key: t(`theory.scales.tonics.${sequence.scale.key}`) }) })
  if (show === 'transpose' && sequence) return t(sequence.shift === 1 ? 'theory.scales.transposeSemitone' : 'theory.scales.transposeTone')
  if (show === 'keyChoice') return t('theory.scales.keyPrompt')
  if (show === 'chord') return t('theory.functions.chordPrompt')
  if (show === 'chordSteps') return t('theory.sevenths.resolvePrompt')
  if (show === 'form') return t('theory.sevenths.formPrompt')
  if (show === 'articulation') return t(`theory.sevenths.articulationPrompts.${task.value.articulation ?? 'staccato'}`)
  if (show === 'harmony') return t('theory.functions.harmonyPrompt', { key: t(`theory.scales.keys.${task.value.harmony?.key ?? 'C'}`) })
  if (show === 'chain') return t('theory.functions.chainPrompt')
  if (show === 'resolve') return t('theory.scales.resolvePrompt', { key: t(`theory.scales.keys.${task.value.resolution?.key ?? 'C'}`) })
  return info.value.anyOctave ? t('theory.notes.findAny') : t('theory.notes.findExact')
})
/** A chord asked in words: «S в соль мажоре», «T6 в до мажоре», «III ступень в ля миноре», or just «C/E». */
const chordWords = computed(() => {
  const question = task.value.chordQuestion
  if (!question) return ''
  const type = question.chord.target.type
  if (!question.key) return SEVENTH_TYPES.includes(type) ? t(`lab.type.${type}`, { root: name(question.chord.target.root) }) : question.chord.symbol
  // D7 and its inversions: D⁶₅, D⁴₃, D₂.
  if (type === '7') return `${['D7', 'D⁶₅', 'D⁴₃', 'D₂'][question.inversion]} ${t(`theory.scales.keysIn.${question.key}`)}`
  const inKey = t(`theory.scales.keysIn.${question.key}`)
  if (question.degree) return t('theory.functions.degreeIn', { degree: ROMAN[question.degree - 1], key: inKey })
  return `${question.fn}${['', '6', '⁶₄'][question.inversion]} ${inKey}`
})
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

/** A scale after a wrong key: how far the next note is, «тон», «полутон» or «полтора тона». */
const stepHint = computed(() => {
  const sequence = task.value.sequence
  if (!sequence?.scale || barIndex.value === 0) return null
  const size = sequence.keys[barIndex.value]! - sequence.keys[barIndex.value - 1]!
  return t(`theory.scales.stepHint.${size}`)
})
/** The options of a button task: an interval (step 21) or a key (step 22). */
const choiceTask = computed(() => {
  const choice = task.value.choice
  if (choice) {
    const notes = [choice.low, choice.high]
    return {
      answer: choice.answer as string,
      options: choice.options.map((id) => ({ id: id as string, label: t(`theory.intervals.names.${id}`) })),
      staffNotes: info.value.show === 'read' ? notes.map((note) => ({ key: keyOf(note), written: note })) : undefined,
      sound: info.value.show === 'read' ? undefined : { keys: notes.map(keyOf), together: choice.harmonic },
      keySignature: undefined as string | undefined,
      wrongText: (label: string) => t(info.value.show === 'read' ? 'theory.intervals.notThisRead' : 'theory.intervals.notThis', { name: label }),
    }
  }
  const harmony = task.value.harmony
  if (harmony) {
    const signature = KEY_INFO[harmony.key].signature
    return {
      answer: harmony.answer as string,
      options: (['T', 'S', 'D'] as const).map((fn) => ({ id: fn as string, label: t(`theory.functions.names.${fn}`, { chord: functionChord(harmony.key, fn).symbol }) })),
      staffNotes: harmony.written.map((note) => ({ key: keyOf(note), vex: vexInKey(note, signature) })),
      sound: { keys: harmony.written.map(keyOf), together: false },
      keySignature: keySignatureName(signature),
      wrongText: (label: string) => t('theory.functions.notThisFunction', { name: label }),
    }
  }
  const keyChoice = task.value.keyChoice
  if (!keyChoice) return null
  return {
    answer: keyChoice.answer as string,
    options: keyChoice.options.map((id) => ({ id: id as string, label: t(`theory.scales.keys.${id}`) })),
    staffNotes: keyChoice.written.map((note) => ({ key: keyOf(note), vex: vexInKey(note, keyChoice.signature) })),
    sound: undefined,
    keySignature: keySignatureName(keyChoice.signature),
    wrongText: (label: string) => t('theory.scales.notThisKey', { name: label }),
  }
})
/** A step task in words: «на полутон выше», «на тон ниже». */
const stepWords = computed(() => {
  const step = task.value.step
  if (!step) return ''
  // An interval: «вверх: большая терция»; a step of «Полутоны и знаки»: «на тон ниже».
  if (step.interval) return t(step.up ? 'theory.intervals.up' : 'theory.intervals.down', { name: t(`theory.intervals.names.${step.interval}`) })
  return t(`theory.accidentals.step.${step.semitones === 1 ? 'semitone' : 'tone'}${step.up ? 'Up' : 'Down'}`)
})
const underHands = computed(() => windowOctaves(windowStart.value).map((item) => t(`theory.octaves.${item}`)).join(t('theory.notes.and')))

const NAMES = 'C4 D4 E4 F4 G4 A4 B4'.split(' ').map(pitch)
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
/** Landmarks shown in the intros, with their names. */
const landmarks = (names: string): StaffNote[] => names.split(' ').map(pitch).map((key) => ({ key, label: name(key) }))
/** Written notes for the intros of «Полутоны и знаки», each with its name. */
const writtenNotes = (names: string): StaffNote[] => names.split(' ').map(spelled).map((note) => ({ key: keyOf(note), written: note, label: writtenName(note) }))
/** Intros drawn as keys with the semitones between them. */
const INTRO_KEYS: Partial<Record<NoteIntroId, { lit: number[], from?: number, to?: number }[]>> = {
  semitone: [{ lit: [64, 65] }, { lit: [60, 62] }],
  perfect: [{ lit: [60, 65] }, { lit: [60, 67] }],
  thirds: [{ lit: [60, 63] }, { lit: [60, 64] }],
  sixths: [{ lit: [60, 69] }, { lit: [60, 71] }],
  majorSteps: [{ lit: scaleKeys(60, 'major') }],
  minorSteps: [{ lit: scaleKeys(57, 'minor'), from: 57, to: 69 }],
  scaleVariants: [{ lit: scaleKeys(57, 'harmonicMinor'), from: 57, to: 69 }, { lit: scaleKeys(57, 'melodicMinor'), from: 57, to: 69 }],
  mainTriads: [{ lit: [60, 64, 67], from: 60, to: 76 }, { lit: [65, 69, 72], from: 60, to: 76 }, { lit: [67, 71, 74], from: 60, to: 76 }],
  inversions: [{ lit: [64, 67, 72], from: 60, to: 76 }, { lit: [67, 72, 76], from: 60, to: 76 }],
  minorDominant: [{ lit: [57, 60, 64], from: 57, to: 72 }, { lit: [64, 68, 71], from: 57, to: 72 }],
  sevenths: [{ lit: [60, 64, 67, 71], from: 60, to: 72 }, { lit: [60, 64, 67, 70], from: 60, to: 72 }, { lit: [60, 63, 66, 69], from: 60, to: 72 }],
  dominantSeventh: [{ lit: [55, 59, 62, 65], from: 53, to: 72 }, { lit: [60, 64, 67], from: 53, to: 72 }],
  seventhInversions: [{ lit: [59, 62, 65, 67], from: 55, to: 72 }, { lit: [62, 65, 67, 71], from: 55, to: 72 }, { lit: [65, 67, 71, 74], from: 55, to: 76 }],
}
/** The key-signature intro: in G major F sounds as F♯; a natural makes it F up to the bar line. */
const keyBarIntro = (): StaffNote[] => {
  const notes: BarNote[] = [{ letter: 3, octave: 4, sign: null }, { letter: 3, octave: 4, sign: 'natural' }, { letter: 3, octave: 4, sign: null }]
  const keys = barKeys('G', notes)
  const writing = barVexSpelling('G', notes)
  return notes.map((note, i) => ({ key: keys[i]!, vex: writing[i]!, label: writtenName({ letter: note.letter, octave: note.octave, alter: (keys[i]! - 65) as Alter }) }))
}
const INTRO_NOTES: Partial<Record<NoteIntroId, { show: 'treble' | 'bass' | 'grand', notes: () => StaffNote[], keySignature?: string }>> = {
  keySignature: { show: 'treble', notes: keyBarIntro, keySignature: 'G' },
  stable: { show: 'treble', notes: () => writtenNotes('C4 E4 G4 C5') },
  transpose: { show: 'treble', notes: () => writtenNotes('C4 A4 A4 G4'), keySignature: 'F' },
  sharpFlat: { show: 'treble', notes: () => writtenNotes('F4 F#4 B4 Bb4') },
  natural: { show: 'treble', notes: () => writtenNotes('F#4 Fn4') },
  double: { show: 'treble', notes: () => writtenNotes('Fx4 Bbb4') },
  enharmonic: { show: 'treble', notes: () => writtenNotes('C#4 Db4 E#4 F4') },
  treble: { show: 'treble', notes: () => landmarks('C4 G4 G5') },
  bass: { show: 'bass', notes: () => landmarks('F2 F3 C4') },
  grand: { show: 'grand', notes: () => landmarks('C3 F3 C4 G4 C5') },
  timed: { show: 'grand', notes: () => landmarks('D3 A3 E4 B4') },
}
</script>

<template>
  <!-- The buttons first, left, as in «Ритм» and song practice; the same ones in every phase, only what they may do
       changes. «Читаем с ритмом» puts its own here. -->
  <div v-if="!openPiece" id="notes-actions" class="toolbar">
    <template v-if="!reading">
      <UButton icon="i-lucide-skip-forward" color="neutral" variant="soft" size="lg" :disabled="phase === 'intro' || solved || levelDone" :label="t('train.skip')" @click="newTask(task)" />
      <!-- The main action is always the last button, on the right (owner's rule). -->
      <UButton :icon="primary.icon" size="lg" class="toolbar__main" :disabled="primary.disabled" :label="primary.label" @click="primary.run" />
    </template>
  </div>

  <LevelRow
    :tabs="levelTabs"
    :current="openPiece ? null : level"
    :pieces-after="piecesAfter"
    :open-piece-key="openPiece?.key"
    :label="t('theory.levelsLabel')"
    @select="openLevel"
  >
    <StarRating :value="stars" size="lg" />
    <ExamBadge v-if="exam && !reading" />
    <!-- The app's help switch, in the drawer; a level's exam turns it off. -->
    <HelpSwitch :on="guideOn" :exam="exam" />
    <!-- Reading in rhythm is judged in time: how strictly. -->
    <SkillPicker v-if="reading" />
    <!-- Where the keys are, in the row. The octave moves with the MK4's Octave buttons or Z and X (owner's choice). -->
    <span v-if="keysShown && !reading" class="hands">
      <span class="hands__label text-toned">{{ t('theory.notes.underHands', { octaves: underHands }) }}</span>
    </span>
  </LevelRow>

  <!-- A piece is played right here: the level row stays, only this content becomes its practice. -->
  <SongPractice v-if="openPiece" :key="openPiece.key" :song-id="openPiece.songId" :channel="openPiece.channel" embedded />
  <!-- «Читаем с ритмом»: a melody in time instead of one note at a time. -->
  <NoteReading v-else-if="reading" :level="info" :level-done="levelDone" actions-to="#notes-actions" @passed="onMelodyPassed">
    <template #done>
      <template v-for="piece in piecesAfter(level)" :key="piece.id">
        <UButton v-if="piece.to" :to="piece.to" icon="i-lucide-music" size="md" color="success" :label="t('theory.playPiece', { name: piece.title })" />
      </template>
      <UButton v-if="isOpenHere(level + 1)" icon="i-lucide-skip-forward" color="neutral" variant="soft" size="md" :label="t('theory.nextLevel')" @click="openLevel(level + 1)" />
    </template>
  </NoteReading>
  <template v-else>
    <section class="task">
      <template v-if="phase === 'intro'">
        <p class="prompt text-highlighted">{{ t('theory.intro.title') }}</p>
        <div class="intro">
          <div v-for="id in info.introduces" :key="id" class="intro__item" :class="{ 'intro__item--wide': ['keyboard', 'names', 'ledgers', 'majorSteps', 'minorSteps', 'mainTriads', 'circle', 'chain'].includes(id), 'intro__item--side': id === 'circle' || id === 'chain' }">
            <!-- Steps and intervals counted in keys: the number over the keys is the semitones. -->
          <div v-if="INTRO_KEYS[id]" class="steps-pictures">
            <ChordDiagram v-for="item in INTRO_KEYS[id]" :key="item.lit.join()" :lit="item.lit" :from="item.from ?? 60" :to="item.to ?? 72" />
          </div>
          <!-- Tap a key on the circle: its scale and its tonic chord sound. -->
          <CircleOfFifths v-else-if="id === 'circle' || id === 'chain'" class="intro__circle" :lit="id === 'chain' ? { minor: true, position: 0 } : null" />
          <PianoMap v-else-if="id === 'keyboard'" :window-start="windowStart" class="intro__map" />
            <!-- Live: press Octave + or − and keys, and watch the band and the notes move. -->
            <OctaveMap v-else-if="id === 'ledgers'" :window-start="windowStart" :held="heldNotes" :scale="short ? 0.7 : 0.9" />
            <div v-else-if="id === 'names'" class="names">
              <span v-for="(key, i) in NAMES" :key="key" class="names__item">
                <span class="names__local">{{ name(key) }}</span>
                <span class="names__letter text-muted">{{ LETTERS[i] }}</span>
              </span>
            </div>
            <NoteStaff v-else-if="INTRO_NOTES[id]" playable :notes="INTRO_NOTES[id]!.notes()" :show="INTRO_NOTES[id]!.show" :key-signature="INTRO_NOTES[id]!.keySignature" :scale="1.4" class="intro__staff" />
            <p class="text-toned">{{ t(`theory.notes.intro.${id}`) }}</p>
          </div>
        </div>
      </template>

      <template v-else>
        <!-- The chain needs no line over it (owner's choice): the circle takes that height. -->
        <p v-if="info.show !== 'chain'" class="prompt text-highlighted">
          {{ prompt }}
        </p>
        <p v-if="info.show === 'name'" class="big-name" :class="{ 'big-name--right': solved }">{{ name(target) }}</p>
        <!-- A step: from the key with the dot, by a half or a whole step; the answer's name shows once it is found. -->
        <p v-else-if="info.show === 'step' && task.step" class="big-name big-name--step" :class="{ 'big-name--right': solved }">
          {{ t('theory.accidentals.stepFrom', { name: name(task.step.from), step: stepWords }) }}
          <span v-if="solved" class="big-name__answer">→ {{ name(target) }}</span>
        </p>
        <!-- A chord: asked in words or as a symbol; the symbol shows once it is played. -->
        <p v-else-if="task.chordQuestion" class="big-name big-name--step" :class="{ 'big-name--right': solved }">
          {{ chordWords }}
          <span v-if="solved && task.chordQuestion.key" class="big-name__answer">→ {{ task.chordQuestion.chord.symbol }}</span>
        </p>
        <!-- Chords in a row: D7, then where it resolves. -->
        <p v-else-if="task.chordSteps" class="big-name big-name--step">
          <span v-for="(chord, i) in task.chordSteps.chords" :key="i" :class="{ 'big-name__answer': solved || i < barIndex, 'chain__now': !solved && i === barIndex }">
            {{ i === 0 ? 'D7' : 'T' }}<template v-if="solved || i < barIndex"> ({{ chord.symbol }})</template><template v-if="i === 0"> → </template>
          </span>
          <span class="steps-key">{{ t(`theory.scales.keysIn.${task.chordSteps.key}`) }}</span>
        </p>
        <FormOrder v-else-if="task.form" :bars="task.form.bars" :order="task.form.order" :solved="solved" @right="answeredRight" />
        <!-- A chain around the circle: the chord to play now big, the four in a row, the circle with it lit. -->
        <div v-else-if="task.chain" class="chain">
          <CircleOfFifths class="chain__circle" :lit="chainChord ? { minor: chainChord.minor, position: chainChord.position } : null" />
          <div class="chain__names">
            <p class="big-name" :class="{ 'big-name--right': solved }">{{ chainChord?.name }}</p>
            <ol class="chain__row">
              <li v-for="(chord, i) in task.chain" :key="chord.name" :class="{ 'chain__done': solved || i < barIndex, 'chain__now': !solved && i === barIndex }">{{ chord.name }}</li>
            </ol>
          </div>
        </div>
        <ChoiceTask
          v-else-if="choiceTask"
          :answer="choiceTask.answer"
          :options="choiceTask.options"
          :staff-notes="choiceTask.staffNotes"
          :sound="choiceTask.sound"
          :key-signature="choiceTask.keySignature"
          :wrong-text="choiceTask.wrongText"
          :solved="solved"
          @right="answeredRight"
        />
        <NoteStaff v-else-if="info.show !== 'step'" :notes="staffNotes" :show="info.show === 'treble' || info.show === 'bass' || info.show === 'grand' ? info.show : 'treble'" :key-signature="staffKeySignature" :class="{ 'task__staff--bar': sequenceKeys }" :scale="info.show === 'grand' ? 1.7 : 2.2" fit class="task__staff" />
        <!-- Calm pills over the card, never pushing the layout. -->
        <!-- Time for a star: a calm bar that empties, no countdown numbers and nothing red. -->
        <span v-if="info.timed && !solved" :key="taskNumber" class="timer" :style="{ animationDuration: `${info.timed}ms` }" aria-hidden="true" />
        <p v-if="slowAnswer" class="pill" role="status">{{ t('theory.notes.slow', { s: Math.round(info.timed! / 1000) }) }}</p>
        <p v-else-if="shiftNeeded !== 0 && !solved" class="pill pill--octave" role="status">
          {{ shiftNeeded > 0 ? t('theory.notes.octaveUp') : t('theory.notes.octaveDown') }}
        </p>
        <p v-else-if="settledCheck === 'octave' && !solved" class="pill" role="status">{{ t('theory.notes.otherOctave') }}</p>
        <p v-else-if="notTogether && !solved" class="pill" role="status">{{ t('train.notTogether') }}</p>
        <p v-else-if="articulationHint && !solved" class="pill" role="status">{{ articulationHint }}</p>
        <p v-else-if="settledCheck === 'wrong' && !solved" class="pill" role="status">{{ chordHint ?? stepHint ?? t('theory.notes.notThis') }}</p>
      </template>

      <div v-if="levelDone" class="result result--passed" role="status">
        <p class="result__title">{{ t('theory.notes.levelDone', { tab: tabName(level) }) }}</p>
        <div class="result__actions">
          <template v-for="piece in piecesAfter(level)" :key="piece.id">
            <UButton v-if="piece.to" :to="piece.to" icon="i-lucide-music" size="md" color="success" :label="t('theory.playPiece', { name: piece.title })" />
          </template>
          <UButton v-if="isOpenHere(level + 1)" icon="i-lucide-rotate-ccw" color="neutral" variant="soft" size="md" :label="t('theory.notes.stay')" @click="levelDone = false" />
        </div>
      </div>
    </section>

    <PianoKeyboard
      v-if="keysShown"
      class="note-keys"
      :class="{ 'note-keys--low': phase === 'intro' }"
      :start="windowStart"
      :held="heldNotes"
      :hint="phase === 'task' && !solved ? hintKeys : []"
    :mark="phase === 'task' ? task.step?.from ?? (task.sequence?.scale ? task.sequence.keys[0] : null) ?? null : null"
      @press="pressNote"
      @release="releaseNote"
    />
  </template>
</template>

<style scoped src="./theory.css"></style>

<style scoped>
.task__staff--bar {
  /* Four notes with their names under them need the room. */
  width: min(100%, 50rem);
}

.task__staff {
  flex: 1;
  min-height: 6rem;
  width: min(100%, 36rem);
  align-self: center;
}

.intro .intro__circle {
  /* Big enough to read the keys and tap them: the text stands beside it, so it can take the card's height. */
  height: min(26rem, 46vh);
  max-height: none;
  width: auto;
}

.intro__item--side {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 2rem;
}

.intro__staff {
  /* The whole column: long names («фа-дубль-диез») need the room between the notes. */
  width: 100%;
}

.intro__item--wide {
  grid-column: 1 / -1;
}

.names {
  display: flex;
  gap: 0.5rem;
}

.names__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 3.5rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.625rem;
  background: var(--ui-bg-elevated);
}

.names__local {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ui-text-highlighted);
}

.names__letter {
  font-weight: 600;
}

.big-name {
  align-self: center;
  font-family: var(--font-display);
  font-size: clamp(3rem, 10vh, 5rem);
  font-weight: 800;
  line-height: 1;
  color: var(--ui-text-highlighted);
  transition: color 150ms ease;
}

.big-name--step {
  font-size: clamp(2rem, 7vh, 3.5rem);
  text-align: center;
}

.steps-key {
  display: block;
  font-size: 0.5em;
  color: var(--ui-text-muted);
}

.big-name__answer {
  color: var(--color-correct);
}

.chain {
  flex: 1;
  display: grid;
  /* The circle takes all the height the card has left; the names take the rest of the width. */
  grid-template-columns: auto 1fr;
  grid-template-rows: minmax(0, 1fr);
  align-items: center;
  gap: 2rem;
  min-height: 0;
}

.chain .chain__circle {
  height: 100%;
  width: auto;
  max-height: none;
  aspect-ratio: 1;
}

.chain__names {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.chain__row {
  display: flex;
  gap: 1.25rem;
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ui-text-muted);
}

.chain__done {
  color: var(--color-correct);
}

.chain__now {
  color: var(--color-active);
}

.steps-pictures {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 1.5rem;
}

.big-name--right {
  color: var(--color-correct);
}

.timer {
  position: absolute;
  left: 1.25rem;
  right: 1.25rem;
  bottom: 0.625rem;
  height: 0.25rem;
  border-radius: 999px;
  background: var(--ui-text-dimmed);
  transform-origin: left;
  animation: timer-run linear forwards;
}

@keyframes timer-run {
  to {
    transform: scaleX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .timer {
    animation: none;
  }
}

.pill {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  padding: 0.5rem 0.875rem;
  border-radius: 999px;
  font-weight: 600;
  color: var(--ui-text-toned);
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
}

.pill--octave {
  color: var(--ui-text-highlighted);
  box-shadow: 0 0 0 var(--ring-width) var(--color-active) inset;
}

.hands {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.hands__label {
  font-weight: 600;
  white-space: nowrap;
}

.note-keys {
  /* Lower keys than in «Аккорды»: the staff needs the height here. */
  --keys-height: clamp(7.5rem, 26vh, 13rem);
  width: 100%;
  margin-top: 0.75rem;
}

/* Under the octave map the keys are only for trying it out. */
.note-keys--low {
  --keys-height: clamp(6rem, 18vh, 9rem);
}

/* Short tablets (650 px high): the staff is what is read, so it gets the height before the keys and the prompt. */
@media (max-height: 720px) {
  .note-keys {
    --keys-height: clamp(7rem, 20vh, 10rem);
    margin-top: 0.5rem;
  }

  .prompt {
    font-size: 1.125rem;
  }

  .intro .intro__map {
    max-height: 6.5rem;
  }


  .note-keys--low {
    --keys-height: 6rem;
  }

  .names__item {
    padding: 0.25rem 0.5rem;
  }

  .names__local {
    font-size: 1.0625rem;
  }
}
</style>
