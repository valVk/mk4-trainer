<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import NoteStaff, { type StaffNote } from '@/components/NoteStaff.vue'
import { useSynth } from '@/composables/useSynth'
import { keyOf } from '@/lib/accidentals'
import type { IntervalId } from '@/lib/intervals'
import type { IntervalChoice } from '@/lib/noteLevels'

// «Теория» → «Интервалы», by ear and by notes (plan step 21): the interval sounds or stands on the staff, the child
// taps its name. A wrong name just greys out and the child tries again; the right one turns green. When reading, a
// note turns green once its key is pressed, so the child can find both on the keys before counting.

const props = defineProps<{
  choice: IntervalChoice
  /** Read from the staff instead of heard. */
  read: boolean
  solved: boolean
}>()

const emit = defineEmits<{
  right: []
}>()

/** Gap between the two notes of a melodic interval, and how long each sounds. */
const NOTE_MS = 700
/** A moment after the task appears before it sounds, so it is not lost in the previous answer's chime. */
const FIRST_PLAY_MS = 400

const { t } = useI18n()
const { status: soundStatus, playChord } = useSynth()

const wrong = ref<IntervalId[]>([])
let timers: ReturnType<typeof setTimeout>[] = []

const keys = computed(() => [keyOf(props.choice.low), keyOf(props.choice.high)])

function listen() {
  timers.forEach(clearTimeout)
  timers = []
  if (props.choice.harmonic) {
    playChord(keys.value, NOTE_MS * 2)
    return
  }
  playChord([keys.value[0]!], NOTE_MS)
  timers.push(setTimeout(() => playChord([keys.value[1]!], NOTE_MS), NOTE_MS))
}

watch(() => props.choice, () => {
  wrong.value = []
  if (!props.read) timers.push(setTimeout(listen, FIRST_PLAY_MS))
}, { immediate: true })

onBeforeUnmount(() => timers.forEach(clearTimeout))

function answer(id: IntervalId) {
  if (props.solved || wrong.value.includes(id)) return
  if (id === props.choice.answer) emit('right')
  else wrong.value = [...wrong.value, id]
}

const lastWrong = computed(() => wrong.value[wrong.value.length - 1] ?? null)
const staffNotes = computed<StaffNote[]>(() => [props.choice.low, props.choice.high].map((note) => ({ key: keyOf(note), written: note })))
</script>

<template>
  <NoteStaff v-if="read" :notes="staffNotes" show="treble" playable :scale="2" fit class="choice__staff" />
  <div v-else class="choice__ear">
    <UButton icon="i-lucide-ear" color="neutral" variant="soft" size="xl" :label="t('theory.intervals.listenAgain')" @click="listen" />
    <p v-if="soundStatus !== 'ready'" class="text-toned">{{ t('theory.intervals.needSound') }}</p>
  </div>
  <div class="choice__options" role="group" :aria-label="t('theory.intervals.optionsLabel')">
    <button
      v-for="id in choice.options"
      :key="id"
      type="button"
      class="option"
      :class="{ 'option--wrong': wrong.includes(id), 'option--right': solved && id === choice.answer }"
      :disabled="wrong.includes(id)"
      @click="answer(id)"
    >
      {{ t(`theory.intervals.names.${id}`) }}
    </button>
  </div>
  <p v-if="lastWrong && !solved" class="pill" role="status">{{ t(read ? 'theory.intervals.notThisRead' : 'theory.intervals.notThis', { name: t(`theory.intervals.names.${lastWrong}`) }) }}</p>
</template>

<style scoped>
.choice__staff {
  flex: 1;
  min-height: 5rem;
  width: min(100%, 30rem);
  align-self: center;
}

.choice__ear {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.choice__options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.75rem;
}

.option {
  min-height: 3.5rem;
  padding: 0.5rem 1rem;
  border-radius: 0.875rem;
  font-family: var(--font-display);
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--ui-text-highlighted);
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset, 0 4px 0 var(--ui-border);
  transition: transform 80ms ease-out, opacity 150ms ease;
}

.option:active:not(:disabled) {
  transform: translateY(3px);
}

/* Calm: a wrong name fades, nothing red or loud. */
.option--wrong {
  opacity: 0.4;
}

.option--right {
  color: #fff;
  background: var(--color-pad-aqua);
  box-shadow: none;
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
</style>
