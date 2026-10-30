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
import { quarterSeconds, scoreRhythm, sounds, type Rhythm, type RhythmPress, type RhythmScore, type TimingVerdict } from '@/lib/rhythm'
import {
  RHYTHM_LEVELS,
  RHYTHM_TEMPOS,
  currentLevel,
  hintsFor,
  isOpen,
  makeTask,
  passes,
  rhythmLevel,
  handSplit,
  makeTwoHands,
  padHand,
  slowTempo,
  starsOf,
  tempoOf,
  troubleNotes,
  troubleSpot,
  introRhythm,
  levelTempo,
  type Hand,
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
// A two-hand task is in 2/4, counted in quarters: it keeps the plain tempo steps, not the doubled 6/8 ones.
const levelBpm = computed(() => (kind.value === 'twoHands' ? tempoOf(levelPasses.value) : levelTempo(info.value, levelPasses.value)))
/** «Медленнее»: one practice attempt at three quarters of the tempo; it is not counted for stars. */
const slow = ref(false)
const bpm = computed(() => (slow.value ? slowTempo(levelBpm.value) : levelBpm.value))
/** Wrong notes of each failed attempt of this task, to spot a hard place. */
let troubleHistory: number[][] = []
const offerSlow = ref(false)
/** The last attempt was the slow practice. */
const wasSlowAttempt = ref(false)
const stars = computed(() => starsOf(levelPasses.value))

/** Tasks alternate: read the notes, then hear and repeat (the notes show after the attempt). */
const taskNumber = ref(0)
/** Р10 adds a third kind: both hands, «2 против 3», every third task. */
const kind = computed<'read' | 'repeat' | 'twoHands'>(() => {
  if (info.value.twoHands && taskNumber.value % 3 === 2) return 'twoHands'
  return taskNumber.value % 2 === 0 ? 'read' : 'repeat'
})
const task = shallowRef<Rhythm>(makeTask(info.value))
/** The left hand of a two-hand task; null otherwise. */
const lowerTask = shallowRef<Rhythm | null>(null)
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

/** A press, with where it came from: a key (its hand is found by octave at the end) or a known hand (pad row, screen button). */
type Press = RhythmPress & { input: TapInput, key: number | null, hand: Hand | null }
let presses: Press[] = []
const scoreLower = shallowRef<RhythmScore | null>(null)
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
  if (kind.value === 'twoHands') {
    const hands = makeTwoHands()
    task.value = hands.right
    lowerTask.value = hands.left
  } else {
    task.value = makeTask(info.value)
    lowerTask.value = null
  }
  taskCounted = false
  scoreLower.value = null
  troubleHistory = []
  offerSlow.value = false
  slow.value = false
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
  player.play(task.value, bpm.value, { lower: lowerTask.value })
}

/** «Медленнее»: the next attempt of this task at the slow practice tempo. */
function startSlow() {
  slow.value = true
  offerSlow.value = false
  startAttempt()
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
  // Two hands: keys split by octave (the left hand plays the lower one), pads and screen buttons by their side.
  const split = handSplit(presses.flatMap((press) => (press.key === null ? [] : [press.key])))
  const handOf = (press: Press): Hand => press.hand ?? (press.key !== null && press.key < split ? 'left' : 'right')
  const lower = lowerTask.value
  const result = scoreRhythm(sounds(task.value, bpm.value), lower ? presses.filter((press) => handOf(press) === 'right') : presses, checkHold)
  const left = lower ? scoreRhythm(sounds(lower, bpm.value), presses.filter((press) => handOf(press) === 'left'), checkHold) : null
  score.value = result
  scoreLower.value = left
  const both = [...hintsFor(result, task.value), ...(left && lower ? hintsFor(left, lower) : [])]
  const real = [...new Set(both)].filter((hint) => hint !== 'great')
  hints.value = real.length ? real.slice(0, 2) : ['great']
  attemptPassed.value = passes(result) && (!left || passes(left))
  phase.value = 'result'
  const wasSlow = slow.value
  wasSlowAttempt.value = wasSlow
  // Back to the level's tempo after a slow practice: the ladder only goes up.
  slow.value = false
  if (!wasSlow) {
    void progress.addRhythmStats(task.value, result)
    if (left && lower) void progress.addRhythmStats(lower, left)
  }
  if (!attemptPassed.value) {
    if (!wasSlow) troubleHistory.push(troubleNotes(result))
    offerSlow.value = troubleSpot(troubleHistory) !== null
    if (offerSlow.value) hints.value = ['slowDown', ...hints.value.slice(0, 1)]
    return
  }
  troubleHistory = []
  offerSlow.value = false
  if (wasSlow || taskCounted) return
  taskCounted = true
  const before = starsOf(levelPasses.value)
  await progress.addRhythmPass(level.value)
  levelDone.value = before < RHYTHM_TEMPOS.length && starsOf(levelPasses.value) === RHYTHM_TEMPOS.length
}

/** Where the press lands in the rhythm, as heard: the input's own delay taken off. */
function pressTime(input: TapInput) {
  return player.heardPosition() - metronome.latency.value[input] / 1000
}

/**
 * A tap; `velocity` only from the MK4 (the screen and computer keys always send the same). `from` says
 * which key, or which hand when it is known (a pad row, a screen button).
 */
function press(input: TapInput, velocity: number | null = null, from: { key?: number, hand?: Hand } = {}) {
  if (phase.value !== 'playing') return
  presses.push({ time: pressTime(input), end: null, input, velocity: input === 'midi' ? velocity : null, key: from.key ?? null, hand: from.hand ?? null })
  // Keys sound through the synth when it is on; everything else gets a soft tick, so a tap is heard.
  if (input !== 'midi' && input !== 'keys') metronome.noteAt(metronome.audioContext().currentTime, 0.12)
  else if (useSynth().status.value !== 'ready') metronome.noteAt(metronome.audioContext().currentTime, 0.12)
}

function release(input: TapInput, from: { key?: number, hand?: Hand } = {}) {
  if (phase.value !== 'playing') return
  for (let i = presses.length - 1; i >= 0; i--) {
    const item = presses[i]!
    const same = (from.key === undefined || item.key === from.key) && (from.hand === undefined || item.hand === from.hand)
    if (item.input === input && item.end === null && same) {
      presses[i] = { ...item, end: Math.max(item.time, pressTime(input)) }
      return
    }
  }
}

onEvent((event) => {
  if (event.type === 'noteOn') press(tapInputOf(event), event.velocity, { key: event.note })
  else if (event.type === 'noteOff') release(event.source === 'midi' ? 'midi' : 'keys', { key: event.note })
  // Pad 1 is the drum (two hands: pads 1-4 left, 5-8 right); pads have no length, so they are not checked for hold.
  else if (event.type === 'pad' && lowerTask.value) press(tapInputOf(event), event.velocity, { hand: padHand(event.pad) })
  else if (event.type === 'pad' && event.pad === 1) press(tapInputOf(event), event.velocity)
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
const lowerMarks = computed<Record<number, TimingVerdict>>(() => Object.fromEntries((scoreLower.value?.results ?? []).map((result) => [result.index, result.verdict])))
const showNotes = computed(() => kind.value !== 'repeat' || phase.value === 'result')
/** Count-in beat shown big while the child waits for the first note. */
const countIn = ref<number | null>(null)
let countFrame = 0
function followCountIn() {
  const position = player.heardPosition()
  // One beat of the meter: a quarter in x/4, an eighth in 6/8 (the metronome counts eighths there).
  const { meter } = task.value
  const beat = quarterSeconds(bpm.value, meter) * (4 / meter.denominator)
  const beats = meter.numerator
  countIn.value = phase.value === 'playing' && position < 0 ? beats - Math.floor(-position / beat) : null
  countFrame = requestAnimationFrame(followCountIn)
}
countFrame = requestAnimationFrame(followCountIn)
onBeforeUnmount(() => cancelAnimationFrame(countFrame))

/** The intro: one bar of each new value, to look at and listen to. */
const introRhythms = computed(() => info.value.introduces.map((id) => ({ id, rhythm: introRhythm(id) })))
const levelTabs = computed(() => RHYTHM_LEVELS.map((item) => ({ id: item.id, open: isOpen(item.id, passed.value), stars: starsOf(passed.value[item.id]?.passes ?? 0) })))
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
      <span class="text-muted tabular-nums">{{ slow ? t('theory.tempoSlow', { bpm }) : t('theory.tempo', { bpm }) }}</span>
    </div>

    <section class="task">
      <template v-if="phase === 'intro'">
        <p class="prompt text-highlighted">{{ t('theory.intro.title') }}</p>
        <div class="intro">
          <div v-for="item in introRhythms" :key="item.id" class="intro__item">
            <RhythmStaff :rhythm="item.rhythm" />
            <p class="text-toned">{{ t(`theory.intro.${item.id}`) }}</p>
            <UButton icon="i-lucide-ear" color="neutral" variant="soft" size="md" class="self-start" :label="t('theory.listen')" @click="player.play(item.rhythm, bpm)" />
          </div>
        </div>
      </template>
      <template v-else>
        <p class="prompt text-highlighted">{{ t(`theory.kind.${kind}`) }}</p>
        <div class="staff-box">
          <RhythmStaff
            v-if="showNotes"
            :scale="lowerTask ? 1.7 : 2.2"
            :rhythm="task"
            :lower="lowerTask"
            :current="phase === 'playing' && kind === 'read' ? player.current.value : null"
            :marks="phase === 'result' ? marks : undefined"
            :lower-marks="phase === 'result' ? lowerMarks : undefined"
          />
          <p v-else class="hidden-notes text-muted">{{ t('theory.hiddenNotes') }}</p>
          <span v-if="countIn !== null" class="count-in" aria-live="assertive">{{ countIn }}</span>
        </div>
      </template>

      <div v-if="phase === 'result' && score" class="result" :class="attemptPassed ? 'result--passed' : 'result--again'" role="status">
        <p class="result__title">{{ levelDone ? t('theory.levelDone', { n: level }) : attemptPassed ? (wasSlowAttempt ? t('theory.slowPassed') : t('theory.passed')) : t('theory.again') }}</p>
        <p class="text-toned">{{ hints.map((hint) => t(`theory.hints.${hint}`)).join(' ') }}</p>
      </div>
    </section>

    <div class="controls">
      <UButton v-if="phase === 'intro'" icon="i-lucide-check" size="xl" :label="t('theory.intro.ok')" @click="closeIntro" />
      <template v-else>
        <template v-if="phase === 'result' && attemptPassed && wasSlowAttempt">
          <UButton icon="i-lucide-play" size="xl" :label="t('theory.atTempo')" @click="startAttempt" />
        </template>
        <template v-else-if="phase === 'result' && attemptPassed">
          <UButton v-if="levelDone && isOpen(level + 1, passed)" icon="i-lucide-arrow-right" size="xl" :label="t('theory.nextLevel')" @click="openLevel(level + 1)" />
          <UButton v-else icon="i-lucide-arrow-right" size="xl" :label="t('theory.next')" @click="nextTask" />
          <UButton icon="i-lucide-rotate-ccw" color="neutral" variant="soft" size="xl" :label="t('theory.again')" @click="startAttempt" />
        </template>
        <UButton v-if="phase === 'result' && offerSlow" icon="i-lucide-turtle" size="xl" :label="t('theory.slower')" @click="startSlow" />
        <UButton
          v-else-if="!(phase === 'result' && attemptPassed)"
          :icon="phase === 'playing' ? 'i-lucide-square' : 'i-lucide-play'"
          size="xl"
          :label="phase === 'playing' ? t('theory.stop') : phase === 'result' ? t('theory.again') : t('theory.play')"
          @click="phase === 'playing' ? stopAttempt() : startAttempt()"
        />
        <UButton icon="i-lucide-ear" color="neutral" variant="soft" size="xl" :disabled="phase === 'playing'" :label="phase === 'result' ? t('theory.listenRight') : t('theory.listen')" @click="listen" />
        <UButton icon="i-lucide-shuffle" color="neutral" variant="ghost" size="xl" :label="t('theory.other')" @click="nextTask" />

        <!-- For playing without the MK4: a big pad on the screen, two for two hands. -->
        <div class="taps">
          <template v-if="lowerTask">
            <button
              v-for="hand in (['left', 'right'] as const)"
              :key="hand"
              type="button"
              class="tap"
              :class="{ 'tap--live': phase === 'playing' }"
              :aria-label="t(`theory.hand.${hand}`)"
              @pointerdown.prevent="press('screen', null, { hand })"
              @pointerup.prevent="release('screen', { hand })"
              @pointercancel="release('screen', { hand })"
            >
              {{ t(`theory.hand.${hand}`) }}
            </button>
          </template>
          <button
            v-else
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
        </div>
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

.taps {
  display: flex;
  gap: 0.75rem;
  margin-left: auto;
}

.tap {
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
