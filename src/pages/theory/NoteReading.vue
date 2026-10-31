<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import PianoKeyboard from '@/components/PianoKeyboard.vue'
import RhythmStaff from '@/components/RhythmStaff.vue'
import { useKeyboardWindow } from '@/composables/useKeyboardWindow'
import { useMk4Actions } from '@/composables/useMk4Actions'
import { useNoteSource } from '@/composables/useNoteSource'
import { useRhythmPlayer } from '@/composables/useRhythmPlayer'
import { useShortScreen } from '@/composables/useShortScreen'
import { useTimedPresses } from '@/composables/useTimedPresses'
import { makeMelody, readMarks, readingPasses, type NoteLevel, type ReadMark } from '@/lib/noteLevels'
import { quarterSeconds, scoreRhythm, sounds, type Rhythm, type RhythmScore, type TimingVerdict } from '@/lib/rhythm'
import { octaveShift } from '@/lib/staff'

// «Теория» → «Ноты», «Читаем с ритмом» (plan step 19): a short melody on the staff, read in rhythm with the
// metronome. One bar of count-in, then the child plays; every note is judged for its key and its time, like a
// teacher reading along: green right, yellow the right key off time, red a wrong key or a note not played.

const props = defineProps<{
  level: NoteLevel
  /** The level got its last star with this melody: the page shows what comes next. */
  levelDone: boolean
  /** Where play and listen go: a place in the level row of the page. */
  actionsTo: string
}>()

const emit = defineEmits<{
  passed: []
}>()

/** Seconds after the last note before the attempt is scored: a late last tap still counts. */
const SCORE_TAIL_MS = 400

const { t } = useI18n()
const player = useRhythmPlayer()
const { heldNotes, pressNote, releaseNote } = useNoteSource()
const windowStart = useKeyboardWindow()
const short = useShortScreen()

const bpm = computed(() => props.level.readingBpm ?? 60)
const melody = shallowRef<Rhythm>(makeMelody(props.level))
const phase = ref<'ready' | 'playing' | 'result'>('ready')
const score = shallowRef<RhythmScore | null>(null)
const passed = ref(false)
/** This melody already counted once; playing it again is fine practice. */
let counted = false
let finishTimer: ReturnType<typeof setTimeout> | undefined

const timed = useTimedPresses({ active: () => phase.value === 'playing', heardPosition: () => player.heardPosition() })

function start() {
  clearTimeout(finishTimer)
  timed.reset()
  score.value = null
  phase.value = 'playing'
  liveRight.value = {}
  player.play(melody.value, bpm.value, { notes: false })
}

function listen() {
  if (phase.value === 'playing') return
  player.play(melody.value, bpm.value)
}

function next() {
  player.stop()
  melody.value = makeMelody(props.level, Math.random)
  counted = false
  score.value = null
  phase.value = 'ready'
}

// The MK4's transport (plan step 26): ■/▶ plays or stops, Loop and ● start again.
useMk4Actions({
  playStop: () => {
    if (phase.value !== 'playing') start()
    else {
      player.stop()
      phase.value = 'ready'
    }
  },
  again: () => start(),
  record: () => start(),
})

watch(() => player.playing.value, (on) => {
  if (on || phase.value !== 'playing') return
  finishTimer = setTimeout(finish, SCORE_TAIL_MS)
})

function finish() {
  const presses = timed.presses()
  const checkHold = presses.length > 0 && presses.every((press) => press.end !== null)
  const result = scoreRhythm(sounds(melody.value, bpm.value), presses, checkHold)
  score.value = result
  passed.value = readingPasses(melody.value, result)
  phase.value = 'result'
  if (passed.value && !counted) {
    counted = true
    emit('passed')
  }
}

onBeforeUnmount(() => {
  clearTimeout(finishTimer)
  player.stop()
})

const marks = computed(() => (score.value ? readMarks(melody.value, score.value) : {}))
/** The staff colours: green, yellow, red. */
const COLOUR_OF: Record<ReadMark, TimingVerdict> = { right: 'onTime', off: 'late', wrongKey: 'missed', missed: 'missed' }
const staffMarks = computed(() => Object.fromEntries(Object.entries(marks.value).map(([index, mark]) => [index, COLOUR_OF[mark]])))

/** While playing, a note turns green as soon as its key is pressed near its time (owner's rule); the full result comes after. */
const liveRight = ref<Record<number, TimingVerdict>>({})
/** A press counts for the nearest note within this many seconds, as in the scoring. */
const LIVE_WINDOW_S = 0.25
watch(heldNotes, (held, before) => {
  if (phase.value !== 'playing') return
  const now = player.heardPosition()
  const notes = sounds(melody.value, bpm.value).filter((item) => !item.rest)
  for (const key of held.filter((item) => !before.includes(item))) {
    const nearest = notes.reduce<typeof notes[number] | null>((best, item) => (!best || Math.abs(item.start - now) < Math.abs(best.start - now) ? item : best), null)
    if (nearest && Math.abs(nearest.start - now) <= LIVE_WINDOW_S && nearest.key === key) liveRight.value = { ...liveRight.value, [nearest.index]: 'onTime' }
  }
})
/** What to fix first: a wrong key, then a note not played, then the time. */
const advice = computed(() => {
  const all = Object.values(marks.value)
  if (passed.value) return t('theory.notes.reading.passed')
  if (timed.presses().length === 0) return t('theory.hints.noTaps')
  if (all.includes('wrongKey')) return t('theory.notes.reading.wrongKey')
  if (all.includes('missed')) return t('theory.notes.reading.missed')
  return t('theory.notes.reading.time')
})
const shiftNeeded = computed(() => Math.max(...melody.value.notes.map((note) => (note.key === undefined ? 0 : Math.abs(octaveShift(note.key, windowStart.value))))))

/** Count-in beat shown big while the child waits for the first note. */
const countIn = ref<number | null>(null)
let countFrame = 0
function followCountIn() {
  const position = player.heardPosition()
  const beat = quarterSeconds(bpm.value, melody.value.meter) * (4 / melody.value.meter.denominator)
  countIn.value = phase.value === 'playing' && position < 0 ? melody.value.meter.numerator - Math.floor(-position / beat) : null
  countFrame = requestAnimationFrame(followCountIn)
}
countFrame = requestAnimationFrame(followCountIn)
onBeforeUnmount(() => cancelAnimationFrame(countFrame))
</script>

<template>
  <section class="task">
    <div>
      <p class="prompt text-highlighted">{{ t('theory.notes.reading.prompt', { bpm }) }}</p>
      <p class="how text-toned">{{ t('theory.notes.reading.how') }}</p>
    </div>
    <div class="staff-box">
      <RhythmStaff
        :rhythm="melody"
        :scale="short ? 1.35 : 1.7"
        counts
        :current="phase === 'playing' ? player.current.value : null"
        :marks="phase === 'result' ? staffMarks : phase === 'playing' ? liveRight : undefined"
      />
      <span v-if="countIn !== null" class="count-in" aria-live="assertive">{{ countIn }}</span>
    </div>
    <p v-if="shiftNeeded && phase !== 'playing'" class="pill pill--octave" role="status">{{ t('theory.notes.reading.octave') }}</p>
    <div v-if="phase === 'result'" class="result" :class="passed ? 'result--passed' : 'result--again'" role="status">
      <p class="result__title">{{ passed ? t('theory.passed') : t('theory.again') }}</p>
      <p class="text-toned">{{ advice }}</p>
    </div>
  </section>

  <!-- Play and listen sit in the level row, next to the stars (owner's choice): the card keeps its height. -->
  <Teleport defer :to="actionsTo">
    <UButton icon="i-lucide-ear" color="neutral" variant="soft" size="xl" :label="t('theory.listen')" :disabled="phase === 'playing'" @click="listen" />
    <template v-if="phase === 'result' && passed">
      <UButton icon="i-lucide-rotate-ccw" color="neutral" variant="soft" size="xl" :label="t('theory.again')" @click="start" />
      <UButton icon="i-lucide-arrow-right" size="xl" :label="t('theory.next')" @click="next" />
    </template>
    <UButton
      v-else
      :icon="phase === 'playing' ? 'i-lucide-square' : 'i-lucide-play'"
      size="xl"
      :label="phase === 'playing' ? t('theory.stop') : phase === 'result' ? t('theory.again') : t('theory.play')"
      @click="phase === 'playing' ? (player.stop(), phase = 'ready') : start()"
    />
  </Teleport>

  <!-- What comes after the level's last star: the piece and the next level. -->
  <div v-if="levelDone && phase === 'result'" class="controls">
    <slot name="done" />
  </div>

  <PianoKeyboard class="note-keys" :start="windowStart" :held="heldNotes" @press="pressNote" @release="releaseNote" />
</template>

<style scoped src="./theory.css"></style>

<style scoped>
.staff-box {
  position: relative;
  min-height: 8rem;
  display: flex;
  align-items: center;
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

.pill {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  padding: 0.5rem 0.875rem;
  border-radius: 999px;
  font-weight: 600;
  color: var(--ui-text-highlighted);
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 var(--ring-width) var(--color-active) inset;
}

.note-keys {
  --keys-height: clamp(7rem, 22vh, 11rem);
  width: 100%;
  margin-top: 0.75rem;
}
</style>
