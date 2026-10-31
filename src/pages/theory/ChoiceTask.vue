<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import NoteStaff, { type StaffNote } from '@/components/NoteStaff.vue'
import { useSynth } from '@/composables/useSynth'

// A task answered with buttons («Теория»: an interval by ear or by notes, step 21; a key by its signature, step 22).
// What to answer sounds, or stands on the staff; the child taps its name. A wrong name just greys out and the child
// tries again; the right one turns green. Notes on the staff light up when their keys are pressed.

export interface ChoiceOption {
  id: string
  label: string
}

const props = defineProps<{
  options: readonly ChoiceOption[]
  answer: string
  solved: boolean
  /** Notes to read; without them the task is heard. */
  staffNotes?: readonly StaffNote[]
  keySignature?: string
  /** What to hear: keys one after the other, or together. */
  sound?: { keys: readonly number[], together: boolean }
  /** Text on a wrong answer, given its label. */
  wrongText: (label: string) => string
}>()

const emit = defineEmits<{
  right: []
}>()

/** Gap between the notes heard one after the other, and how long each sounds. */
const NOTE_MS = 700
/** A moment after the task appears before it sounds, so it is not lost in the previous answer's chime. */
const FIRST_PLAY_MS = 400

const { t } = useI18n()
const { status: soundStatus, playChord } = useSynth()

const wrong = ref<string[]>([])
let timers: ReturnType<typeof setTimeout>[] = []

function listen() {
  timers.forEach(clearTimeout)
  timers = []
  const sound = props.sound
  if (!sound) return
  if (sound.together) {
    playChord(sound.keys, NOTE_MS * 2)
    return
  }
  sound.keys.forEach((key, i) => timers.push(setTimeout(() => playChord([key], NOTE_MS), i * NOTE_MS)))
}

watch(() => [props.answer, props.options], () => {
  wrong.value = []
  // Heard tasks sound by themselves; a staff with sound (a bar to harmonise) too.
  if (props.sound) timers.push(setTimeout(listen, FIRST_PLAY_MS))
}, { immediate: true })

onBeforeUnmount(() => timers.forEach(clearTimeout))

function choose(id: string) {
  if (props.solved || wrong.value.includes(id)) return
  if (id === props.answer) emit('right')
  else wrong.value = [...wrong.value, id]
}

const lastWrong = computed(() => props.options.find((option) => option.id === wrong.value[wrong.value.length - 1]) ?? null)
</script>

<template>
  <NoteStaff v-if="staffNotes" :notes="staffNotes" show="treble" :key-signature="keySignature" playable :scale="2" fit class="choice__staff" />
  <div v-if="sound" class="choice__ear" :class="{ 'choice__ear--small': staffNotes }">
    <UButton icon="i-lucide-ear" color="neutral" variant="soft" :size="staffNotes ? 'lg' : 'xl'" :label="t('theory.choice.listenAgain')" @click="listen" />
    <p v-if="soundStatus !== 'ready'" class="text-toned">{{ t('theory.choice.needSound') }}</p>
  </div>
  <div class="choice__options" role="group" :aria-label="t('theory.choice.optionsLabel')">
    <button
      v-for="option in options"
      :key="option.id"
      type="button"
      class="option"
      :class="{ 'option--wrong': wrong.includes(option.id), 'option--right': solved && option.id === answer }"
      :disabled="wrong.includes(option.id)"
      @click="choose(option.id)"
    >
      {{ option.label }}
    </button>
  </div>
  <p v-if="lastWrong && !solved" class="pill" role="status">{{ wrongText(lastWrong.label) }}</p>
</template>

<style scoped>
.choice__staff {
  flex: 1;
  min-height: 5rem;
  width: min(100%, 30rem);
  align-self: center;
}

.choice__ear--small {
  flex: 0 0 auto;
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
  min-height: 3.25rem;
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
  color: var(--color-on-fill);
  background: var(--color-correct);
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
