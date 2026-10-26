<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import NoteFall from '@/components/NoteFall.vue'
import PadStrip from '@/components/PadStrip.vue'
import PianoKeyboard from '@/components/PianoKeyboard.vue'
import SoundControl from '@/components/SoundControl.vue'
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
import {
  buildUnits,
  isWrongPress,
  nextUnit,
  scoreTempo,
  starsFor,
  tempoPasses,
  waitPasses,
  type Press,
  type RungMode,
  type Unit,
} from '@/lib/ladder'
import { drumKind, padLayout } from '@/lib/padLayout'
import { partPhrases, songSections, type Phrase } from '@/lib/phrases'
import { chooseWindow, coversStep, octaveHint, stepIndexAt, upcomingKeys } from '@/lib/practice'
import { parseSong, type Part, type Song } from '@/lib/song'
import { chordSymbol, identifyChord, midiName, noteName } from '@/lib/theory'

/** A press up to this long before a step counts for it, so playing a hair early does not stop the song. */
const EARLY_S = 0.35
/** Lead-in before a unit (bars) and before the whole part in free mode. */
const UNIT_LEAD_IN_BARS = 1
const FREE_LEAD_IN_BARS = 2
/** The attempt ends this long after the unit's last bar, so the last notes ring out. */
const END_TAIL_S = 0.4
const RATES = [0.5, 0.6, 0.7, 0.8, 1] as const

interface AttemptResult {
  passed: boolean
  mode: RungMode
  /** Tempo mode: steps hit; wait mode: wrong presses. */
  hits: number
  mistakes: number
  total: number
  accuracy: number
}

const { t } = useI18n()
useWakeLock()
const route = useRoute()
const progress = useProgress()
const synth = useSynth()
const player = useSongPlayer()
const { heldNotes, onEvent, pressNote, releaseNote, pressPad } = useNoteSource()
const { localName, withLocal } = useNoteNames()

const songId = Number(route.params.id)
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
const result = shallowRef<AttemptResult | null>(null)
/** Keys pressed since the current step became the one to play. */
let pressed = new Set<number>()
let mistakes = 0
let presses: Press[] = []
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
  const channel = Number(route.params.channel)
  const parsed = found ? parseSong(found.data, found.fileName) : null
  const chosen = parsed?.parts.find((item) => item.channel === channel)
  if (!found || !parsed || !chosen) {
    notFound.value = true
    return
  }
  record.value = found
  song.value = parsed
  part.value = chosen
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
const startTime = computed(() => {
  const first = guided.value ? (unit.value?.start ?? 0) : (steps.value[0]?.time ?? 0)
  return Math.max(0, first - barLength.value * (guided.value ? UNIT_LEAD_IN_BARS : FREE_LEAD_IN_BARS))
})
const endTime = computed(() => {
  if (guided.value && unit.value) return unit.value.end
  return (part.value?.notes ?? []).reduce((end, note) => Math.max(end, note.start + note.length), 0)
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

/** Puts the song at the start of the current unit (or part), paused, with a fresh attempt. */
function prepare() {
  player.pause()
  result.value = null
  mistakes = 0
  presses = []
  recent.value = []
  applyMode()
  if (player.loaded.value) resetTo(startTime.value)
  const first = steps.value[0]
  if (first) windowStart.value = chooseWindow(rangeStartFor(first.keys[0]!), upcomingKeys(steps.value, first.time))
}

function startAttempt() {
  prepare()
  player.play()
}

// Load the song once sound is on; the child's keys sound with the part's instrument.
watch([() => synth.status.value, part], async ([status, current]) => {
  if (status !== 'ready' || !current || !record.value || player.loaded.value) return
  await player.load(record.value.data, record.value.fileName)
  synth.setLearnerTarget({ channel: LEARNER_CHANNEL, preset: { bank: 0, program: current.program }, drums: current.isDrum })
  prepare()
}, { immediate: true })

watch([guided, freeMode, freeRate], () => prepare())

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
function handlePress(key: number) {
  if (result.value) return
  const now = player.currentTime()
  recent.value = [...recent.value.slice(-5), key]
  if (mode.value === 'tempo') {
    presses.push({ key, time: now })
    return
  }
  if (mode.value !== 'wait') return
  const step = pending.value
  if (step && (waiting.value || now >= step.time - EARLY_S) && isWrongPress(step, key, anyOctave.value)) mistakes++
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
    handlePress(key)
    return
  }
  if (event.type === 'noteOn') handlePress(event.note)
})

async function finishAttempt() {
  player.pause()
  waiting.value = false
  if (listenOnce.value) {
    listenOnce.value = false
    prepare()
    return
  }
  const total = steps.value.length
  let attempt: AttemptResult
  if (mode.value === 'tempo') {
    const score = scoreTempo(steps.value, presses, rate.value, anyOctave.value)
    attempt = { passed: tempoPasses(score), mode: 'tempo', hits: score.hits, mistakes: 0, total, accuracy: score.accuracy }
  } else if (mode.value === 'wait') {
    const finished = pendingIndex.value >= total
    attempt = { passed: finished && waitPasses(total, mistakes), mode: 'wait', hits: pendingIndex.value, mistakes, total, accuracy: 0 }
  } else {
    attempt = { passed: true, mode: 'listen', hits: 0, mistakes: 0, total, accuracy: 0 }
  }
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
  const next = chooseWindow(windowStart.value, upcomingKeys(current.steps, now))
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
    player.seek(step.time)
    waiting.value = true
    recent.value = []
  }
}
onMounted(() => {
  frame = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  padsPlayMusic.value = false
  player.unload()
})

function togglePlay() {
  if (player.playing.value || waiting.value) {
    player.pause()
    waiting.value = false
  } else if (result.value || player.time.value >= endTime.value) {
    startAttempt()
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

function listen() {
  listenOnce.value = true
  startAttempt()
}

function changeRung(step: number) {
  const current = unit.value
  if (!current) return
  // Only rungs already reached: the next one opens by passing the current one.
  const highest = Math.min(passedOf(current), current.rungs.length - 1)
  const next = Math.max(0, Math.min(highest, rungIndex.value + step))
  if (next === rungIndex.value) return
  rungIndex.value = next
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
  listen,
  hint: togglePlay,
  skip: startAttempt,
  levelDown: () => (guided.value ? changeRung(-1) : changeFreeRate(-1)),
  levelUp: () => (guided.value ? changeRung(1) : changeFreeRate(1)),
})

function seekInRange(event: MouseEvent) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const span = endTime.value - startTime.value
  const time = startTime.value + ((event.clientX - box.left) / box.width) * span
  const wasPlaying = player.playing.value
  player.pause()
  resetTo(time)
  if (wasPlaying) player.play()
}

const partName = computed(() => {
  const current = part.value
  if (!current) return ''
  // The drum channel's program picks a drum kit, not a GM instrument: name it as drums.
  if (current.isDrum) return t('songs.drums')
  return findName({ bank: 0, program: current.program }, synth.presets.value) ?? t(`sound.groups.${groupOf(current.program)}`)
})

const pendingKeys = computed(() => (pending.value && !result.value ? pending.value.keys : []))

/** Notes of the part that are sounding now: their keys stay lit until the note ends, not just until pressed. */
const soundingKeys = computed(() => {
  const now = player.time.value
  return (part.value?.notes ?? []).filter((note) => note.start <= now + 0.02 && now < note.start + note.length - 0.02).map((note) => note.key)
})
const litKeys = computed(() => (result.value ? [] : [...new Set([...pendingKeys.value, ...soundingKeys.value])]))

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
const suggestedId = computed(() => nextUnit(units.value, Object.fromEntries(Object.entries(saved.value).map(([id, row]) => [id, row.passed])))?.id ?? null)
const unitFinished = computed(() => (unit.value ? passedOf(unit.value) >= unit.value.rungs.length : false))
const hasNextRung = computed(() => (unit.value ? rungIndex.value + 1 < unit.value.rungs.length : false))
</script>

<template>
  <main class="practice">
    <header class="flex flex-wrap items-center gap-3 -ml-3">
      <UButton :to="`/songs/${route.params.id}`" icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="xl" :aria-label="t('songs.backToMap')" />
      <div class="min-w-0">
        <h1 class="title text-highlighted">{{ partName || t('songs.title') }}</h1>
        <p v-if="record" class="text-muted text-sm">{{ record.name }}<template v-if="part">, {{ t('songs.channel', { n: part.channel + 1 }) }}</template></p>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-3">
        <USwitch v-model="guided" size="lg" :label="t('songs.guided')" />
        <SoundControl :fixed-instrument="partName" :fixed-label="onPads ? t('sound.yourPads', { name: partName }) : undefined" />
      </div>
    </header>

    <UAlert v-if="notFound" class="mt-6" color="warning" variant="subtle" icon="i-lucide-circle-help" :title="t('songs.partNotFound')" />

    <template v-if="part">
      <nav v-if="guided" class="units" :aria-label="t('songs.unitsLabel')">
        <button
          v-for="(item, index) in units"
          :key="item.id"
          type="button"
          class="unit"
          :class="{ 'unit--current': index === unitIndex, 'unit--done': passedOf(item) >= item.rungs.length, 'unit--next': item.id === suggestedId && index !== unitIndex }"
          :aria-current="index === unitIndex"
          @click="selectUnit(index)"
        >
          <span class="unit__name">{{ unitLabel(item) }}</span>
          <span class="unit__meta">
            <span class="unit__stars" :aria-label="t('train.stars', { n: starsFor(item, passedOf(item)) })">{{ '★'.repeat(starsFor(item, passedOf(item))) }}{{ '☆'.repeat(3 - starsFor(item, passedOf(item))) }}</span>
            <template v-if="repeatsOf(item) > 1"> {{ t('songs.repeats', { n: repeatsOf(item) }) }}</template>
          </span>
        </button>
      </nav>

      <div class="controls">
        <UButton
          :icon="player.playing.value || waiting ? 'i-lucide-pause' : 'i-lucide-play'"
          size="xl"
          :disabled="!player.loaded.value"
          :label="player.playing.value || waiting ? t('songs.pause') : t('songs.play')"
          @click="togglePlay"
        >
          <template #trailing>
            <UKbd value="3" size="md" />
          </template>
        </UButton>
        <UButton icon="i-lucide-rotate-ccw" color="neutral" variant="soft" size="xl" :disabled="!player.loaded.value" :label="t('songs.again')" @click="startAttempt">
          <template #trailing>
            <UKbd value="4" size="md" />
          </template>
        </UButton>
        <UButton icon="i-lucide-ear" color="neutral" variant="soft" size="xl" :disabled="!player.loaded.value" :label="t('songs.listen')" @click="listen">
          <template #trailing>
            <UKbd value="2" size="md" />
          </template>
        </UButton>

        <template v-if="guided && unit && rung">
          <ol class="rungs" :aria-label="t('songs.rungsLabel')">
            <li
              v-for="(item, index) in unit.rungs"
              :key="index"
              class="rung"
              :class="{ 'rung--done': index < passedOf(unit), 'rung--current': index === rungIndex }"
              :title="rungLabel(item)"
            />
          </ol>
          <span class="rung-label text-highlighted">{{ t('songs.rungOf', { n: rungIndex + 1, total: unit.rungs.length }) }}: {{ rungLabel(rung) }}</span>
        </template>
        <template v-else>
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

        <div v-if="canChooseInput" class="segmented ml-auto" role="radiogroup" :aria-label="t('songs.inputLabel')">
          <button v-for="item in (['keys', 'pads'] as const)" :key="item" type="button" role="radio" class="segment" :class="{ 'segment--on': inputMode === item }" :aria-checked="inputMode === item" @click="inputMode = item">
            {{ t(`songs.input.${item}`) }}
          </button>
        </div>
        <USwitch v-if="!onPads" v-model="anyOctave" size="lg" :label="t('songs.anyOctave')" :class="{ 'ml-auto': !canChooseInput }" />
      </div>

      <p class="pads-hint text-dimmed">{{ onPads ? t('songs.padsPlaying') : guided ? t('songs.padsGuided') : t('songs.padsFree') }}</p>
      <UAlert v-if="part.isDrum && !layout" class="mt-3" color="warning" variant="subtle" icon="i-lucide-drum" :title="t('songs.tooManyForPads')" />

      <div class="progress" :aria-label="t('songs.partPosition')" @click="seekInRange">
        <span class="progress__fill" :style="{ width: `${rangeProgress}%` }" />
      </div>

      <section class="status" aria-live="polite" :data-step-time="pending?.time ?? ''" :data-time="player.time.value" :data-waiting="waiting" :data-result="result ? (result.passed ? 'passed' : 'failed') : ''">
        <p v-if="!player.loaded.value" class="text-muted">{{ t('songs.needSound') }}</p>
        <UAlert
          v-else-if="result"
          :color="result.passed ? 'success' : 'warning'"
          variant="subtle"
          :icon="result.passed ? 'i-lucide-circle-check' : 'i-lucide-rotate-ccw'"
          class="result"
          :title="result.passed ? (guided && unitFinished && !hasNextRung ? t('songs.result.unitDone') : t('songs.result.passed')) : t('songs.result.again')"
          :description="result.mode === 'tempo'
            ? t('songs.result.tempo', { hits: result.hits, total: result.total, need: Math.ceil(result.total * 0.8) })
            : result.mode === 'wait' ? (result.mistakes ? t('songs.result.wait', { mistakes: result.mistakes }) : t('songs.result.waitClean')) : t('songs.result.listen')"
          :actions="result.passed && guided
            ? [
              { label: hasNextRung ? t('songs.result.nextRung', { rung: rungLabel(unit!.rungs[rungIndex + 1]!) }) : t('songs.result.nextUnit'), icon: 'i-lucide-arrow-right', size: 'lg', onClick: nextRung },
              { label: t('songs.again'), color: 'neutral', variant: 'soft', size: 'lg', onClick: startAttempt },
            ]
            : [{ label: t('songs.again'), icon: 'i-lucide-rotate-ccw', size: 'lg', onClick: startAttempt }]"
        />
        <template v-else-if="prompt">
          <p v-if="prompt.symbol" class="status__chord text-highlighted">{{ prompt.symbol }} <span class="text-muted">{{ prompt.chord }}</span></p>
          <p class="status__notes" :class="{ 'status__notes--waiting': waiting }">
            {{ waiting ? t('songs.waitingFor', { notes: prompt.notes }) : t('songs.next', { notes: prompt.notes }) }}
          </p>
        </template>
        <p v-if="hint" class="status__hint">{{ t(`songs.octave.${hint}`) }}</p>
      </section>

      <div class="stage" :class="{ 'stage--pads': onPads }">
        <NoteFall class="stage__fall" :notes="part.notes" :start="windowStart" :get-time="player.currentTime" :pending="pendingKeys" :pad-keys="onPads ? layout!.padKeys : undefined" />
        <template v-if="onPads">
          <PadStrip :labels="padLabels" :lit="litPads" :hit="hitPads" @press="pressPad" />
          <p class="window text-muted">{{ t('songs.padsLayout') }}</p>
        </template>
        <template v-else>
          <PianoKeyboard :start="windowStart" :held="heldNotes" :hint="litKeys" @press="pressNote" @release="releaseNote" />
          <p class="window text-muted">{{ t('songs.window', { range: windowLabel }) }}</p>
        </template>
      </div>
    </template>
  </main>
</template>

<style scoped>
.practice {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  max-width: 80rem;
  margin: 0 auto;
  padding: clamp(1rem, 2.5vw, 2rem);
}

.title {
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 700;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
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
  transition: background-color 120ms ease, color 120ms ease;
}

.segment--on {
  color: #fff;
  background: var(--color-pad-sky);
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

.unit {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
  min-width: 7rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  text-align: left;
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
  transition: background-color 120ms ease;
}

.unit__name {
  font-weight: 600;
  color: var(--ui-text-highlighted);
}

.unit__meta {
  font-size: 0.8125rem;
  color: var(--ui-text-muted);
}

.unit__stars {
  color: var(--color-pad-sun);
}

.unit--current {
  box-shadow: 0 0 0 2px var(--color-pad-sky) inset;
}

.unit--next {
  box-shadow: 0 0 0 2px var(--color-pad-aqua) inset;
}

.unit--done .unit__name {
  color: var(--ui-text-toned);
}

.rungs {
  display: flex;
  gap: 0.375rem;
}

.rung {
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 50%;
  background: var(--ui-bg-accented);
  box-shadow: 0 0 0 1px var(--ui-border-accented) inset;
}

.rung--done {
  background: var(--color-pad-aqua);
  box-shadow: none;
}

.rung--current {
  box-shadow: 0 0 0 3px var(--color-pad-sky);
}

.rung-label {
  font-weight: 600;
}

.pads-hint {
  margin-top: 0.5rem;
  font-size: 0.8125rem;
}

.progress {
  position: relative;
  height: 0.5rem;
  margin-top: 1rem;
  border-radius: 999px;
  background: var(--ui-bg-accented);
  cursor: pointer;
  overflow: hidden;
}

.progress__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--color-pad-sky);
}

.status {
  min-height: 5.5rem;
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
  color: var(--color-pad-aqua);
}

.status__hint {
  margin-top: 0.25rem;
  font-weight: 500;
  color: color-mix(in oklab, var(--color-pad-tomato) 85%, var(--ui-text));
}

.stage {
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

.stage__fall {
  flex: 1;
  min-height: 9rem;
  border-radius: 0.75rem 0.75rem 0 0;
  background: var(--ui-bg-muted);
}

.window {
  margin-top: 0.5rem;
  font-size: 0.875rem;
}
</style>
