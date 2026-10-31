<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import RhythmStaff from '@/components/RhythmStaff.vue'
import { useMetronome } from '@/composables/useMetronome'
import { useMk4Actions } from '@/composables/useMk4Actions'
import { padsPlayMusic, usePadActions } from '@/composables/usePadActions'
import { useProgress } from '@/composables/useProgress'
import { useRhythmPlayer } from '@/composables/useRhythmPlayer'
import { useShortScreen } from '@/composables/useShortScreen'
import { useTheoryPieces } from '@/composables/useTheoryPieces'
import { useTimedPresses, type TimedPress } from '@/composables/useTimedPresses'
import { useWakeLock } from '@/composables/useWakeLock'
import { scaleGroups } from '@/lib/metronome'
import { quarterSeconds, scoreRhythm, sounds, type Rhythm, type RhythmScore, type TimingVerdict } from '@/lib/rhythm'
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

// «Теория» → «Ритм» (plan step 17), the first section of the course.
// Each task: listen if you like → one bar of count-in → play along on any key, pad 1 or the screen →
// the notes turn green, yellow or red, and one or two words on what to fix → again or next.

const { t } = useI18n()
useWakeLock()
const progress = useProgress()
const metronome = useMetronome()
const player = useRhythmPlayer()

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
/** A tempo picked on the metronome scale; null follows the level's step. */
const chosenBpm = ref<number | null>(null)
const baseBpm = computed(() => chosenBpm.value ?? levelBpm.value)
const bpm = computed(() => (slow.value ? slowTempo(baseBpm.value) : baseBpm.value))
/** Slower than the level's step: practice, fine to play, but no star (the ladder only goes up). */
const practicing = computed(() => bpm.value < levelBpm.value)
/** The scale offered: 6/8 counts eighths and may go up to 208, the rest up to 160. */
const tempoGroups = computed(() => scaleGroups(40, kind.value !== 'twoHands' && info.value.tempoScale ? 208 : 160))
const tempoOpen = ref(false)
function pickTempo(mark: number | null) {
  chosenBpm.value = mark
  slow.value = false
  tempoOpen.value = false
}
/** Wrong notes of each failed attempt of this task, to spot a hard place. */
let troubleHistory: number[][] = []
const offerSlow = ref(false)
/** The last attempt was the slow practice. */
const wasSlowAttempt = ref(false)
/** The last attempt was below the level's step (slow practice or a slower picked tempo): passing it gives no star. */
const wasPractice = ref(false)
/** Its tempo, to say «получилось в темпе 72, для звезды нужно 80». */
const practiceBpm = ref(0)
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
const scoreLower = shallowRef<RhythmScore | null>(null)
let attemptTimer: ReturnType<typeof setTimeout> | undefined

function openLevel(id: number) {
  if (!isOpen(id, passed.value)) return
  stopAttempt()
  level.value = id
}

watch(level, () => {
  // A new level starts on its own ladder.
  chosenBpm.value = null
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
  metronome.stop()
  player.play(task.value, bpm.value, { lower: lowerTask.value })
}

/**
 * The metronome button: steady clicks at the task's tempo and meter between attempts, to count along and
 * tap the beat before trying. An attempt has its own count-in and clicks, so «Играть» and «Послушать» stop it.
 */
/** Short screens (the smaller tablets, 650 px high) get a smaller staff, so the page does not scroll. */
const short = useShortScreen()
const staffScale = computed(() => (lowerTask.value ? (short.value ? 1 : 1.35) : short.value ? 1.6 : 2))
const introScale = computed(() => (short.value ? 1.25 : 1.5))

const metronomeOn = computed(() => metronome.running.value)
/** Counts the beats heard, to restart the beat light on each one (also when the same beat number comes again). */
const beatCount = ref(0)
watch(() => metronome.beat.value, () => {
  beatCount.value++
})
function startMetronome() {
  const { meter } = task.value
  metronome.start({ bpm: bpm.value, beats: meter.numerator })
}
// The MK4's transport (plan step 26): ■/▶ plays the attempt or stops it, Loop and ● start it again, Shift+Tap
// Tempo is this screen's metronome.
useMk4Actions({
  playStop: () => (phase.value === 'playing' ? stopAttempt() : startAttempt()),
  again: () => startAttempt(),
  record: () => startAttempt(),
  metronome: () => toggleMetronome(),
})

function toggleMetronome() {
  if (metronomeOn.value) metronome.stop()
  else startMetronome()
}
// A new task or tempo while it clicks: go on at the new one.
watch([bpm, () => task.value.meter.numerator], () => {
  if (metronomeOn.value) startMetronome()
})

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
  metronome.stop()
  timed.reset()
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
  const presses = timed.presses()
  // Hold is checked only when every press came with a release (keys and the screen, not pads).
  const checkHold = presses.length > 0 && presses.every((press) => press.end !== null)
  // Two hands: keys split by octave (the left hand plays the lower one), pads and screen buttons by their side.
  const split = handSplit(presses.flatMap((press) => (press.key === null ? [] : [press.key])))
  const handOf = (press: TimedPress): Hand => press.hand ?? (press.key !== null && press.key < split ? 'left' : 'right')
  const lower = lowerTask.value
  const result = scoreRhythm(sounds(task.value, bpm.value), lower ? presses.filter((press) => handOf(press) === 'right') : presses, checkHold)
  const left = lower ? scoreRhythm(sounds(lower, bpm.value), presses.filter((press) => handOf(press) === 'left'), checkHold) : null
  score.value = result
  scoreLower.value = left
  const both = [...hintsFor(result, task.value), ...(left && lower ? hintsFor(left, lower) : [])]
  const real = [...new Set(both)].filter((hint) => hint !== 'great')
  hints.value = real.length ? real.slice(0, 2) : ['great']
  // Not one press: the child did not know what to press, or the MK4 is not connected.
  if (presses.length === 0) hints.value = ['noTaps']
  attemptPassed.value = passes(result) && (!left || passes(left))
  phase.value = 'result'
  const wasSlow = slow.value
  wasSlowAttempt.value = wasSlow
  wasPractice.value = practicing.value
  practiceBpm.value = bpm.value
  const practice = wasPractice.value
  // Back to the level's tempo after a slow practice: the ladder only goes up.
  slow.value = false
  if (!practice) {
    void progress.addRhythmStats(task.value, result)
    if (left && lower) void progress.addRhythmStats(lower, left)
  }
  if (!attemptPassed.value) {
    if (!practice) troubleHistory.push(troubleNotes(result))
    offerSlow.value = troubleSpot(troubleHistory) !== null
    if (offerSlow.value) hints.value = ['slowDown', ...hints.value.slice(0, 1)]
    return
  }
  troubleHistory = []
  offerSlow.value = false
  if (practice || taskCounted) return
  taskCounted = true
  const before = starsOf(levelPasses.value)
  await progress.addRhythmPass(level.value)
  levelDone.value = before < RHYTHM_TEMPOS.length && starsOf(levelPasses.value) === RHYTHM_TEMPOS.length
}

const timed = useTimedPresses({
  active: () => phase.value === 'playing',
  heardPosition: () => player.heardPosition(),
  // Pad 1 is the drum; with two hands pads 1-4 are the left hand and 5-8 the right.
  pad: (pad) => (lowerTask.value ? { hand: padHand(pad) } : pad === 1 ? {} : null),
})
const { press, release } = timed

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

onBeforeUnmount(() => {
  stopAttempt()
  metronome.stop()
})

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
const { piecesAfter } = useTheoryPieces('rhythm')
const levelTabs = computed(() => RHYTHM_LEVELS.map((item) => ({ id: item.id, open: isOpen(item.id, passed.value), stars: starsOf(passed.value[item.id]?.passes ?? 0) })))
</script>

<template>
  <div class="levels-row">
    <div class="levels" role="tablist" :aria-label="t('theory.levelsLabel')">
      <template v-for="tab in levelTabs" :key="tab.id">
        <button
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
        <!-- The piece that ends this group of levels: open once the level has all its stars (plan step 18). -->
        <template v-for="piece in piecesAfter(tab.id)" :key="piece.id">
          <RouterLink v-if="piece.to && tab.stars === 3" :to="piece.to" class="level level--piece" :aria-label="t('theory.playPiece', { name: piece.title })">
            <UIcon name="i-lucide-music" class="size-4" />
          </RouterLink>
          <span v-else class="level level--piece level--closed" role="img" :aria-label="t('theory.pieceLocked', { name: piece.title, n: tab.id })">
            <UIcon name="i-lucide-music" class="size-3.5" />
            <UIcon name="i-lucide-lock" class="size-3" />
          </span>
        </template>
      </template>
    </div>
    <span class="stars" :aria-label="t('train.stars', { n: stars })">{{ '★'.repeat(stars) }}<span class="stars__off">{{ '★'.repeat(3 - stars) }}</span></span>
    <!-- Tempo from the metronome scale, one tap, like a mechanical metronome. -->
    <UPopover v-model:open="tempoOpen" :content="{ side: 'bottom', align: 'start' }">
      <UButton
        color="neutral"
        variant="soft"
        size="lg"
        trailing-icon="i-lucide-chevron-down"
        class="tabular-nums"
        :disabled="phase === 'playing'"
        :label="slow ? t('theory.tempoSlow', { bpm }) : practicing ? t('theory.tempoPractice', { bpm }) : t('theory.tempo', { bpm })"
      />
      <template #content>
        <div class="scale">
          <UButton
            :color="chosenBpm === null ? 'primary' : 'neutral'"
            :variant="chosenBpm === null ? 'solid' : 'soft'"
            size="md"
            icon="i-lucide-trending-up"
            :label="t('theory.tempoLevel', { bpm: levelBpm })"
            @click="pickTempo(null)"
          />
          <p class="scale__note text-muted">{{ t('theory.tempoNote', { bpm: levelBpm }) }}</p>
          <div v-for="group in tempoGroups" :key="group.name" class="scale__group">
            <span class="scale__name text-muted">{{ t(`rhythm.tempo.${group.name}`) }}</span>
            <div class="scale__marks">
              <button
                v-for="mark in group.marks"
                :key="mark"
                type="button"
                class="mark tabular-nums"
                :class="{ 'mark--on': mark === bpm && chosenBpm !== null, 'mark--practice': mark < levelBpm }"
                @click="pickTempo(mark === levelBpm ? null : mark)"
              >
                {{ mark }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </UPopover>
  </div>

  <section class="task">
    <template v-if="phase === 'intro'">
      <p class="prompt text-highlighted">{{ t('theory.intro.title') }}</p>
      <div class="intro">
        <div v-for="item in introRhythms" :key="item.id" class="intro__item">
          <RhythmStaff :rhythm="item.rhythm" :scale="introScale" counts />
          <p class="text-toned">{{ t(`theory.intro.${item.id}`) }}</p>
          <UButton icon="i-lucide-ear" color="neutral" variant="soft" size="md" class="self-start" :label="t('theory.listen')" @click="player.play(item.rhythm, bpm)" />
        </div>
      </div>
    </template>
    <template v-else>
      <div>
        <p class="prompt text-highlighted">{{ t(`theory.kind.${kind}`) }}</p>
        <!-- What to press: the notes sit on one line and have no pitch, so any key will do. -->
        <p class="how text-toned">{{ lowerTask ? t('theory.howTwoHands') : t('theory.how') }}</p>
      </div>
      <div class="staff-box">
        <RhythmStaff
          v-if="showNotes"
          :scale="staffScale"
          :rhythm="task"
          counts
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
      <p class="result__title">
        {{ levelDone ? t('theory.levelDone', { n: level })
          : !attemptPassed ? t('theory.again')
            : wasSlowAttempt ? t('theory.slowPassed')
              : wasPractice ? t('theory.practicePassed', { bpm: practiceBpm, need: levelBpm })
                : t('theory.passed') }}
      </p>
      <p class="text-toned">{{ hints.map((hint) => t(`theory.hints.${hint}`)).join(' ') }}</p>
    </div>
  </section>

  <div class="controls">
    <UButton v-if="phase === 'intro'" icon="i-lucide-check" size="xl" :label="t('theory.intro.ok')" @click="closeIntro" />
    <template v-else>
      <!-- Secondary first; the main action is always the last button, on the right (owner's rule). -->
      <UButton
        icon="i-lucide-timer"
        :color="metronomeOn ? 'primary' : 'neutral'"
        :variant="metronomeOn ? 'solid' : 'soft'"
        size="xl"
        class="metronome"
        :disabled="phase === 'playing'"
        :aria-pressed="metronomeOn"
        :aria-label="t('songs.metronome')"
        @click="toggleMetronome"
      >
        <template #trailing>
          <!-- The beat, so it can be seen as well as heard; the strong beat is bigger. -->
          <span v-if="metronomeOn && metronome.beat.value >= 0" :key="beatCount" class="beat" :class="{ 'beat--strong': metronome.beat.value === 0 }" aria-hidden="true" />
        </template>
      </UButton>
      <UButton icon="i-lucide-shuffle" color="neutral" variant="ghost" size="xl" :label="t('theory.other')" @click="nextTask" />
      <UButton icon="i-lucide-ear" color="neutral" variant="soft" size="xl" :disabled="phase === 'playing'" :label="phase === 'result' ? t('theory.listenRight') : t('theory.listen')" @click="listen" />
      <template v-if="phase === 'result' && attemptPassed && wasPractice">
        <UButton icon="i-lucide-play" size="xl" :label="t('theory.atTempoOf', { bpm: levelBpm })" @click="pickTempo(null); startAttempt()" />
      </template>
      <template v-else-if="phase === 'result' && attemptPassed">
        <UButton icon="i-lucide-rotate-ccw" color="neutral" variant="soft" size="xl" :label="t('theory.again')" @click="startAttempt" />
        <!-- A piece that has just opened is named here, the moment it opens; the chip in the row stays small. -->
        <template v-if="levelDone">
          <template v-for="piece in piecesAfter(level)" :key="piece.id">
            <UButton v-if="piece.to" :to="piece.to" icon="i-lucide-music" size="xl" color="success" :label="t('theory.playPiece', { name: piece.title })" />
          </template>
        </template>
        <UButton v-if="levelDone && isOpen(level + 1, passed)" icon="i-lucide-arrow-right" size="xl" :label="t('theory.nextLevel')" @click="openLevel(level + 1)" />
        <UButton v-else icon="i-lucide-arrow-right" size="xl" :label="t('theory.next')" @click="nextTask" />
      </template>
      <UButton v-if="phase === 'result' && offerSlow" icon="i-lucide-turtle" size="xl" :label="t('theory.slower')" @click="startSlow" />
      <UButton
        v-else-if="!(phase === 'result' && attemptPassed)"
        :icon="phase === 'playing' ? 'i-lucide-square' : 'i-lucide-play'"
        size="xl"
        :label="phase === 'playing' ? t('theory.stop') : phase === 'result' ? t('theory.again') : t('theory.play')"
        @click="phase === 'playing' ? stopAttempt() : startAttempt()"
      />

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
</template>

<style scoped src="./theory.css"></style>

<style scoped>
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
  color: var(--color-active);
  pointer-events: none;
}

.beat {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.35;
  /* Restarted on every beat (new key): bright at the click, then fading. */
  animation: beat-flash 220ms ease-out;
}

.beat--strong {
  width: 0.75rem;
  height: 0.75rem;
}

@keyframes beat-flash {
  from {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .beat {
    animation: none;
    opacity: 1;
  }
}

.scale {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  width: min(30rem, 90vw);
  /* The whole scale is tall: on a short tablet it scrolls inside the panel, not the page. */
  max-height: min(70vh, 38rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0.875rem 1rem 1rem;
}

.scale__note {
  font-size: 0.875rem;
  line-height: 1.4;
}

.scale__group {
  display: grid;
  grid-template-columns: 6.5rem minmax(0, 1fr);
  align-items: start;
  gap: 0.5rem;
}

.scale__name {
  padding-top: 0.5rem;
  font-size: 0.875rem;
}

.scale__marks {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.mark {
  min-width: 2.75rem;
  min-height: 2.5rem;
  border-radius: 0.5rem;
  font-weight: 600;
  color: var(--ui-text-highlighted);
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
  transition: transform 100ms ease-out;
}

.mark:active {
  transform: scale(0.94);
}

/* Slower than the level's step: fine for practice, no star. */
.mark--practice {
  color: var(--ui-text-muted);
}

.mark--on {
  color: var(--color-on-fill);
  background: var(--color-active);
  box-shadow: none;
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
  color: var(--color-on-fill);
  background: var(--color-active);
  box-shadow: 0 5px 0 color-mix(in oklab, var(--color-active) 55%, var(--color-shade));
}

.tap:active {
  transform: translateY(4px);
  box-shadow: 0 1px 0 var(--ui-border);
}
</style>
