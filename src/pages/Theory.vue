<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MidiStatus from '@/components/MidiStatus.vue'
import PageHeader from '@/components/PageHeader.vue'
import RhythmStaff from '@/components/RhythmStaff.vue'
import { useMetronome } from '@/composables/useMetronome'
import { useNoteSource } from '@/composables/useNoteSource'
import { padsPlayMusic, usePadActions } from '@/composables/usePadActions'
import { useProgress } from '@/composables/useProgress'
import { useRhythmPlayer } from '@/composables/useRhythmPlayer'
import { useSynth } from '@/composables/useSynth'
import { useWakeLock } from '@/composables/useWakeLock'
import { tapInputOf, type TapInput } from '@/lib/metronome'
import { barQuarters, noteQuarters, scoreRhythm, sounds, type Duration, type Rhythm, type RhythmPress, type RhythmScore, type TimingVerdict } from '@/lib/rhythm'
import {
  RHYTHM_LEVELS,
  RHYTHM_TEMPOS,
  currentLevel,
  hintsFor,
  isOpen,
  makeTask,
  passes,
  rhythmLevel,
  starsOf,
  tempoOf,
  type RhythmHint,
} from '@/lib/rhythmLevels'

// «Теория» (plan step 17): the course from the video, section by section. First section: «Ритм».
// Each task: listen if you like → one bar of count-in → play along on any key, pad 1 or the screen →
// the notes turn green, yellow or red, and one or two words on what to fix → again or next.

const { t } = useI18n()
useWakeLock()
const progress = useProgress()
const metronome = useMetronome()
const player = useRhythmPlayer()
const { onEvent } = useNoteSource()

const SECTIONS = ['rhythm', 'notes', 'accidentals', 'intervals', 'scales', 'functions', 'sevenths'] as const
/** Seconds after the last note before the attempt is scored: a late last tap still counts. */
const SCORE_TAIL_MS = 400

type Phase = 'intro' | 'ready' | 'playing' | 'result'

const passed = computed(() => progress.rhythmProgress.value)
const level = ref(currentLevel(passed.value))
// The saved progress arrives a moment after the page: open on the child's level then.
watch(() => progress.ready.value, () => {
  level.value = currentLevel(passed.value)
})
const info = computed(() => rhythmLevel(level.value))
const levelPasses = computed(() => passed.value[level.value]?.passes ?? 0)
const bpm = computed(() => tempoOf(levelPasses.value))
const stars = computed(() => starsOf(levelPasses.value))

/** Tasks alternate: read the notes, then hear and repeat (the notes show after the attempt). */
const taskNumber = ref(0)
const kind = computed<'read' | 'repeat'>(() => (taskNumber.value % 2 === 0 ? 'read' : 'repeat'))
const task = shallowRef<Rhythm>(makeTask(info.value))
/** New values are shown once per visit before the first task of a level. */
const introSeen = ref(new Set<number>())
const phase = ref<Phase>(info.value.introduces.length ? 'intro' : 'ready')
const score = shallowRef<RhythmScore | null>(null)
const hints = ref<RhythmHint[]>([])
const attemptPassed = ref(false)
/** Just earned the last star of the level. */
const levelDone = ref(false)
/** This rhythm was already passed: playing it again is fine, but it counts once («3 rhythms per tempo»). */
let taskCounted = false

let presses: (RhythmPress & { input: TapInput })[] = []
let attemptTimer: ReturnType<typeof setTimeout> | undefined

function openLevel(id: number) {
  if (!isOpen(id, passed.value)) return
  stopAttempt()
  level.value = id
}

watch(level, () => {
  levelDone.value = false
  taskNumber.value = 0
  newTask()
})

function newTask() {
  stopAttempt()
  task.value = makeTask(info.value)
  taskCounted = false
  score.value = null
  hints.value = []
  phase.value = info.value.introduces.length && !introSeen.value.has(level.value) ? 'intro' : 'ready'
}

function nextTask() {
  taskNumber.value++
  newTask()
}

function closeIntro() {
  introSeen.value = new Set([...introSeen.value, level.value])
  phase.value = 'ready'
}

function stopAttempt() {
  clearTimeout(attemptTimer)
  player.stop()
  padsPlayMusic.value = false
  if (phase.value === 'playing') phase.value = 'ready'
}

/** «Послушать»: the rhythm with its notes, after the count-in. */
function listen() {
  if (phase.value === 'playing') return
  player.play(task.value, bpm.value)
}

/** «Играть»: count-in and clicks; the child plays the notes. */
function startAttempt() {
  if (phase.value === 'intro') closeIntro()
  stopAttempt()
  presses = []
  score.value = null
  hints.value = []
  phase.value = 'playing'
  // Pad 1 is a drum now, not «дальше».
  padsPlayMusic.value = true
  player.play(task.value, bpm.value, { notes: false })
}

watch(() => player.playing.value, (on) => {
  if (on || phase.value !== 'playing') return
  attemptTimer = setTimeout(finishAttempt, SCORE_TAIL_MS)
})

async function finishAttempt() {
  padsPlayMusic.value = false
  // Hold is checked only when every press came with a release (keys and the screen, not pads).
  const checkHold = presses.length > 0 && presses.every((press) => press.end !== null)
  const result = scoreRhythm(sounds(task.value, bpm.value), presses, checkHold)
  score.value = result
  hints.value = hintsFor(result)
  attemptPassed.value = passes(result)
  phase.value = 'result'
  if (!attemptPassed.value || taskCounted) return
  taskCounted = true
  const before = starsOf(levelPasses.value)
  await progress.addRhythmPass(level.value)
  levelDone.value = before < RHYTHM_TEMPOS.length && starsOf(levelPasses.value) === RHYTHM_TEMPOS.length
}

/** Where the press lands in the rhythm, as heard: the input's own delay taken off. */
function pressTime(input: TapInput) {
  return player.heardPosition() - metronome.latency.value[input] / 1000
}

function press(input: TapInput) {
  if (phase.value !== 'playing') return
  presses.push({ time: pressTime(input), end: null, input })
  // Keys sound through the synth when it is on; everything else gets a soft tick, so a tap is heard.
  if (input !== 'midi' && input !== 'keys') metronome.noteAt(metronome.audioContext().currentTime, 0.12)
  else if (useSynth().status.value !== 'ready') metronome.noteAt(metronome.audioContext().currentTime, 0.12)
}

function release(input: TapInput) {
  if (phase.value !== 'playing') return
  for (let i = presses.length - 1; i >= 0; i--) {
    const item = presses[i]!
    if (item.input === input && item.end === null) {
      presses[i] = { ...item, end: Math.max(item.time, pressTime(input)) }
      return
    }
  }
}

onEvent((event) => {
  if (event.type === 'noteOn') press(tapInputOf(event))
  else if (event.type === 'noteOff') release(event.source === 'midi' ? 'midi' : 'keys')
  // Pad 1 is the drum; pads have no length, so a pad press never gets a release and is not checked for hold.
  else if (event.type === 'pad' && event.pad === 1) press(tapInputOf(event))
})

usePadActions({
  next: () => {
    if (phase.value === 'ready' || phase.value === 'intro') startAttempt()
    else if (phase.value === 'result') {
      if (attemptPassed.value) nextTask()
      else startAttempt()
    }
  },
  listen: () => listen(),
  skip: () => nextTask(),
  levelDown: () => openLevel(level.value - 1),
  levelUp: () => openLevel(level.value + 1),
})

onBeforeUnmount(() => stopAttempt())

/** Colour of each note after an attempt. */
const marks = computed<Record<number, TimingVerdict>>(() => Object.fromEntries((score.value?.results ?? []).map((result) => [result.index, result.verdict])))
const showNotes = computed(() => kind.value === 'read' || phase.value === 'result')
/** Count-in beat shown big while the child waits for the first note. */
const countIn = ref<number | null>(null)
let countFrame = 0
function followCountIn() {
  const position = player.heardPosition()
  const beat = 60 / bpm.value
  const beats = info.value.meter.numerator
  countIn.value = phase.value === 'playing' && position < 0 ? beats - Math.floor(-position / beat) : null
  countFrame = requestAnimationFrame(followCountIn)
}
countFrame = requestAnimationFrame(followCountIn)
onBeforeUnmount(() => cancelAnimationFrame(countFrame))

/** The intro: one bar of each new value, to look at and listen to. */
const introRhythms = computed(() => info.value.introduces.map((duration: Duration) => {
  const count = Math.round(barQuarters(info.value.meter) / noteQuarters({ duration }))
  return { duration, rhythm: { meter: info.value.meter, notes: Array.from({ length: count }, () => ({ duration })) } satisfies Rhythm }
}))
const levelTabs = computed(() => RHYTHM_LEVELS.map((item) => ({ id: item.id, open: isOpen(item.id, passed.value), stars: starsOf(passed.value[item.id]?.passes ?? 0), soon: item.soon })))
</script>

<template>
  <main class="page page--fill theory">
    <PageHeader :title="t('theory.title')" back="/train" :back-label="t('train.title')">
      <MidiStatus />
    </PageHeader>

    <div class="sections" role="tablist" :aria-label="t('theory.sectionsLabel')">
      <button v-for="(section, i) in SECTIONS" :key="section" type="button" role="tab" class="section" :class="{ 'section--on': i === 0 }" :aria-selected="i === 0" :disabled="i !== 0">
        <UIcon v-if="i !== 0" name="i-lucide-lock" class="size-3.5" />
        {{ t(`theory.sections.${section}`) }}
      </button>
    </div>

    <div class="levels-row">
      <div class="levels" role="tablist" :aria-label="t('theory.levelsLabel')">
        <button
          v-for="tab in levelTabs"
          :key="tab.id"
          type="button"
          role="tab"
          class="level"
          :class="{ 'level--on': tab.id === level, 'level--done': tab.stars === 3 }"
          :aria-selected="tab.id === level"
          :disabled="!tab.open"
          @click="openLevel(tab.id)"
        >
          <span>Р{{ tab.id }}</span>
          <UIcon v-if="!tab.open" name="i-lucide-lock" class="size-3" />
        </button>
      </div>
      <span class="stars" :aria-label="t('train.stars', { n: stars })">{{ '★'.repeat(stars) }}<span class="stars__off">{{ '★'.repeat(3 - stars) }}</span></span>
      <span class="text-muted tabular-nums">{{ t('theory.tempo', { bpm }) }}</span>
    </div>

    <section class="task">
      <template v-if="phase === 'intro'">
        <p class="prompt text-highlighted">{{ t('theory.intro.title') }}</p>
        <div class="intro">
          <div v-for="item in introRhythms" :key="item.duration" class="intro__item">
            <RhythmStaff :rhythm="item.rhythm" />
            <p class="text-toned">{{ t(`theory.intro.${item.duration}`) }}</p>
            <UButton icon="i-lucide-ear" color="neutral" variant="soft" size="md" class="self-start" :label="t('theory.listen')" @click="player.play(item.rhythm, bpm)" />
          </div>
        </div>
      </template>
      <template v-else>
        <p class="prompt text-highlighted">{{ t(`theory.kind.${kind}`) }}</p>
        <div class="staff-box">
          <RhythmStaff v-if="showNotes" :scale="2.2" :rhythm="task" :current="phase === 'playing' && kind === 'read' ? player.current.value : null" :marks="phase === 'result' ? marks : undefined" />
          <p v-else class="hidden-notes text-muted">{{ t('theory.hiddenNotes') }}</p>
          <span v-if="countIn !== null" class="count-in" aria-live="assertive">{{ countIn }}</span>
        </div>
      </template>

      <div v-if="phase === 'result' && score" class="result" :class="attemptPassed ? 'result--passed' : 'result--again'" role="status">
        <p class="result__title">{{ levelDone ? t('theory.levelDone', { n: level }) : attemptPassed ? t('theory.passed') : t('theory.again') }}</p>
        <p class="text-toned">
          <template v-for="hint in hints" :key="hint">{{ t(`theory.hints.${hint}`) }} </template>
        </p>
      </div>
    </section>

    <div class="controls">
      <UButton v-if="phase === 'intro'" icon="i-lucide-check" size="xl" :label="t('theory.intro.ok')" @click="closeIntro" />
      <template v-else>
        <template v-if="phase === 'result' && attemptPassed">
          <UButton v-if="levelDone && isOpen(level + 1, passed)" icon="i-lucide-arrow-right" size="xl" :label="t('theory.nextLevel')" @click="openLevel(level + 1)" />
          <UButton v-else icon="i-lucide-arrow-right" size="xl" :label="t('theory.next')" @click="nextTask" />
          <UButton icon="i-lucide-rotate-ccw" color="neutral" variant="soft" size="xl" :label="t('theory.again')" @click="startAttempt" />
        </template>
        <UButton
          v-else
          :icon="phase === 'playing' ? 'i-lucide-square' : 'i-lucide-play'"
          size="xl"
          :label="phase === 'playing' ? t('theory.stop') : phase === 'result' ? t('theory.again') : t('theory.play')"
          @click="phase === 'playing' ? stopAttempt() : startAttempt()"
        />
        <UButton icon="i-lucide-ear" color="neutral" variant="soft" size="xl" :disabled="phase === 'playing'" :label="phase === 'result' ? t('theory.listenRight') : t('theory.listen')" @click="listen" />
        <UButton icon="i-lucide-shuffle" color="neutral" variant="ghost" size="xl" :label="t('theory.other')" @click="nextTask" />

        <!-- For playing without the MK4: a big pad on the screen. -->
        <button
          type="button"
          class="tap"
          :class="{ 'tap--live': phase === 'playing' }"
          :aria-label="t('theory.tap')"
          @pointerdown.prevent="press('screen')"
          @pointerup.prevent="release('screen')"
          @pointercancel="release('screen')"
        >
          {{ t('theory.tap') }}
        </button>
      </template>
    </div>
  </main>
</template>

<style scoped>
.sections,
.levels {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.sections {
  margin-top: 0.75rem;
}

.section,
.level {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 2.5rem;
  padding: 0 0.875rem;
  border-radius: 0.625rem;
  font-weight: 600;
  color: var(--ui-text-toned);
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
  transition: background-color 120ms ease, transform 100ms ease-out;
}

.section:active:not(:disabled),
.level:active:not(:disabled) {
  transform: scale(0.96);
}

.section:disabled,
.level:disabled {
  opacity: 0.5;
}

.section--on,
.level--on {
  color: #fff;
  background: var(--color-pad-sky);
  box-shadow: none;
}

.level--done:not(.level--on) {
  box-shadow: 0 0 0 2px var(--color-pad-aqua) inset;
}

.levels-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  margin-top: 0.75rem;
}

.stars {
  font-size: 1.5rem;
  letter-spacing: 0.1em;
  color: var(--color-pad-sun);
}

.stars__off {
  color: var(--star-off);
}

.task {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.75rem;
  min-height: 0;
  margin-top: 1rem;
  padding: 1rem 1.25rem;
  border-radius: 1rem;
  background: var(--ui-bg-muted);
}

.prompt {
  font-family: var(--font-display);
  font-size: clamp(1.25rem, 2.4vw, 1.75rem);
  font-weight: 700;
}

.staff-box {
  position: relative;
  min-height: 8rem;
  display: flex;
  align-items: center;
}

.hidden-notes {
  width: 100%;
  text-align: center;
  font-size: 1.125rem;
}

.count-in {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 5rem;
  font-weight: 800;
  color: var(--color-pad-sky);
  pointer-events: none;
}

.intro {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 1rem;
}

.intro__item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.result {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  max-width: min(28rem, calc(100% - 1.5rem));
  padding: 0.75rem 1rem;
  border-radius: 0.875rem;
  background: var(--ui-bg-elevated);
  box-shadow: 0 12px 32px -12px rgb(0 0 0 / 0.35);
}

.result--passed {
  box-shadow: 0 0 0 2px var(--color-pad-aqua) inset, 0 12px 32px -12px rgb(0 0 0 / 0.35);
}

.result--again {
  box-shadow: 0 0 0 2px var(--color-pad-sun) inset, 0 12px 32px -12px rgb(0 0 0 / 0.35);
}

.result__title {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ui-text-highlighted);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1rem;
}

.tap {
  margin-left: auto;
  min-width: 10rem;
  min-height: 4rem;
  padding: 0 1.5rem;
  border-radius: 1rem;
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ui-text-toned);
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset, 0 5px 0 var(--ui-border);
  transition: transform 60ms ease-out, box-shadow 60ms ease-out;
}

.tap--live {
  color: #fff;
  background: var(--color-pad-sky);
  box-shadow: 0 5px 0 color-mix(in oklab, var(--color-pad-sky) 55%, #000);
}

.tap:active {
  transform: translateY(4px);
  box-shadow: 0 1px 0 var(--ui-border);
}
</style>
