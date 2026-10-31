<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import BeatRuler from '@/components/BeatRuler.vue'
import CountIn from '@/components/CountIn.vue'
import ExamBadge from '@/components/ExamBadge.vue'
import HelpSwitch from '@/components/HelpSwitch.vue'
import LevelRow from '@/components/LevelRow.vue'
import PianoKeyboard from '@/components/PianoKeyboard.vue'
import RhythmStaff from '@/components/RhythmStaff.vue'
import SkillPicker from '@/components/SkillPicker.vue'
import StarRating from '@/components/StarRating.vue'
import { useCountIn } from '@/composables/useCountIn'
import { useHelp } from '@/composables/useHelp'
import { useKeyboardWindow } from '@/composables/useKeyboardWindow'
import SongPractice from '@/pages/SongPractice.vue'
import { useMetronome } from '@/composables/useMetronome'
import { useMk4Actions } from '@/composables/useMk4Actions'
import { useNoteSource } from '@/composables/useNoteSource'
import { padsPlayMusic, usePadActions } from '@/composables/usePadActions'
import { useProgress } from '@/composables/useProgress'
import { useRhythmPlayer } from '@/composables/useRhythmPlayer'
import { usePhoneScreen, useShortScreen } from '@/composables/useShortScreen'
import { useTheoryPiece } from '@/composables/useTheoryPiece'
import { useTheoryPieces } from '@/composables/useTheoryPieces'
import { useTimedPresses, type TimedPress } from '@/composables/useTimedPresses'
import { useWakeLock } from '@/composables/useWakeLock'
import { EXAM_STARS } from '@/lib/levels'
import { scaleGroups } from '@/lib/metronome'
import { noteMark, scoreRhythm, sounds, totalQuarters, type NoteMark, type Rhythm, type RhythmScore } from '@/lib/rhythm'
import {
  RHYTHM_LEVELS,
  MAX_STARS,
  RHYTHM_TEMPOS,
  attemptStars,
  currentLevel,
  hintsFor,
  isOpen,
  makeTask,
  rhythmLevel,
  handSplit,
  makeTwoHands,
  padHand,
  slowTempo,
  starsOf,
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

/** A piece played inside the section: the rhythm task waits, the pads and keys belong to the piece. */
const { piece: openPiece, closePiece } = useTheoryPiece()
const passed = computed(() => progress.rhythmProgress.value)
const level = ref(currentLevel(passed.value))
// The saved progress arrives a moment after the page: open on the child's level then.
watch(() => progress.ready.value, () => {
  level.value = currentLevel(passed.value)
})
const info = computed(() => rhythmLevel(level.value))
// A two-hand task is in 2/4, counted in quarters: it keeps the plain tempo steps, not the doubled 6/8 ones.
const levelBpm = computed(() => (kind.value === 'twoHands' ? RHYTHM_TEMPOS[0] : levelTempo(info.value)))
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
const stars = computed(() => starsOf(passed.value, level.value))
/** Stars of the last attempt: green notes against yellow ones (lib/rhythmLevels attemptStars). */
const lastStars = ref(0)
/**
 * Help is the app's «С подсказкой» switch (plan step 29): on, the count stands under every note and the note being
 * played is marked; off, just the notes. From two stars (the last tempo) the level is in its exam: no help. The
 * metronome's clicks stay: playing with them is the task, not a hint.
 */
const { exam, guideOn } = useHelp(() => stars.value >= EXAM_STARS)

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
  closePiece()
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
  heardTask = false
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
  listeningFirst.value = false
  player.stop()
  padsPlayMusic.value = false
  if (phase.value === 'playing') phase.value = 'ready'
}

/** «Послушать»: the rhythm with its notes, after the count-in. */
function listen() {
  if (phase.value === 'playing') return
  metronome.stop()
  heardTask = true
  player.play(task.value, bpm.value, { lower: lowerTask.value })
}

/** «Послушай и повтори»: this task's rhythm has been heard, so «Играть» goes straight to the student's turn. */
let heardTask = false
/** «Играть» on a rhythm not heard yet: it sounds first, then the student repeats it, with no second tap. */
const listeningFirst = ref(false)

/**
 * The metronome button: steady clicks at the task's tempo and meter between attempts, to count along and
 * tap the beat before trying. An attempt has its own count-in and clicks, so «Играть» and «Послушать» stop it.
 */
/** Short screens (the smaller tablets, 650 px high) get a smaller staff, so the page does not scroll. */
const short = useShortScreen()
const phone = usePhoneScreen()
const staffScale = computed(() => (lowerTask.value ? (phone.value ? 0.7 : short.value ? 1 : 1.35) : phone.value ? 1.1 : short.value ? 1.6 : 2))
const introScale = computed(() => (phone.value ? 0.85 : short.value ? 1.25 : 1.5))

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
  metronome: () => {
    if (!openPiece.value) toggleMetronome()
  },
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
  if (kind.value === 'repeat' && !heardTask) {
    heardTask = true
    listeningFirst.value = true
    phase.value = 'playing'
    player.play(task.value, bpm.value)
    return
  }
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
  // Heard it: now the student's turn, with its own count-in.
  if (listeningFirst.value) {
    startAttempt()
    return
  }
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
  const result = scoreRhythm(sounds(task.value, bpm.value), lower ? presses.filter((press) => handOf(press) === 'right') : presses, checkHold, progress.tolerance.value)
  const left = lower ? scoreRhythm(sounds(lower, bpm.value), presses.filter((press) => handOf(press) === 'left'), checkHold, progress.tolerance.value) : null
  score.value = result
  scoreLower.value = left
  const both = [...hintsFor(result, task.value), ...(left && lower ? hintsFor(left, lower) : [])]
  const real = [...new Set(both)].filter((hint) => hint !== 'great')
  hints.value = real.length ? real.slice(0, 2) : ['great']
  // Not one press: the child did not know what to press, or the MK4 is not connected.
  if (presses.length === 0) hints.value = ['noTaps']
  // Two hands: the weaker hand decides.
  lastStars.value = Math.min(attemptStars(result), left ? attemptStars(left) : MAX_STARS)
  attemptPassed.value = lastStars.value >= 1
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
    // Not one press is not a hard place: no «slower» for it.
    if (presses.length === 0) return
    if (!practice) troubleHistory.push(troubleNotes(result))
    offerSlow.value = troubleSpot(troubleHistory) !== null
    if (offerSlow.value) hints.value = ['slowDown', ...hints.value.slice(0, 1)]
    return
  }
  troubleHistory = []
  offerSlow.value = false
  if (practice) return
  const before = stars.value
  await progress.addRhythmPass(level.value, lastStars.value, !taskCounted)
  taskCounted = true
  levelDone.value = before < MAX_STARS && stars.value === MAX_STARS
}

const timed = useTimedPresses({
  active: () => phase.value === 'playing',
  heardPosition: () => player.heardPosition(),
  // Pad 1 is the drum; with two hands pads 1-4 are the left hand and 5-8 the right.
  pad: (pad) => (lowerTask.value ? { hand: padHand(pad) } : pad === 1 ? {} : null),
})
/** The keyboard on the screen plays like the MK4's keys: any key is a tap, and it sounds. */
const windowStart = useKeyboardWindow()
const { heldNotes, pressNote, releaseNote } = useNoteSource()

usePadActions({
  next: () => {
    // A piece inside the section has the pads.
    if (openPiece.value) return
    if (phase.value === 'ready' || phase.value === 'intro') startAttempt()
    else if (phase.value === 'result') {
      if (attemptPassed.value) nextTask()
      else startAttempt()
    }
  },
  listen: () => {
    if (!openPiece.value) listen()
  },
  skip: () => {
    if (!openPiece.value) nextTask()
  },
  levelDown: () => openLevel(level.value - 1),
  levelUp: () => openLevel(level.value + 1),
})

watch(openPiece, (open) => {
  if (!open) return
  stopAttempt()
  metronome.stop()
})

onBeforeUnmount(() => {
  stopAttempt()
  metronome.stop()
})

/** Colour of each note after an attempt. */
const marks = computed<Record<number, NoteMark>>(() => Object.fromEntries((score.value?.results ?? []).map((result) => [result.index, noteMark(result)])))
const lowerMarks = computed<Record<number, NoteMark>>(() => Object.fromEntries((scoreLower.value?.results ?? []).map((result) => [result.index, noteMark(result)])))
const showNotes = computed(() => kind.value !== 'repeat' || phase.value === 'result')
/** The intro example being heard, to move only its line. */
const introHeard = ref<string | null>(null)
/** The notes of the task in time, for the press-and-release bars under the staff. */
const taskSounds = computed(() => sounds(task.value, bpm.value).filter((sound) => !sound.rest))
/** The countdown before the first note, shown big. */
const countIn = useCountIn(() => ({
  active: phase.value === 'playing',
  position: player.heardPosition(),
}))

/** The intro: one bar of each new value, to look at and listen to. */
const introRhythms = computed(() => info.value.introduces.map((id) => ({ id, rhythm: introRhythm(id) })))
const { piecesAfter } = useTheoryPieces('rhythm')
const levelTabs = computed(() => RHYTHM_LEVELS.map((item) => ({ id: item.id, open: isOpen(item.id, passed.value), stars: starsOf(passed.value, item.id) })))
</script>

<template>
  <LevelRow
    :tabs="levelTabs"
    :current="openPiece ? null : level"
    :pieces-after="piecesAfter"
    :open-piece-key="openPiece?.key"
    :label="t('theory.levelsLabel')"
    @select="openLevel"
  >
    <StarRating :value="stars" size="lg" />
    <ExamBadge v-if="exam" />
    <!-- The app's help switch, in the drawer; a level's exam turns it off. -->
    <HelpSwitch :on="guideOn" :exam="exam" />
    <SkillPicker />
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
  </LevelRow>

  <!-- A piece is played right here: the level row stays, only this content becomes its practice. -->
  <SongPractice v-if="openPiece" :key="openPiece.key" :song-id="openPiece.songId" :channel="openPiece.channel" embedded />
  <template v-else>
  <section class="task">
    <template v-if="phase === 'intro'">
      <p class="prompt text-highlighted">{{ t('theory.intro.title') }}</p>
      <div class="intro">
        <div v-for="item in introRhythms" :key="item.id" class="intro__item">
          <RhythmStaff :rhythm="item.rhythm" :scale="introScale" counts />
          <!-- When to press and let go, drawn to time; the line moves while it is heard. -->
          <BeatRuler
            compact
            class="intro__ruler"
            :meter="item.rhythm.meter"
            :bpm="bpm"
            :quarters="totalQuarters(item.rhythm)"
            :notes="sounds(item.rhythm, bpm).filter((sound) => !sound.rest)"
            :get-position="() => (player.playing.value && introHeard === item.id ? player.heardPosition() : null)"
            :get-taps="() => []"
          />
          <p class="text-toned">{{ t(`theory.intro.${item.id}`) }}</p>
          <UButton icon="i-lucide-ear" color="neutral" variant="soft" size="md" class="self-start" :label="t('theory.listen')" @click="introHeard = item.id; player.play(item.rhythm, bpm)" />
        </div>
      </div>
    </template>
    <template v-else>
      <div>
        <p class="prompt text-highlighted">{{ t(`theory.kind.${kind}`) }}</p>
        <!-- What to press: the notes sit on one line and have no pitch, so any key will do. -->
        <p class="how text-toned">{{ listeningFirst ? t('theory.listenFirst') : lowerTask ? t('theory.howTwoHands') : guideOn ? t('theory.how') : t('theory.howNoCounts') }}</p>
      </div>
      <div class="staff-box">
        <template v-if="showNotes">
          <RhythmStaff
            :scale="staffScale"
            :rhythm="task"
            :counts="guideOn"
            :lower="lowerTask"
            :current="guideOn && phase === 'playing' && kind === 'read' ? player.current.value : null"
            :marks="phase === 'result' ? marks : undefined"
            :lower-marks="phase === 'result' ? lowerMarks : undefined"
          />
          <!-- With the help on: when to press and when to let go, drawn to time under the notes. -->
          <BeatRuler
            v-if="guideOn && !lowerTask"
            compact
            :meter="task.meter"
            :bpm="bpm"
            :quarters="totalQuarters(task)"
            :notes="taskSounds"
            :get-position="() => (player.playing.value ? player.heardPosition() : null)"
            :get-taps="() => timed.presses()"
          />
        </template>
        <!-- Notes hidden (listen and repeat): the bars, where the music is and the student's taps, to follow along. -->
        <div v-else class="hidden-notes">
          <BeatRuler
            :meter="task.meter"
            :bpm="bpm"
            :quarters="totalQuarters(task)"
            :get-position="() => (player.playing.value ? player.heardPosition() : null)"
            :get-taps="() => timed.presses()"
          />
          <p class="text-muted">{{ t('theory.hiddenNotes') }}</p>
        </div>
        <CountIn :value="countIn" />
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
      <!-- This attempt's stars: green notes against yellow ones. -->
      <StarRating v-if="attemptPassed" :value="lastStars" size="md" />
      <p class="text-toned">{{ hints.map((hint) => t(`theory.hints.${hint}`)).join(' ') }}</p>
      <p v-if="attemptPassed && lastStars < MAX_STARS && !wasPractice" class="text-muted">{{ t('theory.moreStars') }}</p>
    </div>
  </section>

  <div class="controls">
    <UButton v-if="phase === 'intro'" icon="i-lucide-check" size="lg" :label="t('theory.intro.ok')" @click="closeIntro" />
    <template v-else>
      <!-- Secondary first; the main action is always the last button, on the right (owner's rule). -->
      <UButton
        icon="i-lucide-timer"
        :color="metronomeOn ? 'primary' : 'neutral'"
        :variant="metronomeOn ? 'solid' : 'soft'"
        size="lg"
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
      <UButton icon="i-lucide-shuffle" color="neutral" variant="soft" size="lg" :label="t('theory.other')" @click="nextTask" />
      <UButton icon="i-lucide-ear" color="neutral" variant="soft" size="lg" :disabled="phase === 'playing'" :label="phase === 'result' ? t('theory.listenRight') : t('theory.listen')" @click="listen" />
      <template v-if="phase === 'result' && attemptPassed && wasPractice">
        <UButton icon="i-lucide-play" size="lg" :label="t('theory.atTempoOf', { bpm: levelBpm })" @click="pickTempo(null); startAttempt()" />
      </template>
      <template v-else-if="phase === 'result' && attemptPassed">
        <UButton icon="i-lucide-rotate-ccw" color="neutral" variant="soft" size="lg" :label="t('theory.again')" @click="startAttempt" />
        <!-- A piece that has just opened is named here, the moment it opens; the chip in the row stays small. -->
        <template v-if="levelDone">
          <template v-for="piece in piecesAfter(level)" :key="piece.id">
            <UButton v-if="piece.to" :to="piece.to" icon="i-lucide-music" size="lg" color="success" :label="t('theory.playPiece', { name: piece.title })" />
          </template>
        </template>
        <UButton v-if="levelDone && isOpen(level + 1, passed)" icon="i-lucide-arrow-right" size="lg" :label="t('theory.nextLevel')" @click="openLevel(level + 1)" />
        <template v-else>
          <!-- One star opens the next level; more stars are for later, so going on is offered, not forced. -->
          <UButton v-if="isOpen(level + 1, passed)" icon="i-lucide-skip-forward" color="neutral" variant="soft" size="lg" :label="t('theory.nextLevel')" @click="openLevel(level + 1)" />
          <UButton icon="i-lucide-arrow-right" size="lg" :label="t('theory.next')" @click="nextTask" />
        </template>
      </template>
      <UButton v-if="phase === 'result' && offerSlow" icon="i-lucide-turtle" size="lg" :label="t('theory.slower')" @click="startSlow" />
      <UButton
        v-else-if="!(phase === 'result' && attemptPassed)"
        :icon="phase === 'playing' ? 'i-lucide-square' : 'i-lucide-play'"
        size="lg"
        :label="phase === 'playing' ? t('theory.stop') : phase === 'result' ? t('theory.again') : t('theory.play')"
        @click="phase === 'playing' ? stopAttempt() : startAttempt()"
      />

    </template>
  </div>

  <!-- Played on a real keyboard: any key, on the MK4 or here on the screen, sounds like the piano. In two hands the
       lower octave is the left hand. Pad 1 still taps too. -->
  <PianoKeyboard class="rhythm-keys" :start="windowStart" :held="heldNotes" @press="pressNote" @release="releaseNote" />
  </template>
</template>

<style scoped src="./theory.css"></style>

<style scoped>
.staff-box {
  position: relative;
  min-height: 8rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.hidden-notes {
  width: 100%;
  text-align: center;
  font-size: 1.125rem;
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





/* The keyboard to play on: low, the staff and the card get the height. Any key is a tap. */
.rhythm-keys {
  --keys-height: clamp(5.5rem, 18vh, 9rem);
  width: 100%;
  margin-top: 0.75rem;
}

@media (max-height: 720px) {
  .rhythm-keys {
    --keys-height: clamp(5rem, 15vh, 7rem);
    margin-top: 0.375rem;
  }
}

@media (orientation: landscape) and (max-height: 500px) {
  .rhythm-keys {
    --keys-height: 4rem;
    margin-top: 0.25rem;
  }

  .staff-box {
    min-height: 0;
  }
}
</style>
