<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MidiStatus from '@/components/MidiStatus.vue'
import OctaveMapButton from '@/components/OctaveMapButton.vue'
import PageHeader from '@/components/PageHeader.vue'
import PianoKeyboard from '@/components/PianoKeyboard.vue'
import SoundControl from '@/components/SoundControl.vue'
import { useKeyboardWindow } from '@/composables/useKeyboardWindow'
import { useLastPlace } from '@/composables/useLastPlace'
import { useNoteNames } from '@/composables/useNoteNames'
import { useNoteSource } from '@/composables/useNoteSource'
import { usePadActions } from '@/composables/usePadActions'
import { useProgress } from '@/composables/useProgress'
import { SETTLE_MS, useSettled } from '@/composables/useSettled'
import { useSynth } from '@/composables/useSynth'
import { useWakeLock } from '@/composables/useWakeLock'
import { LEVELS, STAR_THRESHOLDS, checkTask, formulaSteps, generateTask, isCleanChord, isExam, isLevelOpen, starsFor, taskId, taskNotes, type Task } from '@/lib/levels'
import { midiName, noteName, pitchClass } from '@/lib/theory'

const NEXT_DELAY_MS = 700

const { t } = useI18n()
useWakeLock()
const { heldNotes, pressNote, releaseNote, onEvent } = useNoteSource()
const { status: soundStatus, playChord, playCue } = useSynth()
const { localName, withLocal } = useNoteNames()
const progress = useProgress()

const level = ref(1)
useLastPlace(() => t('home.place.chords', { n: level.value }))
const task = ref<Task>(generateTask(level.value))
const streak = ref(0)
const solved = ref(false)
const hintRequested = ref(false)
// Progressions (level 8) are played chord by chord; this is the chord being played.
const step = ref(0)
// The notes that finished the previous chord: while they are still held, praise instead of
// checking them against the next chord.
const stepDoneWith = ref<string | null>(null)
const heldKey = computed(() => heldNotes.value.join(','))
// Totals live in the database (useProgress), per profile.
const correctIn = (id: number) => progress.levels.value[id]?.correct ?? 0
// Level done (all stars): offer the next level, never force it. "Ещё здесь" stops asking for that level.
const levelDone = ref<number | null>(null)
// When the current task appeared: answer time goes to the attempt log.
let shownAt = performance.now()
const hasNextLevel = computed(() => LEVELS.some((item) => item.id === level.value + 1))

const start = useKeyboardWindow()

const check = computed(() => checkTask(task.value, heldNotes.value, step.value))
// Praise comes at once; «not yet» and «wrong» wait until the fingers have landed, so a chord
// placed key by key does not flash warnings on the way.
const settledHeld = useSettled(heldNotes, (next) => (next.length === 0 ? 0 : SETTLE_MS))
const settledCheck = computed(() => checkTask(task.value, settledHeld.value, step.value))
/**
 * Help (plan step 28) is a switch, not a fade: «С подсказкой» lights the chord's keys and shows its formula and
 * the semitones between the pressed keys. The last phase of a level is its exam: no help at all, and a chord counts
 * only when it sounds as a chord (its keys down together, none extra).
 */
const exam = computed(() => isExam(correctIn(level.value)))
const guideOn = computed(() => progress.guide.value && !exam.value)
/** When each held key went down: the exam asks the chord's keys to land together. */
const downAt = new Map<number, number>()
onEvent((event) => {
  if (event.type === 'noteOn') downAt.set(event.note, performance.now())
  else if (event.type === 'noteOff') downAt.delete(event.note)
})
/** An exam chord played key by key: said once, then the keys go up and it is tried again. */
const notTogether = ref(false)
watch(() => heldNotes.value.length, (count) => {
  if (count === 0) notTogether.value = false
})
const target = computed(() => taskNotes(task.value, start.value, step.value))
const progression = computed(() => (task.value.kind === 'progression' ? task.value : null))

const showHighlight = computed(() => guideOn.value || hintRequested.value)
const stars = computed(() => starsFor(correctIn(level.value)))

let nextTimer: ReturnType<typeof setTimeout> | undefined

function nextTask() {
  clearTimeout(nextTimer)
  task.value = generateTask(level.value, Math.random, task.value)
  step.value = 0
  stepDoneWith.value = null
  shownAt = performance.now()
  solved.value = false
  hintRequested.value = false
}

// Checked on every press and release: letting go of an extra note can solve the task.
watch(() => check.value.status, (status) => {
  if (status !== 'correct' || solved.value || notTogether.value) return
  if (exam.value && task.value.kind !== 'note' && !isCleanChord(heldNotes.value.map((note) => downAt.get(note) ?? 0))) {
    notTogether.value = true
    return
  }
  const steps = progression.value?.steps.length ?? 1
  if (step.value < steps - 1) {
    stepDoneWith.value = heldKey.value
    step.value++
    playCue('step')
    return
  }
  solved.value = true
  const before = correctIn(level.value)
  if (!hintRequested.value) streak.value++
  void progress.record({
    level: level.value,
    task: taskId(task.value, noteName),
    correct: true,
    usedHint: hintRequested.value || guideOn.value,
    ms: performance.now() - shownAt,
    played: heldNotes.value,
    streak: streak.value,
  })
  const allStars = STAR_THRESHOLDS.length
  if (starsFor(before + 1) === allStars && starsFor(before) < allStars && !progress.declinedLevels.value.includes(level.value)) {
    levelDone.value = level.value
    playCue('levelDone')
  } else {
    playCue('success')
  }
})

// Move on once the child lets go of the keys, so the next task starts from silence.
// While the level-done offer is open, wait for the child's choice instead.
watch([solved, () => heldNotes.value.length, levelDone], ([isSolved, count, done]) => {
  if (!isSolved || count > 0 || done !== null) return
  clearTimeout(nextTimer)
  nextTimer = setTimeout(nextTask, NEXT_DELAY_MS)
})

watch(level, (value) => {
  levelDone.value = null
  streak.value = 0
  nextTask()
  void progress.setTrainLevel(value)
})

// Back on the level the child was on (after a reload, or when another profile is chosen).
watch(progress.trainLevel, (saved) => {
  if (saved !== null && saved !== level.value && LEVELS.some((item) => item.id === saved)) level.value = saved
}, { immediate: true })

function goNextLevel() {
  if (hasNextLevel.value) level.value++
}

function stayOnLevel() {
  if (levelDone.value !== null) void progress.declineLevel(levelDone.value)
  levelDone.value = null
}

onBeforeUnmount(() => {
  clearTimeout(nextTimer)
  sequenceTimers.forEach(clearTimeout)
})

function skip() {
  void progress.record({
    level: level.value,
    task: taskId(task.value, noteName),
    correct: false,
    usedHint: hintRequested.value,
    ms: performance.now() - shownAt,
    played: heldNotes.value,
    streak: 0,
  })
  streak.value = 0
  nextTask()
}

const CHORD_GAP_MS = 900
let sequenceTimers: ReturnType<typeof setTimeout>[] = []

function listen() {
  sequenceTimers.forEach(clearTimeout)
  const current = progression.value
  if (!current) {
    playChord(target.value)
    return
  }
  // A progression is played as a whole, so the child hears where it goes.
  sequenceTimers = current.steps.map((_, i) =>
    setTimeout(() => playChord(taskNotes(current, start.value, i), CHORD_GAP_MS - 100), i * CHORD_GAP_MS))
}

function changeLevel(step: number) {
  const next = level.value + step
  if (LEVELS.some((item) => item.id === next) && isLevelOpen(next, correctIn)) level.value = next
}

// MK4 pads (or keys 1-8): play without touching the screen.
usePadActions({
  next: () => {
    if (levelDone.value !== null) stayOnLevel()
    else if (solved.value) nextTask()
  },
  listen: () => {
    if (soundStatus.value === 'ready') listen()
  },
  hint: () => {
    if (!solved.value && !guideOn.value && !exam.value) hintRequested.value = true
  },
  skip: () => {
    if (levelDone.value === null && !solved.value) skip()
  },
  levelDown: () => changeLevel(-1),
  levelUp: () => changeLevel(1),
})

const rootName = computed(() => noteName(task.value.root))

const prompt = computed(() => {
  const current = task.value
  const root = withLocal(rootName.value, localName(current.root))
  if (current.kind === 'note') return t('train.findNote', { note: root })
  if (current.kind === 'progression') return t('train.progression', { key: root })
  if (level.value === 4) return t('train.build', { quality: t(`train.quality.${current.type}`), root })
  const chord = t(`lab.type.${current.type}`, { root })
  if (current.inversion === undefined) return t('train.play', { chord })
  return t('train.playInversion', { chord, inversion: t(`train.inversion.${current.inversion}`) })
})

/** «Мажор = 4 + 3»: the chord's steps in semitones, while the help is on. */
const formula = computed(() => {
  const current = task.value
  if (current.kind !== 'chord' || !guideOn.value) return null
  return t('train.formulaOf', { name: t(`train.formula.${current.type}`), steps: formulaSteps(current.type).join(' + ') })
})

const names = (pcs: readonly number[]) => pcs.map((pc) => noteName(pc)).join(', ')

const feedback = computed(() => {
  if (solved.value) return { tone: 'success' as const, text: t('train.correct') }
  if (notTogether.value) return { tone: 'warning' as const, text: t('train.notTogether') }
  if (stepDoneWith.value !== null && stepDoneWith.value === heldKey.value) {
    return { tone: 'success' as const, text: t('train.stepDone') }
  }
  const { status, missing, extra } = settledCheck.value
  if (status === 'empty' || status === 'correct') return null
  if (task.value.kind === 'note') {
    const played = settledHeld.value.find((note) => pitchClass(note) !== task.value.root)
    if (status === 'wrong' && played !== undefined) {
      return {
        tone: 'warning' as const,
        text: t('train.notThisNote', {
          played: withLocal(midiName(played), localName(played)),
          note: withLocal(rootName.value, localName(task.value.root)),
        }),
      }
    }
    return { tone: 'warning' as const, text: t('train.extra', { notes: names(extra) }) }
  }
  if (status === 'incomplete') return { tone: 'neutral' as const, text: t('train.missing', { n: missing.length }, missing.length) }
  if (status === 'wrongInversion') return { tone: 'warning' as const, text: t('train.wrongInversion') }
  if (status === 'extra') return { tone: 'warning' as const, text: t('train.extra', { notes: names(extra) }) }
  return { tone: 'warning' as const, text: t('train.wrong', { notes: names(extra) }) }
})

// Levels open in order: the next one after the exam of this one.
const levelItems = computed(() => LEVELS.map((item) => ({ label: String(item.id), value: item.id, disabled: !isLevelOpen(item.id, correctIn) })))
</script>

<template>
  <main class="page page--fill train">
    <PageHeader :title="t('trainChoice.chords')" back="/train" :back-label="t('train.title')" />
    <!-- Sound and MK4 state live in the drawer, the map in the footer: the content gets the height. -->
    <Teleport defer to="#footer-tools">
      <OctaveMapButton :window-start="start" show-on-shift />
    </Teleport>
    <Teleport defer to="#page-actions">
      <!-- A grown-up turns the help off when the student is ready; the exam turns it off by itself. -->
      <USwitch
        :model-value="guideOn"
        :disabled="exam"
        size="lg"
        :label="exam ? t('train.guideExam') : t('train.guide')"
        @update:model-value="progress.setGuide($event)"
      />
      <SoundControl />
    </Teleport>
    <Teleport defer to="#drawer-status">
      <MidiStatus />
    </Teleport>

    <div class="flex flex-wrap items-center justify-between gap-4 mt-2">
      <div class="levels">
        <span class="text-muted">{{ t('train.levelLabel') }}</span>
        <UTabs v-model="level" :items="levelItems" :content="false" size="lg" :ui="{ trigger: 'min-w-11 justify-center' }">
          <template #default="{ item }">
            <span class="sr-only">{{ t('train.levelLabel') }}</span> {{ item.label }}
          </template>
        </UTabs>
      </div>
      <div class="flex items-center gap-4">
        <span class="flex gap-1" :aria-label="t('train.stars', { n: stars })">
          <UIcon
            v-for="i in 3"
            :key="i"
            name="i-lucide-star"
            class="size-7 star"
            :class="{ 'star--on': i <= stars }"
          />
        </span>
        <span v-if="exam" class="exam">
          <UIcon name="i-lucide-graduation-cap" class="size-5" />
          {{ t('train.exam') }}
        </span>
        <span class="text-muted tabular-nums">{{ t('train.streak', { n: streak }) }}</span>
      </div>
    </div>

    <!-- Takes the task's place while open, centred in it, so the keyboard stays on screen. -->
    <section v-if="levelDone !== null" class="task level-done" role="status">
      <div class="level-done__card">
        <UIcon name="i-lucide-trophy" class="level-done__icon" />
        <div class="level-done__body">
          <p class="level-done__title text-highlighted">{{ t('train.levelDone', { n: levelDone }) }}</p>
          <p class="text-toned">{{ hasNextLevel ? t('train.levelDoneHint') : t('train.allDone') }}</p>
          <div class="level-done__actions">
            <UButton color="neutral" variant="soft" size="xl" :label="t('train.stay')" @click="stayOnLevel" />
            <UButton v-if="hasNextLevel" icon="i-lucide-arrow-right" size="xl" :label="t('train.nextLevel')" @click="goNextLevel" />
          </div>
        </div>
      </div>
    </section>

    <section v-if="levelDone === null" class="task" :class="{ 'task--solved': solved }" aria-live="polite">
      <p :key="`${task.kind}-${task.root}-${'type' in task ? task.type : ''}`" class="prompt text-highlighted">{{ prompt }}</p>
      <p v-if="formula" class="formula">{{ formula }}</p>
      <ol v-if="progression" class="steps" :aria-label="t('train.stepOf', { n: step + 1, total: progression.steps.length })">
        <li
          v-for="(item, i) in progression.steps"
          :key="i"
          class="step"
          :class="{ 'step--done': i < step || solved, 'step--current': i === step && !solved }"
        >
          {{ item.roman }}
        </li>
        <li class="genre text-muted">{{ t(`train.genre.${progression.progression}`) }}</li>
      </ol>
      <p class="feedback" :class="feedback ? `feedback--${feedback.tone}` : ''">
        <template v-if="feedback">
          <UIcon v-if="feedback.tone === 'success'" name="i-lucide-circle-check" class="size-7" />
          {{ feedback.text }}
        </template>
      </p>
      <div class="flex flex-wrap gap-3">
        <UButton
          v-if="!solved && !guideOn && !exam"
          icon="i-lucide-lightbulb"
          color="neutral"
          variant="soft"
          size="xl"
          :disabled="hintRequested"
          :label="t('train.hint')"
          @click="hintRequested = true"
        >
          <template #trailing>
            <UKbd value="3" size="md" />
          </template>
        </UButton>
        <UButton
          v-if="soundStatus === 'ready'"
          icon="i-lucide-play"
          color="neutral"
          variant="soft"
          size="xl"
          :label="t('sound.listen')"
          @click="listen"
        >
          <template #trailing>
            <UKbd value="2" size="md" />
          </template>
        </UButton>
        <UButton
          v-if="solved"
          icon="i-lucide-arrow-right"
          size="xl"
          :label="t('train.next')"
          @click="nextTask"
        >
          <template #trailing>
            <UKbd value="1" size="md" />
          </template>
        </UButton>
        <UButton
          v-else
          icon="i-lucide-skip-forward"
          color="neutral"
          variant="ghost"
          size="xl"
          :label="t('train.skip')"
          @click="skip"
        >
          <template #trailing>
            <UKbd value="4" size="md" />
          </template>
        </UButton>
      </div>
    </section>

    <PianoKeyboard
      :start="start"
      :held="heldNotes"
      :hint="showHighlight && !solved ? target : []"
      show-names
      context-names
      :show-intervals="guideOn"
      @press="pressNote"
      @release="releaseNote"
    />
  </main>
</template>

<style scoped>
/* The exam: calm, but clearly another phase. */
.exam {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-weight: 600;
  color: var(--color-attention);
  box-shadow: 0 0 0 var(--ring-width) var(--color-attention) inset;
}

/* Takes the task's place while open, so the keyboard stays on screen */
.level-done {
  align-items: center;
}

.level-done__card {
  display: flex;
  align-items: center;
  gap: clamp(1rem, 3vw, 2rem);
  max-width: 48rem;
  padding: 1.25rem clamp(1.25rem, 3vw, 2rem);
  border-radius: 1.5rem;
  background: color-mix(in oklab, var(--color-correct) 12%, var(--ui-bg-elevated));
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--color-correct) 40%, transparent) inset;
  animation: pop 240ms var(--ease-out);
}

.level-done__icon {
  flex: none;
  width: clamp(3.5rem, 10vh, 5rem);
  height: clamp(3.5rem, 10vh, 5rem);
  color: var(--color-attention);
}

.level-done__body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
}

.level-done__title {
  font-family: var(--font-display);
  font-size: clamp(1.375rem, 2.6vw, 1.875rem);
  font-weight: 800;
  line-height: 1.15;
  text-wrap: balance;
}

.level-done__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.25rem;
}

.levels {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: 100%;
  /* Narrow screens: the tab row scrolls instead of widening the page */
  overflow-x: auto;
  overscroll-behavior-x: contain;
}

.star {
  color: var(--star-off);
  transition: color 200ms ease;
}

.star--on {
  color: var(--color-attention);
}

/* Lucide puts fill="none" on the path itself */
.star--on :deep(path) {
  fill: currentColor;
}

.task {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1rem;
  min-height: 15rem;
  padding-block: 1.5rem;
}

.prompt {
  font-family: var(--font-display);
  font-size: clamp(2.25rem, 6vw, 4rem);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.02em;
  /* A new task slides in once: the eye sees that the question changed */
  animation: task-in 260ms var(--ease-out);
}

.task--solved .prompt {
  color: var(--color-correct);
  transition: color 160ms ease;
}

.steps {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.step {
  min-width: 4.5rem;
  padding: 0.5rem 1rem;
  border-radius: 0.875rem;
  text-align: center;
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--ui-text-muted);
  background: var(--rubber);
  box-shadow: 0 0 0 1px var(--rubber-edge) inset;
  transition: background-color 160ms ease, color 160ms ease;
}

.step--current {
  color: var(--color-on-fill);
  background: var(--color-active);
  box-shadow: none;
}

.step--done {
  color: var(--color-on-fill);
  background: var(--color-correct);
  box-shadow: none;
}

.genre {
  font-size: 1rem;
}

.formula {
  align-self: flex-start;
  padding: 0.375rem 0.875rem;
  border-radius: 999px;
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-on-fill);
  background: var(--color-active);
}

.feedback {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.25rem;
  font-size: 1.375rem;
  font-weight: 500;
}

.feedback--neutral { color: var(--ui-text-muted); }
.feedback--warning { color: color-mix(in oklab, var(--color-wrong) 85%, var(--ui-text)); }

.feedback--success {
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--color-correct);
  animation: pop 240ms var(--ease-out);
}

@keyframes task-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

@keyframes pop {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
}

@media (prefers-reduced-motion: reduce) {
  .prompt,
  .feedback--success,
  .level-done__card {
    animation-name: fade;
  }

  @keyframes fade {
    from { opacity: 0; }
  }
}
</style>
