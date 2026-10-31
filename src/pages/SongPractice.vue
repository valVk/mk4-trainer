<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import NoteFall from '@/components/NoteFall.vue'
import OctaveMapButton from '@/components/OctaveMapButton.vue'
import PadStrip from '@/components/PadStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import PianoKeyboard from '@/components/PianoKeyboard.vue'
import ResultCard from '@/components/ResultCard.vue'
import RungLadder from '@/components/RungLadder.vue'
import SongStaff from '@/components/SongStaff.vue'
import SoundControl from '@/components/SoundControl.vue'
import UnitList from '@/components/UnitList.vue'
import { useMetronome } from '@/composables/useMetronome'
import { useLastPlace } from '@/composables/useLastPlace'
import { useMk4Actions } from '@/composables/useMk4Actions'
import { useNoteNames } from '@/composables/useNoteNames'
import { useNoteSource } from '@/composables/useNoteSource'
import { padsPlayMusic, usePadActions } from '@/composables/usePadActions'
import { useProgress } from '@/composables/useProgress'
import { LEARNER_CHANNEL, useSongPlayer } from '@/composables/useSongPlayer'
import { useSynth } from '@/composables/useSynth'
import { useWakeLock } from '@/composables/useWakeLock'
import type { SongProgress } from '@/db/schema'
import { findName, groupOf } from '@/lib/instruments'
import { rangeStartFor } from '@/lib/keyboard'
import { songBeats, tapInputOf, type TapInput } from '@/lib/metronome'
import {
  buildUnits,
  isWrongPress,
  nextUnit,
  openRungs,
  scoreAttempt,
  starsFor,
  type AttemptScore,
  type Press,
  type RungMode,
  type Unit,
  type WaitPress,
} from '@/lib/ladder'
import { parseMix } from '@/lib/mix'
import { MIDDLE_C, clefFor, markPlayed, needsGrandStaff, writePart, writePlayed, type PlayedKey } from '@/lib/notation'
import { drumKind, PAD_NOTE_MIN_S, padLayout } from '@/lib/padLayout'
import { partPhrases, songSections, type Phrase } from '@/lib/phrases'
import { KEY_HINT_DELAY_MS, SONG_VIEWS, chooseWindow, coversStep, followWindow, octaveHint, stepIndexAt, upcomingKeys, type SongView } from '@/lib/practice'
import { parseSong, type Part, type Song } from '@/lib/song'
import { chordSymbol, identifyChord, midiName, noteName } from '@/lib/theory'

/** A press up to this long before a step counts for it, so playing a hair early does not stop the song. */
const EARLY_S = 0.35
/** Lead-in before a unit (bars) and before the whole part in free mode. */
const UNIT_LEAD_IN_BARS = 2
const FREE_LEAD_IN_BARS = 2
/** The attempt ends this long after the unit's last bar, so the last notes ring out. */
const END_TAIL_S = 0.4
const RATES = [0.5, 0.6, 0.7, 0.8, 1] as const

const { t } = useI18n()
useWakeLock()
const props = defineProps<{
  /** Shown inside another screen (a piece inside «Теория»): the song and part come from there, not the address. */
  songId?: number
  channel?: number
  embedded?: boolean
}>()

const route = useRoute()
const backTo = computed(() => `/songs/${route.params.id}`)
const progress = useProgress()
const synth = useSynth()
const player = useSongPlayer()
const { heldNotes, onEvent, pressNote, releaseNote, pressPad } = useNoteSource()
const { localName, withLocal } = useNoteNames()

const songId = props.songId ?? Number(route.params.id)
const record = shallowRef<{ name: string, data: ArrayBuffer, fileName: string } | null>(null)
const song = shallowRef<Song | null>(null)
const part = shallowRef<Part | null>(null)
const phrases = shallowRef<Phrase[]>([])
const units = shallowRef<Unit[]>([])
const saved = shallowRef<Record<string, SongProgress>>({})
const notFound = ref(false)

/** Guided: the teacher's ladder picks mode and speed. Free: the child picks, for the whole part. */
const guided = ref(true)
const unitIndex = ref(0)
const rungIndex = ref(0)
const freeMode = ref<RungMode>('wait')
const freeRate = ref<(typeof RATES)[number]>(0.6)
/** Free mode starts where the teacher's unit was when the switch was turned off (null: the part's start). */
const freeFrom = ref<number | null>(null)
const anyOctave = ref(false)
/** Play the part on the keys or on the 8 pads (drums always use pads). */
const inputMode = ref<'keys' | 'pads'>('keys')
/** Pads hit just now, for the press animation on screen. */
const hitPads = ref<number[]>([])
/** Pad 2 / «Послушать»: play the unit once with the part audible, without scoring or saving. */
const listenOnce = ref(false)

const windowStart = ref(48)
const pendingIndex = ref(0)
const waiting = ref(false)
const result = shallowRef<AttemptScore | null>(null)
/** Keys pressed since the current step became the one to play. */
let pressed = new Set<number>()
let presses: Press[] = []
/** Wait mode: every press while a step was due, right or wrong. */
let waitPresses: WaitPress[] = []
/** Recent presses, for the octave hint. */
const recent = ref<number[]>([])

const passedOf = (unit: Unit) => saved.value[unit.id]?.passed ?? 0
const layout = computed(() => (part.value ? padLayout(part.value) : null))
const onPads = computed(() => inputMode.value === 'pads' && layout.value !== null)
/** Melodic parts with up to 8 notes may switch to pads; drums are always on pads. */
const canChooseInput = computed(() => Boolean(layout.value) && !part.value?.isDrum)
watch(onPads, (value) => {
  padsPlayMusic.value = value
}, { immediate: true })
const unit = computed(() => units.value[unitIndex.value] ?? null)
const rung = computed(() => (unit.value ? unit.value.rungs[Math.min(rungIndex.value, unit.value.rungs.length - 1)]! : null))
const mode = computed<RungMode>(() => (listenOnce.value ? 'listen' : guided.value && rung.value ? rung.value.mode : freeMode.value))
const rate = computed(() => (guided.value && rung.value ? rung.value.rate : freeRate.value))

/** Opens a unit on its next rung to pass (or the last rung when it is finished). */
function selectUnit(index: number) {
  const chosen = units.value[index]
  if (!chosen) return
  unitIndex.value = index
  rungIndex.value = Math.min(passedOf(chosen), chosen.rungs.length - 1)
  prepare()
}

async function open() {
  await progress.init()
  const found = await progress.loadSong(songId)
  const channel = props.channel ?? Number(route.params.channel)
  const parsed = found ? parseSong(found.data, found.fileName) : null
  const chosen = parsed?.parts.find((item) => item.channel === channel)
  if (!found || !parsed || !chosen) {
    notFound.value = true
    return
  }
  record.value = found
  song.value = parsed
  part.value = chosen
  // The accompaniment keeps the balance set on the song map.
  player.setMix(parseMix(found.mix))
  if (chosen.isDrum) inputMode.value = 'pads'
  phrases.value = partPhrases(chosen, parsed.bars)
  units.value = buildUnits(phrases.value, songSections(parsed))
  saved.value = (await progress.loadSongProgress(songId))[channel] ?? {}
  const suggested = nextUnit(units.value, Object.fromEntries(Object.entries(saved.value).map(([id, row]) => [id, row.passed])))
  selectUnit(suggested ? units.value.indexOf(suggested) : 0)
}
void open()

const barLength = computed(() => (song.value ? (song.value.bars[1] ?? 2) - (song.value.bars[0] ?? 0) : 2))
const steps = computed(() => (guided.value ? unit.value?.steps : part.value?.steps) ?? [])
const firstTime = computed(() => (guided.value ? (unit.value?.start ?? 0) : (freeFrom.value ?? steps.value[0]?.time ?? 0)))
const leadIn = computed(() => barLength.value * (guided.value ? UNIT_LEAD_IN_BARS : FREE_LEAD_IN_BARS))
const startTime = computed(() => Math.max(0, firstTime.value - leadIn.value))
// Guided mode shows and plays only the unit's notes; a long last note may ring past the unit's bar line.
const fallNotes = computed(() => {
  const notes = part.value?.notes ?? []
  const current = unit.value
  if (!guided.value || !current) return notes
  return notes.filter((note) => note.start >= current.start - 1e-6 && note.start < current.end - 1e-6)
})
/** How the part is shown above the keys (saved per player). Drums read from the percussion staff. */
const view = computed({
  get: () => progress.songView.value,
  set: (value: SongView) => void progress.setSongView(value),
})
const showStaff = computed(() => view.value !== 'fall')
const showFall = computed(() => !showStaff.value || view.value === 'both')
/** A wide melodic part reads from a grand staff: middle C and up on the treble staff, the rest on the bass staff. */
const grand = computed(() => Boolean(part.value && !part.value.isDrum && needsGrandStaff(part.value.notes)))
/** The shown notes as written music; outside the unit everything is rest. */
const written = computed(() => {
  if (!song.value || !showStaff.value) return []
  const notes = grand.value ? fallNotes.value.filter((note) => note.key >= MIDDLE_C) : fallNotes.value
  return writePart(notes, song.value.bars, song.value.timeSignature, part.value?.isDrum)
})
const writtenLow = computed(() => (song.value && showStaff.value && grand.value
  ? writePart(fallNotes.value.filter((note) => note.key < MIDDLE_C), song.value.bars, song.value.timeSignature)
  : null))
const clef = computed(() => (part.value?.isDrum ? 'percussion' : grand.value ? 'treble' : clefFor(part.value?.notes ?? [])))

/** The child's keys in this attempt, in song time as heard; shown on the staff under the part. */
const played = shallowRef<(PlayedKey & { input: TapInput })[]>([])
/** Song time for keys still held: moves while a key is down, so the note grows as it is held. */
const heldUntil = ref(0)
/**
 * The child's line under the part, in «Ноты» only: in «Оба» the falling notes and the lit keys already
 * show what is pressed, and two staves would not fit above the keys (the same for a grand staff).
 * Pads have no length and listening has nothing to show.
 */
const showPlayed = computed(() => view.value === 'staff' && showStaff.value && !grand.value && !onPads.value && mode.value !== 'listen')
const playedBars = computed(() => (song.value && showPlayed.value
  ? writePlayed(played.value, song.value.bars, song.value.timeSignature, heldUntil.value)
  : null))
const playedMarks = computed(() => (playedBars.value ? markPlayed(written.value, playedBars.value, anyOctave.value) : {}))
/** How often a held note grows on the staff, ms: often enough to see, rare enough not to redraw every frame. */
const HELD_REDRAW_MS = 100
let heldRedrawAt = 0

const endTime = computed(() => {
  const last = fallNotes.value.reduce((end, note) => Math.max(end, note.start + note.length), 0)
  return guided.value && unit.value ? Math.max(unit.value.end, last) : last
})
const pending = computed(() => (mode.value === 'wait' ? steps.value[pendingIndex.value] : steps.value[stepIndexAt(steps.value, player.time.value)]) ?? null)

function applyMode() {
  const current = part.value
  if (!current || !player.loaded.value) return
  // Listening plays the part itself; in the other modes the child plays it.
  player.setChannelMuted(current.channel, mode.value !== 'listen')
  player.setRate(rate.value)
}

function resetTo(time: number) {
  player.seek(time)
  pendingIndex.value = stepIndexAt(steps.value, time)
  pressed = new Set()
  waiting.value = false
}

/**
 * Beat of the count-in shown big, while the song waits. A unit at the very start of the song has no bars before
 * it to lead in with: those beats are counted in with the metronome's clicks, so the child has time to get ready.
 */
const countIn = ref<number | null>(null)
let countTimers: ReturnType<typeof setTimeout>[] = []
let countClicks: AudioScheduledSourceNode[] = []

function stopCountIn() {
  countTimers.forEach(clearTimeout)
  countClicks.forEach((click) => click.stop())
  countTimers = []
  countClicks = []
  countIn.value = null
}

/** Plays from the start of the attempt, counting in first the beats the song has no room for. */
function playWithCountIn() {
  stopCountIn()
  const beatsPerBar = song.value?.timeSignature.numerator ?? 4
  const beat = barLength.value / beatsPerBar
  // One bar at most: 4-3-2-1 once is enough to get ready.
  const missing = Math.min(beatsPerBar, Math.round((leadIn.value - (firstTime.value - startTime.value)) / beat))
  if (missing <= 0) {
    player.play()
    return
  }
  const gap = beat / rate.value
  const audio = metronome.audioContext()
  for (let i = 0; i < missing; i++) {
    const left = missing - i
    countClicks.push(...metronome.clickAt(audio.currentTime + 0.05 + i * gap, left % beatsPerBar === 0 ? 'strong' : 'weak'))
    countTimers.push(setTimeout(() => (countIn.value = (left - 1) % beatsPerBar + 1), 50 + i * gap * 1000))
  }
  countTimers.push(setTimeout(() => {
    countTimers = []
    countClicks = []
    countIn.value = null
    player.play()
  }, 50 + missing * gap * 1000))
}

/** Puts the song at the start of the current unit (or part), paused, with a fresh attempt. */
function prepare() {
  stopCountIn()
  player.pause()
  result.value = null
  presses = []
  waitPresses = []
  played.value = []
  recent.value = []
  applyMode()
  if (player.loaded.value) resetTo(startTime.value)
  const first = steps.value[0]
  if (first) windowStart.value = chooseWindow(rangeStartFor(first.keys[0]!), upcomingKeys(steps.value, first.time))
}

/** A fresh attempt in the current mode; ends a «Послушать» that was paused halfway. */
function startAttempt() {
  listenOnce.value = false
  prepare()
  playWithCountIn()
}

// Load the song once sound is on; the child's keys sound with the part's instrument.
watch([() => synth.status.value, part], async ([status, current]) => {
  if (status !== 'ready' || !current || !record.value || player.loaded.value) return
  await player.load(record.value.data, record.value.fileName)
  synth.setLearnerTarget({ channel: LEARNER_CHANNEL, preset: { bank: 0, program: current.program }, drums: current.isDrum })
  prepare()
}, { immediate: true })

// Turning the teacher off keeps the mode, the speed and the place; the song then plays on to the end.
watch(guided, (on) => {
  const current = unit.value
  const step = rung.value
  if (!on && current && step) {
    freeMode.value = step.mode === 'listen' ? 'wait' : step.mode
    freeRate.value = RATES.find((item) => item === step.rate) ?? freeRate.value
    freeFrom.value = current.start
  }
  prepare()
})
watch(freeMode, () => prepare())
// A new speed applies right away, without starting over.
watch(freeRate, () => applyMode())

/** Advances past every step the presses already cover; resumes the song if it was waiting. */
function tryAdvance(now: number) {
  while (mode.value === 'wait' && pending.value && (waiting.value || now >= pending.value.time - EARLY_S) && coversStep(pending.value, pressed, anyOctave.value)) {
    pendingIndex.value++
    pressed = new Set()
    if (waiting.value) {
      waiting.value = false
      player.play()
    }
  }
}

/** A key press, or a pad hit standing for its note: counts for waiting and scoring. */
function handlePress(key: number, input: TapInput) {
  if (result.value) return
  // The song time the child was hearing when pressing: sound and press are both a little late.
  const now = player.currentTime() - metronome.pressDelay(input) * rate.value
  recent.value = [...recent.value.slice(-5), key]
  if (showPlayed.value) {
    played.value = [...played.value, { key, start: now, end: null, input }]
    heldUntil.value = now
  }
  if (mode.value === 'tempo') {
    presses.push({ key, time: now })
    return
  }
  if (mode.value !== 'wait') return
  const step = pending.value
  if (step && (waiting.value || now >= step.time - EARLY_S)) waitPresses.push({ key, time: now, wrong: isWrongPress(step, key, anyOctave.value) })
  pressed.add(key)
  tryAdvance(now)
}

onEvent((event) => {
  if (onPads.value) {
    // Pad mode: pads play the part's notes; keys still sound but do not count.
    if (event.type !== 'pad') return
    const key = layout.value!.padKeys[event.pad - 1]
    if (key === null || key === undefined) return
    synth.playLearnerNote(key, event.velocity)
    hitPads.value = [...hitPads.value, event.pad]
    setTimeout(() => {
      hitPads.value = hitPads.value.filter((pad) => pad !== event.pad)
    }, 150)
    handlePress(key, tapInputOf(event))
    return
  }
  if (event.type === 'noteOn') handlePress(event.note, tapInputOf(event))
  else if (event.type === 'noteOff') handleRelease(event.note)
})

/** A key let go: its note on the child's staff gets its final length. */
function handleRelease(key: number) {
  let index = played.value.length - 1
  while (index >= 0 && !(played.value[index]!.key === key && played.value[index]!.end === null)) index--
  if (index === -1) return
  const item = played.value[index]!
  const end = player.currentTime() - metronome.pressDelay(item.input) * rate.value
  played.value = played.value.map((entry, i) => (i === index ? { ...entry, end: Math.max(entry.start, end) } : entry))
}

async function finishAttempt() {
  player.pause()
  waiting.value = false
  if (listenOnce.value) {
    listenOnce.value = false
    prepare()
    return
  }
  const attempt = scoreAttempt({
    mode: mode.value,
    steps: steps.value,
    presses,
    waitPresses,
    played: pendingIndex.value,
    rate: rate.value,
    anyOctave: anyOctave.value,
  })
  result.value = attempt
  const current = unit.value
  if (!guided.value || !current || !attempt.passed) return
  const passed = Math.max(passedOf(current), rungIndex.value + 1)
  const row = await progress.saveSongUnit({
    songId,
    channel: part.value!.channel,
    unit: current.id,
    passed,
    stars: starsFor(current, passed),
    bestAccuracy: attempt.accuracy,
  })
  if (row) saved.value = { ...saved.value, [current.id]: row }
  synth.playCue(passed >= current.rungs.length ? 'levelDone' : 'success')
}

// Every frame: move the keyboard window, stop at an unplayed step (wait mode), end the attempt.
let frame = 0
function loop() {
  frame = requestAnimationFrame(loop)
  const current = part.value
  if (!current || !player.loaded.value || result.value) return
  const now = player.currentTime()
  if (played.value.some((item) => item.end === null) && performance.now() - heldRedrawAt > HELD_REDRAW_MS) {
    heldRedrawAt = performance.now()
    heldUntil.value = now
  }
  // Guided: only the unit's notes move the window, not the phrases after it.
  const next = followWindow(windowStart.value, steps.value, now)
  if (next !== windowStart.value) windowStart.value = next
  if (!player.playing.value) return
  if (now >= endTime.value + END_TAIL_S) {
    void finishAttempt()
    return
  }
  if (mode.value !== 'wait' || waiting.value) return
  tryAdvance(now)
  const step = pending.value
  if (step && now >= step.time) {
    player.pause()
    player.seek(step.time, true)
    waiting.value = true
    recent.value = []
  }
}
onMounted(() => {
  frame = requestAnimationFrame(loop)
})
// The metronome clicks on the song's own beats, at its speed, and stays quiet while the song waits.
const metronome = useMetronome()
const metronomeOn = ref(false)
function toggleMetronome() {
  const current = song.value
  metronomeOn.value = !metronomeOn.value && Boolean(current)
  if (!metronomeOn.value || !current) {
    metronome.followSong(null)
    return
  }
  metronome.followSong({
    beats: songBeats(current.bars, current.timeSignature.numerator),
    position: player.currentTime,
    rate: () => player.rate.value,
    playing: () => player.playing.value,
  })
}

onBeforeUnmount(() => {
  stopCountIn()
  metronome.followSong(null)
  cancelAnimationFrame(frame)
  padsPlayMusic.value = false
  player.unload()
})

/**
 * The first tap on a play button also turns the sound on (browsers only start audio from a tap),
 * then runs the button once the song is loaded. No separate «turn the sound on» step.
 */
async function withSound(action: () => void) {
  if (await player.ensureLoaded()) action()
}

function togglePlay() {
  if (player.playing.value || waiting.value || countIn.value !== null) {
    stopCountIn()
    player.pause()
    waiting.value = false
  } else if (result.value || player.time.value >= endTime.value) {
    startAttempt()
  } else if (player.time.value <= startTime.value) {
    playWithCountIn()
  } else {
    player.play()
  }
}

function nextRung() {
  const current = unit.value
  if (!current) return
  if (rungIndex.value + 1 < current.rungs.length) {
    rungIndex.value++
    startAttempt()
    return
  }
  const following = nextUnit(units.value, Object.fromEntries(Object.entries(saved.value).map(([id, row]) => [id, row.passed])))
  if (following) {
    selectUnit(units.value.indexOf(following))
    startAttempt()
  }
}

// The MK4's transport (plan step 26): ■/▶ plays and pauses, Loop and ● start the attempt again.
useMk4Actions({
  playStop: () => void withSound(togglePlay),
  again: () => void withSound(startAttempt),
  record: () => void withSound(startAttempt),
})

function listen() {
  listenOnce.value = true
  prepare()
  player.play()
}

function changeRung(step: number) {
  const current = unit.value
  if (!current) return
  chooseRung(rungIndex.value + step)
}

/** Opens a rung: any passed one, or the next to pass; later rungs open by passing. */
function chooseRung(index: number) {
  const current = unit.value
  if (!current) return
  const next = Math.max(0, Math.min(openRungs(current, passedOf(current)) - 1, index))
  if (next === rungIndex.value) return
  rungIndex.value = next
  prepare()
}

/** Asks first: a reset forgets stars and passed rungs of the unit, or of every unit of the part. */
const resetAsk = ref<'unit' | 'part' | null>(null)
async function confirmReset() {
  const current = unit.value
  const kind = resetAsk.value
  if (!current || !kind || !part.value) return
  const ids = kind === 'unit' ? [current.id] : undefined
  await progress.resetSongUnits(songId, part.value.channel, ids)
  saved.value = ids ? Object.fromEntries(Object.entries(saved.value).filter(([id]) => id !== current.id)) : {}
  resetAsk.value = null
  if (kind === 'part') unitIndex.value = 0
  rungIndex.value = 0
  prepare()
}

function changeFreeRate(step: number) {
  const index = RATES.indexOf(freeRate.value) + step
  if (index >= 0 && index < RATES.length) freeRate.value = RATES[index]!
}

// MK4 pads: practise without touching the screen.
usePadActions({
  next: () => {
    if (result.value) {
      if (result.value.passed && guided.value) nextRung()
      else startAttempt()
    } else if (guided.value) {
      const following = units.value[unitIndex.value + 1]
      if (following) selectUnit(unitIndex.value + 1)
    }
  },
  listen: () => withSound(listen),
  hint: () => withSound(togglePlay),
  skip: () => withSound(startAttempt),
  levelDown: () => (guided.value ? changeRung(-1) : changeFreeRate(-1)),
  levelUp: () => (guided.value ? changeRung(1) : changeFreeRate(1)),
})

/** Moves within the attempt's range, playing on if it played. */
function seekWithin(time: number) {
  const wasPlaying = player.playing.value
  player.pause()
  resetTo(Math.min(endTime.value, Math.max(startTime.value, time)))
  if (wasPlaying) player.play()
}

function seekInRange(event: MouseEvent) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  seekWithin(startTime.value + ((event.clientX - box.left) / box.width) * (endTime.value - startTime.value))
}

/** The MK4 display knob turning the grabbed bar: one click, one bar line back or forward. */
function seekByBar(step: 1 | -1) {
  const bars = song.value?.bars ?? []
  const now = player.time.value
  // A little slack, so a click from a bar line goes to the next one, not to where it is.
  const target = step > 0 ? bars.find((bar) => bar > now + 0.05) : [...bars].reverse().find((bar) => bar < now - 0.05)
  if (target !== undefined) seekWithin(target)
}

const partName = computed(() => {
  const current = part.value
  if (!current) return ''
  // The drum channel's program picks a drum kit, not a GM instrument: name it as drums.
  if (current.isDrum) return t('songs.drums')
  return findName({ bank: 0, program: current.program }, synth.presets.value) ?? t(`sound.groups.${groupOf(current.program)}`)
})
useLastPlace(() => (record.value && partName.value ? `${record.value.name} · ${partName.value}` : null))

const pendingKeys = computed(() => (pending.value && !result.value ? pending.value.keys : []))

/** Notes of the part that are sounding now: their keys stay lit until the note ends, not just until pressed. */
const soundingKeys = computed(() => {
  const now = player.time.value
  const minLength = onPads.value ? PAD_NOTE_MIN_S : 0
  return fallNotes.value.filter((note) => note.start <= now + 0.02 && now < note.start + Math.max(note.length, minLength) - 0.02).map((note) => note.key)
})
/**
 * «Ждать меня»: the song waits at the note, and the key lights up only after the child has had time to
 * find it from the notes, like a teacher who waits before pointing. In tempo there is no time to think,
 * so the keys light up as the notes come.
 */
const keyHint = ref(false)
let keyHintTimer: ReturnType<typeof setTimeout> | undefined
watch([waiting, pendingIndex], () => {
  clearTimeout(keyHintTimer)
  keyHint.value = false
  if (waiting.value) keyHintTimer = setTimeout(() => {
    keyHint.value = true
  }, KEY_HINT_DELAY_MS)
})
onBeforeUnmount(() => clearTimeout(keyHintTimer))
/**
 * The lit keys are the help here: the app's «С подсказкой» switch (plan step 29) turns them on and off. The last
 * rung of a phrase (in tempo, full speed) is its exam: no lit keys, whatever the switch says. «С учителем» is not
 * help but the mode (the ladder or free play), so it stays its own switch.
 */
const exam = computed(() => guided.value && !!unit.value && rungIndex.value === unit.value.rungs.length - 1 && mode.value !== 'listen')
const guideOn = computed(() => progress.guide.value && !exam.value)
const litKeys = computed(() => {
  if (result.value || !guideOn.value) return []
  if (mode.value === 'wait') return waiting.value && keyHint.value ? pendingKeys.value : []
  return [...new Set([...pendingKeys.value, ...soundingKeys.value])]
})

/** What a pad plays: the drum sound, or the note with its Russian name. */
function padLabel(key: number): string {
  return part.value?.isDrum ? t(`drums.${drumKind(key)}`, { n: key }) : withLocal(midiName(key), localName(key, true))
}
const padLabels = computed(() => layout.value?.padKeys.map((key) => (key === null ? null : padLabel(key))) ?? [])
const litPads = computed(() => litKeys.value.map((key) => layout.value?.padOf.get(key)).filter((pad): pad is number => pad !== undefined))

const prompt = computed(() => {
  const step = pending.value
  if (!step || result.value) return null
  const chord = !onPads.value && step.keys.length >= 3 ? identifyChord(step.keys)[0] : undefined
  const notes = onPads.value
    ? step.keys.map((key) => t('songs.padNote', { n: layout.value!.padOf.get(key), sound: padLabel(key) })).join(', ')
    : step.keys.map((key) => withLocal(midiName(key), localName(key, true))).join(', ')
  return {
    notes,
    chord: chord ? t(`lab.type.${chord.type}`, { root: withLocal(noteName(chord.root), localName(chord.root)) }) : null,
    symbol: chord ? chordSymbol(chord.root, chord.type) : null,
  }
})

const hint = computed(() => (waiting.value && pending.value && !anyOctave.value && !onPads.value ? octaveHint(pending.value, recent.value) : null))

const rangeProgress = computed(() => {
  const span = endTime.value - startTime.value
  return span > 0 ? Math.min(100, Math.max(0, ((player.time.value - startTime.value) / span) * 100)) : 0
})

const windowLabel = computed(() => `${midiName(windowStart.value)}–${midiName(windowStart.value + 24)}`)

/** How often a phrase pattern comes back in the part. */
function repeatsOf(item: Unit): number {
  if (item.kind !== 'phrase') return 0
  const group = phrases.value[item.number - 1]?.group
  return phrases.value.filter((phrase) => phrase.group === group).length
}

function unitLabel(item: Unit): string {
  if (item.kind === 'part') return t('songs.unit.part')
  return t(`songs.unit.${item.kind}`, { n: item.number })
}

const rungLabel = (item: { mode: RungMode, rate: number }) => `${t(`songs.rungMode.${item.mode}`)}, ${Math.round(item.rate * 100)}%`
const passedMap = computed<Record<string, number>>(() => Object.fromEntries(Object.entries(saved.value).map(([id, row]) => [id, row.passed])))
const suggestedId = computed(() => nextUnit(units.value, passedMap.value)?.id ?? null)
const unitFinished = computed(() => (unit.value ? passedOf(unit.value) >= unit.value.rungs.length : false))
const hasNextRung = computed(() => (unit.value ? rungIndex.value + 1 < unit.value.rungs.length : false))
const nextUnitName = computed(() => {
  const following = units.value.find((item) => item.id === suggestedId.value)
  return following ? unitLabel(following) : ''
})
const nextLabel = computed(() => {
  if (hasNextRung.value && unit.value) return t('songs.result.nextRung', { rung: rungLabel(unit.value.rungs[rungIndex.value + 1]!) })
  return nextUnitName.value ? t('songs.result.nextUnitNamed', { name: nextUnitName.value }) : t('songs.result.nextUnit')
})
</script>

<template>
  <component :is="embedded ? 'div' : 'main'" class="practice" :class="embedded ? 'practice--embedded' : 'page page--fill'">
    <!-- Inside «Теория» that screen's drawer is the only one: the title goes up there and the controls move into it. -->
    <PageHeader v-if="!embedded" :title="partName || t('songs.title')" :back="backTo" :back-label="t('songs.backToMap')">
      <template #subtitle>
        <p v-if="record" class="text-muted text-sm">{{ record.name }}<template v-if="part">, {{ t('songs.channel', { n: part.channel + 1 }) }}</template></p>
      </template>
    </PageHeader>
    <!-- The switches go into the drawer: this screen's own, or «Теория»'s when the piece is shown inside it. -->
    <Teleport defer to="#page-actions">
      <USwitch v-model="guided" size="lg" :label="t('songs.guided')" />
      <USwitch
        :model-value="guideOn"
        :disabled="exam"
        size="lg"
        :label="exam ? t('train.guideExam') : t('train.guide')"
        @update:model-value="progress.setGuide($event)"
      />
      <USwitch v-if="!onPads" v-model="anyOctave" size="lg" :label="t('songs.anyOctave')" />
      <!-- Tips open on tap: tooltips never show on a touch screen. -->
      <UPopover :content="{ side: 'bottom', align: 'end' }">
        <UButton icon="i-lucide-circle-help" color="neutral" variant="ghost" size="lg" :label="t('songs.tips')" />
        <template #content>
          <div class="tips">
            <p v-if="guided && unit">{{ t(`songs.ladderHint.${unit.kind}`) }}</p>
            <p class="text-muted">{{ onPads ? t('songs.padsPlaying') : guided ? t('songs.padsGuided') : t('songs.padsFree') }}</p>
          </div>
        </template>
      </UPopover>
      <SoundControl :fixed-instrument="partName" :fixed-label="onPads ? t('sound.yourPads', { name: partName }) : undefined" />
    </Teleport>
    <!-- The map goes to the footer; inside «Теория» that screen puts its own there. -->
    <Teleport v-if="!onPads && !embedded" defer to="#footer-tools">
      <OctaveMapButton :window-start="windowStart" />
    </Teleport>

    <UAlert v-if="notFound" class="mt-6" color="warning" variant="subtle" icon="i-lucide-circle-help" :title="t('songs.partNotFound')" />

    <template v-if="part">
      <div class="workspace">
        <aside class="side">
          <UnitList
            v-if="guided"
            :units="units"
            :current="unitIndex"
            :passed="passedMap"
            :suggested-id="suggestedId"
            :label="unitLabel"
            :repeats="repeatsOf"
            @select="selectUnit"
          />

          <div v-if="guided && unit" class="reset">
            <template v-if="resetAsk">
              <p class="text-sm text-toned">{{ resetAsk === 'unit' ? t('songs.resetUnitAsk', { name: unitLabel(unit) }) : t('songs.resetPartAsk') }}</p>
              <div class="flex flex-wrap gap-2">
                <UButton color="neutral" variant="ghost" size="md" :label="t('songs.resetNo')" @click="resetAsk = null" />
                <UButton color="error" variant="soft" size="md" :label="t('songs.resetYes')" @click="confirmReset" />
              </div>
            </template>
            <div v-else class="flex flex-wrap gap-x-3 gap-y-1">
              <UButton icon="i-lucide-rotate-ccw" color="neutral" variant="ghost" size="sm" :disabled="passedOf(unit) === 0" :label="t('songs.resetUnit', { name: unitLabel(unit) })" @click="resetAsk = 'unit'" />
              <UButton color="neutral" variant="ghost" size="sm" :disabled="Object.keys(saved).length === 0" :label="t('songs.resetPart')" @click="resetAsk = 'part'" />
            </div>
          </div>

          <section class="status" aria-live="polite" :data-step-time="pending?.time ?? ''" :data-time="player.time.value" :data-waiting="waiting" :data-result="result ? (result.passed ? 'passed' : 'failed') : ''">
            <template v-if="prompt && !result">
              <p v-if="prompt.symbol" class="status__chord text-highlighted">{{ prompt.symbol }} <span class="text-muted">{{ prompt.chord }}</span></p>
              <p class="status__notes" :class="{ 'status__notes--waiting': waiting }">
                {{ waiting ? t('songs.waitingFor', { notes: prompt.notes }) : t('songs.next', { notes: prompt.notes }) }}
              </p>
            </template>
          </section>
        </aside>
        <div class="main-col">
          <div class="controls">
            <!-- Secondary first; the main action is the last button of the group (owner's rule). -->
            <UButton
              icon="i-lucide-timer"
              :color="metronomeOn ? 'primary' : 'neutral'"
              :variant="metronomeOn ? 'solid' : 'soft'"
              size="lg"
              :aria-pressed="metronomeOn"
              :aria-label="t('songs.metronome')"
              :title="t('songs.metronome')"
              @click="toggleMetronome"
            />
            <UButton icon="i-lucide-ear" color="neutral" variant="soft" size="lg" :label="t('songs.listen')" @click="withSound(listen)" />
            <UButton icon="i-lucide-rotate-ccw" color="neutral" variant="soft" size="lg" :label="t('songs.again')" @click="withSound(startAttempt)" />
            <UButton
              :icon="player.playing.value || waiting || countIn !== null ? 'i-lucide-pause' : 'i-lucide-play'"
              size="lg"
              :loading="synth.status.value === 'loading'"
              :label="player.playing.value || waiting || countIn !== null ? t('songs.pause') : t('songs.play')"
              @click="withSound(togglePlay)"
            />

            <span class="controls__divider" aria-hidden="true" />

            <RungLadder v-if="guided && unit" :unit="unit" :passed="passedOf(unit)" :current="rungIndex" @choose="chooseRung" />
            <span v-if="exam" class="exam">
              <UIcon name="i-lucide-graduation-cap" class="size-5" />
              {{ t('train.exam') }}
            </span>
            <template v-else-if="!guided">
              <div class="segmented" role="radiogroup" :aria-label="t('songs.modeLabel')">
                <button v-for="item in (['wait', 'tempo', 'listen'] as const)" :key="item" type="button" role="radio" class="segment" :class="{ 'segment--on': freeMode === item }" :aria-checked="freeMode === item" @click="freeMode = item">
                  {{ t(`songs.rungMode.${item}`) }}
                </button>
              </div>
              <div class="segmented" role="radiogroup" :aria-label="t('songs.speed')">
                <button v-for="item in RATES" :key="item" type="button" role="radio" class="segment tabular-nums" :class="{ 'segment--on': freeRate === item }" :aria-checked="freeRate === item" @click="freeRate = item">
                  {{ Math.round(item * 100) }}%
                </button>
              </div>
            </template>

            <div v-if="canChooseInput" class="segmented" role="radiogroup" :aria-label="t('songs.inputLabel')">
              <button v-for="item in (['keys', 'pads'] as const)" :key="item" type="button" role="radio" class="segment" :class="{ 'segment--on': inputMode === item }" :aria-checked="inputMode === item" @click="inputMode = item">
                {{ t(`songs.input.${item}`) }}
              </button>
            </div>

          </div>
          <UAlert v-if="part.isDrum && !layout" class="drums-alert mt-3" color="warning" variant="subtle" icon="i-lucide-drum" :title="t('songs.tooManyForPads')" />

          <!-- The bar is thin, the tap area is finger-sized. -->
          <button type="button" class="progress" data-knob-turn :aria-label="t('songs.partPosition')" @click="seekInRange" @knobturn="seekByBar(($event as CustomEvent<1 | -1>).detail)">
            <span class="progress__track">
              <span class="progress__fill" :style="{ width: `${rangeProgress}%` }" />
            </span>
          </button>

          <div class="stage" :class="{ 'stage--pads': onPads }">
            <!-- The octave hint is about the keys, so it shows right above them. -->
            <p v-if="hint && !result && !onPads" class="octave-hint" role="status">
              <UIcon :name="hint === 'up' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'" class="size-4 shrink-0" />
              {{ t(`songs.octave.${hint}`) }}
            </p>
            <span v-if="countIn !== null" class="count-in" aria-live="assertive">{{ countIn }}</span>
            <ResultCard v-if="result" :result="result" :guided="guided" :unit-done="unitFinished && !hasNextRung" :next-label="nextLabel" @next="nextRung" @again="startAttempt" />
            <div class="view-switch segmented" role="radiogroup" :aria-label="t('songs.viewLabel')">
              <button v-for="item in SONG_VIEWS" :key="item" type="button" role="radio" class="segment" :class="{ 'segment--on': view === item }" :aria-checked="view === item" @click="view = item">
                {{ t(`songs.view.${item}`) }}
              </button>
            </div>
            <div v-if="showStaff" class="stage__staff" :class="{ 'stage__staff--alone': !showFall }">
              <SongStaff :bars="written" :clef="clef" :meter="song!.timeSignature" :key-signature="song!.keySignature" :get-time="player.currentTime" :lower="writtenLow" :played="playedBars" :marks="playedMarks" :scale="showFall ? (grand || onPads ? 0.85 : 1.1) : undefined" />
            </div>
            <NoteFall v-if="showFall" class="stage__fall" :class="{ 'stage__fall--short': showStaff, 'stage__fall--shortest': showStaff && (grand || onPads) }" :notes="fallNotes" :start="windowStart" :get-time="player.currentTime" :pending="pendingKeys" :pad-keys="onPads ? layout!.padKeys : undefined" />
            <template v-if="onPads">
              <PadStrip :labels="padLabels" :lit="litPads" :hit="hitPads" @press="pressPad" />
              <p class="window text-muted">{{ t('songs.padsLayout') }}</p>
            </template>
            <template v-else>
              <PianoKeyboard :start="windowStart" :held="heldNotes" :hint="litKeys" @press="pressNote" @release="releaseNote" />
              <p class="window text-muted">{{ t('songs.window', { range: windowLabel }) }}</p>
            </template>
          </div>
        </div>
      </div>
    </template>
  </component>
</template>

<style scoped>
.practice {
  padding: clamp(0.75rem, 3vh, 2rem) clamp(1rem, 2.5vw, 2rem);
}

/* Inside «Теория»: that screen has the frame and the padding; this fills the rest of it. */
.practice--embedded {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  padding: 0;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
}

.segmented {
  display: inline-flex;
  padding: 0.25rem;
  border-radius: 0.75rem;
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
}

.segment {
  min-height: 2.5rem;
  padding: 0 0.875rem;
  border-radius: 0.5rem;
  font-weight: 500;
  color: var(--ui-text-toned);
  transition: background-color 120ms ease, color 120ms ease, transform 100ms ease-out;
}

/* Press feedback on finger down, not on release. */
.segment:active {
  transform: scale(0.96);
}

.segment--on {
  color: var(--color-on-fill);
  background: var(--color-active);
}

.units {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-bottom: 0.25rem;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
}

.controls__divider {
  width: 1px;
  height: 2rem;
  background: var(--ui-border);
}

.tips {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  max-width: 24rem;
  padding: 0.875rem 1rem;
  font-size: 0.875rem;
  line-height: 1.45;
}

.reset {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.progress {
  display: block;
  width: 100%;
  margin-top: 0.375rem;
  padding-block: 0.625rem;
  cursor: pointer;
}

.progress__track {
  position: relative;
  display: block;
  height: 0.5rem;
  border-radius: 999px;
  background: var(--ui-bg-accented);
  overflow: hidden;
}

.progress__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--color-active);
}

/* Under the MK4 knob the bar shows it by its own colours, not a ring: the track light peach, the played part peach.
   Grabbed (Push), the track deepens: turning moves it now. */
.knob-nav .progress:focus-visible,
.progress.knob-grabbed {
  box-shadow: none !important;
}

.knob-nav .progress:focus-visible .progress__track {
  background: color-mix(in oklab, var(--color-focus) 28%, var(--ui-bg-accented));
}

.progress.knob-grabbed .progress__track {
  background: color-mix(in oklab, var(--color-focus) 50%, var(--ui-bg-accented));
}

.knob-nav .progress:focus-visible .progress__fill,
.progress.knob-grabbed .progress__fill {
  background: var(--color-focus);
}

.status {
  padding-block: 0.75rem;
}

.status__chord {
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 700;
}

.status__chord span {
  font-family: var(--font-sans);
  font-size: 1.125rem;
  font-weight: 400;
}

.status__notes {
  font-size: 1.25rem;
  color: var(--ui-text-toned);
}

.status__notes--waiting {
  font-weight: 600;
  color: var(--color-correct);
}

.octave-hint {
  position: absolute;
  z-index: 2;
  /* Above the keys and the range line under them */
  bottom: calc(var(--keys-height) + 2.5rem);
  left: 50%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: max-content;
  max-width: calc(100% - 2rem);
  padding: 0.5rem 1rem;
  border-radius: 999px;
  font-weight: 600;
  color: var(--color-on-fill);
  background: color-mix(in oklab, var(--color-wrong) 88%, var(--color-shade));
  box-shadow: 0 8px 24px -10px var(--shadow-strong);
  transform: translateX(-50%);
}

/*
 * Portrait and phones: the wrappers step aside and the blocks stack in reading order.
 * Tablet landscape: phrases and status move to a right column, the notes get the height.
 */
.workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.side,
.main-col {
  display: contents;
}

.units { order: 1; }
.controls { order: 2; }
.drums-alert { order: 4; }
.progress { order: 5; }
.status { order: 6; }
.stage { order: 7; }
.reset { order: 8; }

@media (min-width: 700px) and (orientation: landscape) {
  /* Exactly the screen height above the footer: the phrase list scrolls inside its column. */
  .practice {
    flex: 1 1 0;
    min-height: 0;
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(15rem, 21vw, 20rem);
    grid-template-rows: minmax(0, 1fr);
    gap: 1.5rem;
  }

  .main-col {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .side {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding-top: 1rem;
  }

  .units {
    order: 2;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    margin-top: 0.5rem;
    padding: 0 0.25rem 0.25rem 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .reset {
    order: 3;
  }

  .status {
    order: 1;
    padding-block: 0 0.75rem;
  }
}

.count-in {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 6rem;
  font-weight: 800;
  color: var(--color-active);
  pointer-events: none;
}

.stage {
  position: relative;
  --keys-height: clamp(8rem, 24vh, 12rem);
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.stage--pads {
  /* Pad squares stay tablet-sized: the board (and the lanes above it) is at most 8 x 6.5rem wide. */
  width: min(100%, 52rem);
  margin-inline: auto;
}

.view-switch {
  position: absolute;
  z-index: 1;
  top: 0.5rem;
  right: 0.5rem;
  box-shadow: 0 4px 14px -6px var(--shadow-soft);
}

.stage__staff {
  padding: 0.5rem 0.75rem 0;
  border-radius: 0.75rem 0.75rem 0 0;
  background: var(--ui-bg-muted);
}

/* Staff alone: it takes the falling notes' place and sits in the middle of it. */
.stage__staff--alone {
  flex: 1;
  display: flex;
  align-items: center;
  min-height: 9rem;
}

.stage__fall {
  flex: 1;
  min-height: 9rem;
  border-radius: 0.75rem 0.75rem 0 0;
  background: var(--ui-bg-muted);
}

.stage__fall--short {
  /* Under the staff in «Оба»: the falling notes may get short on a small tablet. */
  min-height: 5rem;
  border-radius: 0;
}

/* Under a grand staff or above the pad board (taller than the keys) even shorter. */
.stage__fall--shortest {
  min-height: 3rem;
}

.window {
  margin-top: 0.5rem;
  font-size: 0.875rem;
}
</style>
