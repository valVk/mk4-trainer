<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import NoteStaff, { type StaffNote } from '@/components/NoteStaff.vue'
import OctaveMap from '@/components/OctaveMap.vue'
import PianoKeyboard from '@/components/PianoKeyboard.vue'
import PianoMap from '@/components/PianoMap.vue'
import { STAFF_COLOURS } from '@/components/staffDrawing'
import { useKeyboardWindow } from '@/composables/useKeyboardWindow'
import { useNoteNames } from '@/composables/useNoteNames'
import { useNoteSource } from '@/composables/useNoteSource'
import { useProgress } from '@/composables/useProgress'
import { SETTLE_MS, useSettled } from '@/composables/useSettled'
import { useShortScreen } from '@/composables/useShortScreen'
import { useSynth } from '@/composables/useSynth'
import { useTheoryPieces } from '@/composables/useTheoryPieces'
import { useWakeLock } from '@/composables/useWakeLock'
import { KEYBOARD_KEYS } from '@/lib/keyboard'
import { STAR_THRESHOLDS } from '@/lib/levels'
import { NOTE_LEVELS, checkNote, countsForStars, currentNoteLevel, isNoteLevelOpen, nextNote, noteStars, type NoteIntroId } from '@/lib/noteLevels'
import { KEY_HINT_DELAY_MS } from '@/lib/practice'
import { octaveShift, pitch, windowOctaves } from '@/lib/staff'
import { pitchClass } from '@/lib/theory'

// «Теория» → «Ноты» (plan step 19): a note on the staff (or its name on the first level) → press the key.
// Praise at once; «not this one» only after the fingers have settled; the key lights up only after the
// child has had time to look for it. Exact-octave levels say which octave button the MK4 needs.

/** Pause after a right note before the next one, once the keys are up. */
const NEXT_DELAY_MS = 700

const { t } = useI18n()
useWakeLock()
const progress = useProgress()
const { heldNotes, pressNote, releaseNote, shiftOctave } = useNoteSource()
const { playCue } = useSynth()
const { localName } = useNoteNames()
const windowStart = useKeyboardWindow()
const { piecesAfter } = useTheoryPieces('notes')
const short = useShortScreen()

const passed = computed(() => progress.noteProgress.value)
const level = ref(currentNoteLevel(passed.value))
const info = computed(() => NOTE_LEVELS.find((item) => item.id === level.value)!)
const stars = computed(() => noteStars(passed.value, level.value))
const levelTabs = computed(() => NOTE_LEVELS.map((item) => ({ id: item.id, open: isNoteLevelOpen(item.id, passed.value), stars: noteStars(passed.value, item.id) })))

// Progress comes from the database a moment after the page opens: start on the child's level then.
let settledLevel = false
watch(passed, (value) => {
  if (settledLevel) return
  settledLevel = true
  level.value = currentNoteLevel(value)
})

const introSeen = ref(new Set<number>())
const phase = ref<'intro' | 'task'>('task')
const target = ref(nextNote(info.value, null))
const solved = ref(false)
const levelDone = ref(false)
const keyHint = ref(false)
/** A right answer on the timed level that came too late for a star. */
const slowAnswer = ref(false)
/** Counts the notes shown, so the timer bar restarts for each. */
const taskNumber = ref(0)
let shownAt = performance.now()
let hintTimer: ReturnType<typeof setTimeout> | undefined
let nextTimer: ReturnType<typeof setTimeout> | undefined

function newTask(previous: number | null) {
  clearTimeout(nextTimer)
  clearTimeout(hintTimer)
  target.value = nextNote(info.value, previous)
  solved.value = false
  slowAnswer.value = false
  keyHint.value = false
  taskNumber.value++
  shownAt = performance.now()
  // On the timed level the key never lights up: it would give the answer away.
  if (info.value.timed === undefined) {
    hintTimer = setTimeout(() => {
      keyHint.value = true
    }, KEY_HINT_DELAY_MS)
  }
}

function openLevel(id: number) {
  if (!isNoteLevelOpen(id, passed.value)) return
  level.value = id
}

watch(level, () => {
  levelDone.value = false
  phase.value = info.value.introduces.length && !introSeen.value.has(level.value) ? 'intro' : 'task'
  newTask(null)
}, { immediate: true })

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

const check = computed(() => checkNote(target.value, presses.value, info.value.anyOctave))
// «Wrong» and «other octave» wait until the fingers have landed.
const settledHeld = useSettled(heldNotes, (next) => (next.length === 0 ? 0 : SETTLE_MS))
const settledCheck = computed(() => (settledHeld.value.length === 0 ? 'empty' : check.value))

watch(check, (status) => {
  if (status !== 'right' || solved.value || phase.value !== 'task') return
  solved.value = true
  clearTimeout(hintTimer)
  // Right is always praised; on the timed level a slow answer just does not count towards the stars.
  if (!countsForStars(info.value, performance.now() - shownAt)) {
    slowAnswer.value = true
    playCue('success')
    return
  }
  const before = noteStars(passed.value, level.value)
  void progress.addNoteCorrect(level.value).then(() => {
    const done = before < STAR_THRESHOLDS.length && noteStars(passed.value, level.value) === STAR_THRESHOLDS.length
    levelDone.value = done
    playCue(done ? 'levelDone' : 'success')
  })
})

// Next note once the keys are up, so it starts from silence; the level-done card waits for the child.
watch([solved, () => heldNotes.value.length, levelDone], ([isSolved, count, done]) => {
  if (!isSolved || count > 0 || done) return
  clearTimeout(nextTimer)
  nextTimer = setTimeout(() => newTask(target.value), NEXT_DELAY_MS)
})

onBeforeUnmount(() => {
  clearTimeout(nextTimer)
  clearTimeout(hintTimer)
})

/** Octave buttons the target needs on an exact level; 0 when it is under the hands (or any octave counts). */
const shiftNeeded = computed(() => (info.value.anyOctave ? 0 : octaveShift(target.value, windowStart.value)))
/** The key to light up as a hint: the target itself, or on «any octave» the same note inside the window. */
const hintKey = computed(() => {
  if (!info.value.anyOctave) return shiftNeeded.value === 0 ? target.value : null
  for (let key = windowStart.value; key < windowStart.value + KEYBOARD_KEYS; key++) if (pitchClass(key) === pitchClass(target.value)) return key
  return null
})

/** Keys on the screen while a task runs, and in the octave-map intro, which is played with. */
const keysShown = computed(() => phase.value === 'task' || info.value.introduces.includes('ledgers'))

const name = (key: number) => localName(pitchClass(key))
const staffNotes = computed<StaffNote[]>(() => [{ key: target.value, label: solved.value ? name(target.value) : undefined, colour: solved.value ? STAFF_COLOURS.onTime : undefined }])
const underHands = computed(() => windowOctaves(windowStart.value).map((item) => t(`theory.octaves.${item}`)).join(t('theory.notes.and')))

const NAMES = 'C4 D4 E4 F4 G4 A4 B4'.split(' ').map(pitch)
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
/** Landmarks shown in the intros, with their names. */
const landmarks = (names: string): StaffNote[] => names.split(' ').map(pitch).map((key) => ({ key, label: name(key) }))
const INTRO_NOTES: Partial<Record<NoteIntroId, { show: 'treble' | 'bass' | 'grand', notes: () => StaffNote[] }>> = {
  treble: { show: 'treble', notes: () => landmarks('C4 G4 G5') },
  bass: { show: 'bass', notes: () => landmarks('F2 F3 C4') },
  grand: { show: 'grand', notes: () => landmarks('C3 F3 C4 G4 C5') },
  timed: { show: 'grand', notes: () => landmarks('D3 A3 E4 B4') },
}
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
          <span>{{ t('theory.notes.levelTab', { n: tab.id }) }}</span>
          <UIcon v-if="!tab.open" name="i-lucide-lock" class="size-3" />
        </button>
        <!-- The piece after this group of levels, open with the level's last star (as in «Ритм»). -->
        <template v-for="piece in piecesAfter(tab.id)" :key="piece.id">
          <RouterLink v-if="piece.to && tab.stars === 3" :to="piece.to" class="level level--piece" :aria-label="t('theory.playPiece', { name: piece.title })">
            <UIcon name="i-lucide-music" class="size-4" />
          </RouterLink>
          <span v-else class="level level--piece level--closed" role="img" :aria-label="t('theory.notes.pieceLocked', { name: piece.title, n: tab.id })">
            <UIcon name="i-lucide-music" class="size-3.5" />
            <UIcon name="i-lucide-lock" class="size-3" />
          </span>
        </template>
      </template>
    </div>
    <span class="stars" :aria-label="t('train.stars', { n: stars })">{{ '★'.repeat(stars) }}<span class="stars__off">{{ '★'.repeat(3 - stars) }}</span></span>
  </div>

  <section class="task">
    <template v-if="phase === 'intro'">
      <p class="prompt text-highlighted">{{ t('theory.intro.title') }}</p>
      <div class="intro">
        <div v-for="id in info.introduces" :key="id" class="intro__item" :class="{ 'intro__item--wide': id === 'keyboard' || id === 'names' || id === 'ledgers' }">
          <PianoMap v-if="id === 'keyboard'" :window-start="windowStart" class="intro__map" />
          <!-- Live: press Octave + or − and keys, and watch the band and the notes move. -->
          <OctaveMap v-else-if="id === 'ledgers'" :window-start="windowStart" :held="heldNotes" :scale="short ? 0.7 : 0.9" />
          <div v-else-if="id === 'names'" class="names">
            <span v-for="(key, i) in NAMES" :key="key" class="names__item">
              <span class="names__local">{{ name(key) }}</span>
              <span class="names__letter text-muted">{{ LETTERS[i] }}</span>
            </span>
          </div>
          <NoteStaff v-else-if="INTRO_NOTES[id]" :notes="INTRO_NOTES[id]!.notes()" :show="INTRO_NOTES[id]!.show" :scale="1.4" class="intro__staff" />
          <p class="text-toned">{{ t(`theory.notes.intro.${id}`) }}</p>
        </div>
      </div>
    </template>

    <template v-else>
      <p class="prompt text-highlighted">
        {{ info.show === 'name' ? t('theory.notes.pressName') : info.anyOctave ? t('theory.notes.findAny') : t('theory.notes.findExact') }}
      </p>
      <p v-if="info.show === 'name'" class="big-name" :class="{ 'big-name--right': solved }">{{ name(target) }}</p>
      <NoteStaff v-else :notes="staffNotes" :show="info.show" :scale="info.show === 'grand' ? 1.7 : 2.2" fit class="task__staff" />
      <!-- Calm pills over the card, never pushing the layout. -->
      <!-- Time for a star: a calm bar that empties, no countdown numbers and nothing red. -->
      <span v-if="info.timed && !solved" :key="taskNumber" class="timer" :style="{ animationDuration: `${info.timed}ms` }" aria-hidden="true" />
      <p v-if="slowAnswer" class="pill" role="status">{{ t('theory.notes.slow', { s: Math.round(info.timed! / 1000) }) }}</p>
      <p v-else-if="shiftNeeded !== 0 && !solved" class="pill pill--octave" role="status">
        {{ shiftNeeded > 0 ? t('theory.notes.octaveUp') : t('theory.notes.octaveDown') }}
      </p>
      <p v-else-if="settledCheck === 'octave' && !solved" class="pill" role="status">{{ t('theory.notes.otherOctave') }}</p>
      <p v-else-if="settledCheck === 'wrong' && !solved" class="pill" role="status">{{ t('theory.notes.notThis') }}</p>
    </template>

    <div v-if="levelDone" class="result result--passed" role="status">
      <p class="result__title">{{ t('theory.notes.levelDone', { n: level }) }}</p>
    </div>
  </section>

  <div class="controls">
    <UButton v-if="phase === 'intro'" icon="i-lucide-check" size="xl" :label="t('theory.intro.ok')" @click="closeIntro" />
    <template v-else>
      <template v-if="levelDone">
        <template v-for="piece in piecesAfter(level)" :key="piece.id">
          <UButton v-if="piece.to" :to="piece.to" icon="i-lucide-music" size="xl" color="success" :label="t('theory.playPiece', { name: piece.title })" />
        </template>
      </template>
      <UButton v-if="levelDone && isNoteLevelOpen(level + 1, passed)" icon="i-lucide-arrow-right" size="xl" :label="t('theory.nextLevel')" @click="openLevel(level + 1)" />
      <UButton v-if="levelDone" icon="i-lucide-rotate-ccw" color="neutral" variant="soft" size="xl" :label="t('theory.notes.stay')" @click="levelDone = false" />
    </template>
    <template v-if="keysShown">
      <span class="hands text-toned">{{ t('theory.notes.underHands', { octaves: underHands }) }}</span>
      <!-- The same as the Octave buttons of the MK4, for the keys on the screen. -->
      <UButton icon="i-lucide-minus" color="neutral" variant="soft" size="lg" :aria-label="t('theory.notes.screenOctaveDown')" @click="shiftOctave(-1)" />
      <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="lg" :aria-label="t('theory.notes.screenOctaveUp')" @click="shiftOctave(1)" />
    </template>
  </div>

  <PianoKeyboard
    v-if="keysShown"
    class="note-keys"
    :class="{ 'note-keys--low': phase === 'intro' }"
    :start="windowStart"
    :held="heldNotes"
    :hint="phase === 'task' && keyHint && !solved && hintKey !== null ? [hintKey] : []"
    @press="pressNote"
    @release="releaseNote"
  />
</template>

<style scoped src="./theory.css"></style>

<style scoped>
.task__staff {
  flex: 1;
  min-height: 6rem;
  width: min(100%, 36rem);
  align-self: center;
}

.intro__staff {
  width: min(100%, 26rem);
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

.big-name--right {
  color: var(--color-pad-aqua);
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
  box-shadow: 0 0 0 2px var(--color-pad-sky) inset;
}

.hands {
  margin-left: auto;
  font-weight: 600;
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
