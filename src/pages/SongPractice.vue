<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import NoteFall from '@/components/NoteFall.vue'
import PianoKeyboard from '@/components/PianoKeyboard.vue'
import SoundControl from '@/components/SoundControl.vue'
import { useNoteNames } from '@/composables/useNoteNames'
import { useNoteSource } from '@/composables/useNoteSource'
import { useProgress } from '@/composables/useProgress'
import { LEARNER_CHANNEL, useSongPlayer } from '@/composables/useSongPlayer'
import { useSynth } from '@/composables/useSynth'
import { useWakeLock } from '@/composables/useWakeLock'
import { findName, groupOf } from '@/lib/instruments'
import { rangeStartFor } from '@/lib/keyboard'
import { chooseWindow, coversStep, octaveHint, stepIndexAt, upcomingKeys } from '@/lib/practice'
import { parseSong, type Part, type Song } from '@/lib/song'
import { chordSymbol, identifyChord, midiName, noteName } from '@/lib/theory'

type Mode = 'wait' | 'listen'

/** A press up to this long before a step counts for it, so playing a hair early does not stop the song. */
const EARLY_S = 0.35
/** Bars of lead-in before the part's first note. */
const LEAD_IN_BARS = 2
const RATES = [0.5, 0.6, 0.8, 1] as const

const { t } = useI18n()
useWakeLock()
const route = useRoute()
const progress = useProgress()
const synth = useSynth()
const player = useSongPlayer()
const { heldNotes, onEvent, pressNote, releaseNote } = useNoteSource()
const { localName, withLocal } = useNoteNames()

const record = shallowRef<{ name: string, data: ArrayBuffer, fileName: string } | null>(null)
const song = shallowRef<Song | null>(null)
const part = shallowRef<Part | null>(null)
const notFound = ref(false)

const mode = ref<Mode>('wait')
const anyOctave = ref(false)
const rate = ref<(typeof RATES)[number]>(0.6)
const windowStart = ref(48)
const pendingIndex = ref(0)
const waiting = ref(false)
const done = ref(false)
/** Keys pressed since the current step became the one to play. */
let pressed = new Set<number>()
/** Recent presses, for the octave hint. */
const recent = ref<number[]>([])

async function open() {
  await progress.init()
  const found = await progress.loadSong(Number(route.params.id))
  const channel = Number(route.params.channel)
  const parsed = found ? parseSong(found.data, found.fileName) : null
  const chosen = parsed?.parts.find((item) => item.channel === channel && !item.isDrum)
  if (!found || !parsed || !chosen) {
    notFound.value = true
    return
  }
  record.value = found
  song.value = parsed
  part.value = chosen
  windowStart.value = chooseWindow(rangeStartFor(chosen.range.low), upcomingKeys(chosen.steps, 0, Infinity).slice(0, 40))
}
void open()

const steps = computed(() => part.value?.steps ?? [])
const startTime = computed(() => {
  const current = song.value
  const first = steps.value[0]?.time ?? 0
  if (!current) return 0
  const barLength = (current.bars[1] ?? 2) - (current.bars[0] ?? 0)
  return Math.max(0, first - barLength * LEAD_IN_BARS)
})
const endTime = computed(() => {
  const notes = part.value?.notes ?? []
  return notes.reduce((end, note) => Math.max(end, note.start + note.length), 0)
})
const pending = computed(() => (mode.value === 'wait' ? steps.value[pendingIndex.value] : steps.value[stepIndexAt(steps.value, player.time.value)]) ?? null)

function applyMode() {
  const current = part.value
  if (!current || !player.loaded.value) return
  // Wait mode: the child plays the part, so the song's own copy is silent.
  player.setChannelMuted(current.channel, mode.value === 'wait')
}

function resetTo(time: number) {
  player.seek(time)
  pendingIndex.value = stepIndexAt(steps.value, time)
  pressed = new Set()
  waiting.value = false
  done.value = false
}

// Load the song once sound is on; the child's keys sound with the part's instrument.
watch([() => synth.status.value, part], async ([status, current]) => {
  if (status !== 'ready' || !current || !record.value || player.loaded.value) return
  await player.load(record.value.data, record.value.fileName)
  synth.setLearnerTarget({ channel: LEARNER_CHANNEL, preset: { bank: 0, program: current.program } })
  player.setRate(rate.value)
  applyMode()
  resetTo(startTime.value)
}, { immediate: true })

watch(mode, () => {
  applyMode()
  if (waiting.value && mode.value === 'listen') {
    waiting.value = false
    player.play()
  }
})
watch(rate, (value) => player.setRate(value))

function advance() {
  pendingIndex.value++
  pressed = new Set()
  if (pendingIndex.value >= steps.value.length) {
    done.value = true
    synth.playCue('levelDone')
  }
}

/** Advances past every step the presses already cover; resumes the song if it was waiting. */
function tryAdvance(now: number) {
  let moved = false
  while (mode.value === 'wait' && pending.value && (waiting.value || now >= pending.value.time - EARLY_S) && coversStep(pending.value, pressed, anyOctave.value)) {
    advance()
    moved = true
    if (waiting.value) {
      waiting.value = false
      player.play()
    }
  }
  return moved
}

onEvent((event) => {
  if (event.type !== 'noteOn') return
  pressed.add(event.note)
  recent.value = [...recent.value.slice(-5), event.note]
  tryAdvance(player.currentTime())
})

// Every frame: move the keyboard window, stop at a step that is not played yet.
let frame = 0
function loop() {
  frame = requestAnimationFrame(loop)
  const current = part.value
  if (!current || !player.loaded.value) return
  const now = player.currentTime()
  const next = chooseWindow(windowStart.value, upcomingKeys(current.steps, now))
  if (next !== windowStart.value) windowStart.value = next
  if (mode.value !== 'wait' || waiting.value || !player.playing.value) return
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
  player.unload()
})

function togglePlay() {
  if (player.playing.value || waiting.value) {
    player.pause()
    waiting.value = false
  } else {
    if (done.value || player.time.value >= endTime.value) resetTo(startTime.value)
    player.play()
  }
}

function restart() {
  const wasPlaying = player.playing.value || waiting.value
  player.pause()
  resetTo(startTime.value)
  if (wasPlaying) player.play()
}

function seekInPart(event: MouseEvent) {
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
  return findName({ bank: 0, program: current.program }, synth.presets.value) ?? t(`sound.groups.${groupOf(current.program)}`)
})

const pendingKeys = computed(() => (pending.value && !done.value ? pending.value.keys : []))

const prompt = computed(() => {
  const step = pending.value
  if (!step || done.value) return null
  const chord = step.keys.length >= 3 ? identifyChord(step.keys)[0] : undefined
  const notes = step.keys.map((key) => withLocal(midiName(key), localName(key, true))).join(', ')
  return {
    notes,
    chord: chord ? t(`lab.type.${chord.type}`, { root: withLocal(noteName(chord.root), localName(chord.root)) }) : null,
    symbol: chord ? chordSymbol(chord.root, chord.type) : null,
  }
})

const hint = computed(() => (waiting.value && pending.value && !anyOctave.value ? octaveHint(pending.value, recent.value) : null))

const partProgress = computed(() => {
  const span = endTime.value - startTime.value
  return span > 0 ? Math.min(100, Math.max(0, ((player.time.value - startTime.value) / span) * 100)) : 0
})

const windowLabel = computed(() => `${midiName(windowStart.value)}–${midiName(windowStart.value + 24)}`)
</script>

<template>
  <main class="practice">
    <header class="flex flex-wrap items-center gap-3 -ml-3">
      <UButton :to="`/songs/${route.params.id}`" icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="xl" :aria-label="t('songs.backToMap')" />
      <div class="min-w-0">
        <h1 class="title text-highlighted">{{ partName || t('songs.title') }}</h1>
        <p v-if="record" class="text-muted text-sm">{{ record.name }}<template v-if="part">, {{ t('songs.channel', { n: part.channel + 1 }) }}</template></p>
      </div>
      <div class="ml-auto">
        <SoundControl />
      </div>
    </header>

    <UAlert v-if="notFound" class="mt-6" color="warning" variant="subtle" icon="i-lucide-circle-help" :title="t('songs.partNotFound')" />

    <template v-if="part">
      <div class="controls">
        <UButton
          :icon="player.playing.value || waiting ? 'i-lucide-pause' : 'i-lucide-play'"
          size="xl"
          :disabled="!player.loaded.value"
          :label="player.playing.value || waiting ? t('songs.pause') : t('songs.play')"
          @click="togglePlay"
        />
        <UButton icon="i-lucide-rotate-ccw" color="neutral" variant="soft" size="xl" :disabled="!player.loaded.value" :aria-label="t('songs.restart')" @click="restart" />

        <div class="segmented" role="radiogroup" :aria-label="t('songs.modeLabel')">
          <button v-for="item in (['wait', 'listen'] as const)" :key="item" type="button" role="radio" class="segment" :class="{ 'segment--on': mode === item }" :aria-checked="mode === item" @click="mode = item">
            {{ t(`songs.mode.${item}`) }}
          </button>
        </div>

        <div class="segmented" role="radiogroup" :aria-label="t('songs.speed')">
          <button v-for="item in RATES" :key="item" type="button" role="radio" class="segment tabular-nums" :class="{ 'segment--on': rate === item }" :aria-checked="rate === item" @click="rate = item">
            {{ Math.round(item * 100) }}%
          </button>
        </div>

        <USwitch v-model="anyOctave" size="lg" :label="t('songs.anyOctave')" />
      </div>

      <div class="progress" :aria-label="t('songs.partPosition')" @click="seekInPart">
        <span class="progress__fill" :style="{ width: `${partProgress}%` }" />
      </div>

      <section class="status" aria-live="polite" :data-step-time="pending?.time ?? ''" :data-time="player.time.value" :data-waiting="waiting">
        <p v-if="!player.loaded.value" class="text-muted">{{ t('songs.needSound') }}</p>
        <p v-else-if="done" class="status__done">{{ t('songs.partDone') }}</p>
        <template v-else-if="prompt">
          <p v-if="prompt.symbol" class="status__chord text-highlighted">{{ prompt.symbol }} <span class="text-muted">{{ prompt.chord }}</span></p>
          <p class="status__notes" :class="{ 'status__notes--waiting': waiting }">
            {{ waiting ? t('songs.waitingFor', { notes: prompt.notes }) : t('songs.next', { notes: prompt.notes }) }}
          </p>
        </template>
        <p v-if="hint" class="status__hint">{{ t(`songs.octave.${hint}`) }}</p>
      </section>

      <div class="stage">
        <NoteFall class="stage__fall" :notes="part.notes" :start="windowStart" :get-time="player.currentTime" :pending="pendingKeys" />
        <PianoKeyboard :start="windowStart" :held="heldNotes" :hint="pendingKeys" @press="pressNote" @release="releaseNote" />
        <p class="window text-muted">{{ t('songs.window', { range: windowLabel }) }}</p>
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

.status__done {
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 700;
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
