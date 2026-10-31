<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import PageHeader from '@/components/PageHeader.vue'
import RhythmStaff from '@/components/RhythmStaff.vue'
import { useMetronome } from '@/composables/useMetronome'
import { useMk4Actions } from '@/composables/useMk4Actions'
import { usePadActions } from '@/composables/usePadActions'
import { useRhythmPlayer } from '@/composables/useRhythmPlayer'
import { useWakeLock } from '@/composables/useWakeLock'
import { BPM_MAX, BPM_MIN, CALIBRATION_TAPS, METERS, METRONOME_SOUNDS, TAP_INPUTS, accentOf, tempoName } from '@/lib/metronome'
import { DURATIONS, generateBar, type Duration, type Rhythm } from '@/lib/rhythm'

// «Ритм»: the metronome and the tap-latency check (step 15), rhythms drawn and played (step 16).
// Rhythm levels with tapping and scoring come in step 17.

const { t, tm, rt } = useI18n()
useWakeLock()
const metronome = useMetronome()
const { settings, running, beat, beatCount, countingIn, calibrating, calibrationTaps, calibrationCountdown, calibrationResult, latency, latencyHistories } = metronome

usePadActions({
  hint: () => metronome.toggle(),
  levelDown: () => metronome.update({ bpm: settings.value.bpm - 5 }),
  levelUp: () => metronome.update({ bpm: settings.value.bpm + 5 }),
})

onBeforeUnmount(() => metronome.stop())

// The MK4's ■/▶ starts and stops the metronome here (Shift+Tap Tempo does it anywhere).
useMk4Actions({ playStop: () => metronome.toggle() })

const bpm = computed({
  get: () => settings.value.bpm,
  set: (value: number) => metronome.update({ bpm: value }),
})
const volume = computed({
  get: () => Math.round(settings.value.volume * 100),
  set: (value: number) => metronome.update({ volume: value / 100 }),
})

const countWords = computed(() => (tm('rhythm.count') as unknown[]).map((word) => rt(word as never)))
const countWord = computed(() => (beat.value < 0 ? '' : countWords.value[beat.value] ?? String(beat.value + 1)))
const dots = computed(() => Array.from({ length: beatCount.value }, (_, index) => accentOf(index, beatCount.value)))

/** Listening before the latency check: the child catches the beat, taps do not count yet. */
const listening = computed(() => calibrating.value && calibrationCountdown.value > 0)
const hint = computed(() => {
  if (listening.value) return t('rhythm.calibrationListen', { n: calibrationCountdown.value })
  if (calibrating.value) return t('rhythm.calibrationCountHint')
  return running.value ? t('rhythm.countHint') : t('rhythm.idleHint')
})

/** One line per input; the computer keyboard only shows up once it was checked. */
const latencyLines = computed(() => TAP_INPUTS
  .filter((input) => input !== 'keys' || latencyHistories.value.keys.length)
  .map((input) => {
    const tries = latencyHistories.value[input]
    const ms = latency.value[input]
    const value = tries.length === 0
      ? t('rhythm.latencyNone')
      : t('rhythm.latencyValue', { ms: ms > 0 ? `+${ms}` : ms, tries: tries.join(', ') }, tries.length)
    return { input, text: `${t(`rhythm.inputs.${input}`)}: ${value}` }
  }))
const anyLatency = computed(() => TAP_INPUTS.some((input) => latencyHistories.value[input].length))

/** Right card: rhythms to look at and listen to, or the latency check (always shown while it runs). */
const sideTab = ref<'rhythms' | 'latency'>('rhythms')
watch(calibrating, (on) => {
  if (on) sideTab.value = 'latency'
})
const sideTabs = computed(() => [
  { label: t('rhythm.tabs.rhythms'), value: 'rhythms' },
  { label: t('rhythm.tabs.latency'), value: 'latency' },
])

/** Bars in an example: two, so the rhythm is heard as a phrase and not a single bar. */
const EXAMPLE_BARS = 2
const values = ref<Duration[]>(['half', 'quarter', 'eighth'])
const withRests = ref(false)
const rhythmPlayer = useRhythmPlayer()

function makeExample(): Rhythm {
  const [numerator, denominator] = settings.value.meter.split('/').map(Number) as [number, number]
  const meter = { numerator, denominator }
  const notes = Array.from({ length: EXAMPLE_BARS }, () => generateBar(meter, { durations: values.value, rests: withRests.value })).flat()
  return { meter, notes }
}

const example = shallowRef<Rhythm>(makeExample())

function newExample() {
  rhythmPlayer.stop()
  example.value = makeExample()
}

watch([() => settings.value.meter, values, withRests], newExample, { deep: true })

/** At least one value always stays on: a rhythm needs something to be made of. */
function toggleValue(value: Duration) {
  const on = values.value.includes(value)
  if (on && values.value.length === 1) return
  values.value = on ? values.value.filter((item) => item !== value) : DURATIONS.filter((item) => item === value || values.value.includes(item))
}

function listenExample() {
  if (rhythmPlayer.playing.value) {
    rhythmPlayer.stop()
    return
  }
  // One clock at a time: the metronome on the left stops while the example plays its own clicks.
  metronome.stop()
  rhythmPlayer.play(example.value, settings.value.bpm)
}
</script>

<template>
  <main class="page page--fill rhythm">
    <PageHeader :title="t('rhythm.title')" />

    <div class="layout">
      <div class="main-col">
        <section class="pulse" aria-live="off">
          <div class="dots" :aria-label="t('rhythm.beatsLabel')">
            <span
              v-for="(accent, index) in dots"
              :key="index"
              class="dot"
              :class="[`dot--${accent}`, { 'dot--on': index === beat, 'dot--count-in': countingIn }]"
            />
          </div>
          <p class="count text-highlighted">{{ countWord || ' ' }}</p>
          <p class="text-muted">{{ hint }}</p>
        </section>

        <section class="panel">
          <div class="tempo">
            <UButton icon="i-lucide-minus" color="neutral" variant="soft" size="xl" :aria-label="t('rhythm.slower')" :disabled="calibrating" @click="bpm -= 1" />
            <div class="tempo__value">
              <span class="bpm text-highlighted">{{ bpm }}</span>
              <span class="text-muted text-sm">{{ t('rhythm.bpm') }} · {{ t(`rhythm.tempo.${tempoName(bpm)}`) }}</span>
            </div>
            <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xl" :aria-label="t('rhythm.faster')" :disabled="calibrating" @click="bpm += 1" />
            <USlider v-model="bpm" :min="BPM_MIN" :max="BPM_MAX" :step="1" size="lg" class="tempo__slider" :disabled="calibrating" :aria-label="t('rhythm.tempoLabel')" />
          </div>

          <div class="field">
            <span class="field__label text-muted">{{ t('rhythm.meter') }}</span>
            <div class="choices">
              <UButton
                v-for="meter in METERS"
                :key="meter"
                :label="meter"
                size="lg"
                :color="settings.meter === meter ? 'primary' : 'neutral'"
                :variant="settings.meter === meter ? 'solid' : 'soft'"
                :disabled="calibrating"
                class="tabular-nums"
                @click="metronome.update({ meter })"
              />
            </div>
          </div>

          <div class="field">
            <span class="field__label text-muted">{{ t('rhythm.sound') }}</span>
            <div class="choices">
              <UButton
                v-for="sound in METRONOME_SOUNDS"
                :key="sound"
                :label="t(`rhythm.sounds.${sound}`)"
                size="lg"
                :color="settings.sound === sound ? 'primary' : 'neutral'"
                :variant="settings.sound === sound ? 'solid' : 'soft'"
                @click="metronome.update({ sound })"
              />
            </div>
          </div>

          <div class="field">
            <span class="field__label text-muted">{{ t('rhythm.volume') }}</span>
            <USlider v-model="volume" :min="0" :max="100" :step="5" size="lg" class="max-w-80" :aria-label="t('rhythm.volume')" />
          </div>

          <UButton
            :icon="running && !calibrating ? 'i-lucide-square' : 'i-lucide-play'"
            size="xl"
            class="self-start"
            :disabled="calibrating"
            :label="running && !calibrating ? t('rhythm.stop') : t('rhythm.start')"
            @click="metronome.toggle()"
          >
            <template #trailing>
              <UKbd value="3" size="md" />
            </template>
          </UButton>
        </section>
      </div>

      <UCard as="aside" variant="subtle" class="side">
        <template #header>
          <UTabs v-model="sideTab" :items="sideTabs" :content="false" size="lg" />
        </template>
        <div v-if="sideTab === 'rhythms'" class="flex flex-col gap-4">
          <RhythmStaff :rhythm="example" :current="rhythmPlayer.current.value" />
          <div class="flex flex-wrap gap-2" role="group" :aria-label="t('rhythm.valuesLabel')">
            <UButton
              v-for="value in DURATIONS"
              :key="value"
              :color="values.includes(value) ? 'primary' : 'neutral'"
              :variant="values.includes(value) ? 'solid' : 'soft'"
              size="md"
              :aria-pressed="values.includes(value)"
              :label="t(`rhythm.values.${value}`)"
              @click="toggleValue(value)"
            />
            <USwitch v-model="withRests" size="lg" class="ml-2" :label="t('rhythm.rests')" />
          </div>
          <div class="flex flex-wrap gap-3">
            <UButton icon="i-lucide-shuffle" color="neutral" variant="soft" size="lg" :label="t('rhythm.newExample')" @click="newExample" />
            <UButton
              :icon="rhythmPlayer.playing.value ? 'i-lucide-square' : 'i-lucide-ear'"
              size="lg"
              :label="rhythmPlayer.playing.value ? t('rhythm.stopExample') : t('rhythm.listenExample')"
              @click="listenExample"
            />
          </div>
        </div>
        <div v-else class="flex flex-col gap-4">
          <p class="text-toned leading-relaxed">{{ t('rhythm.calibrationLead', { n: CALIBRATION_TAPS }) }}</p>
          <ul class="flex flex-col gap-1 text-muted">
            <li v-for="line in latencyLines" :key="line.input">{{ line.text }}</li>
          </ul>

          <template v-if="calibrating">
            <button type="button" class="tap" :class="{ 'tap--listen': listening }" @pointerdown.prevent="metronome.tap('screen')">
              {{ listening ? t('rhythm.listenCountdown', { n: calibrationCountdown }) : t('rhythm.tap') }}
            </button>
            <div class="flex flex-wrap items-center gap-4">
              <span v-if="!listening" class="text-toned tabular-nums">{{ t('rhythm.tapsDone', { done: Math.min(calibrationTaps, CALIBRATION_TAPS), n: CALIBRATION_TAPS }) }}</span>
              <UButton color="neutral" variant="soft" size="lg" :label="t('rhythm.cancel')" @click="metronome.cancelCalibration()" />
            </div>
          </template>
          <template v-else>
            <UAlert
              v-if="calibrationResult === 'failed'"
              color="warning"
              variant="subtle"
              icon="i-lucide-circle-help"
              :title="t('rhythm.calibrationFailed')"
            />
            <UAlert
              v-else-if="calibrationResult && calibrationResult.steady"
              color="success"
              variant="subtle"
              icon="i-lucide-circle-check"
              :title="t('rhythm.calibrationSaved', { ms: calibrationResult.offsetMs, input: t(`rhythm.inputs.${calibrationResult.input}`) })"
            />
            <UAlert
              v-else-if="calibrationResult"
              color="warning"
              variant="subtle"
              icon="i-lucide-circle-help"
              :title="t('rhythm.calibrationUnsteady', { spread: calibrationResult.spreadMs })"
            />
            <div class="flex flex-wrap gap-3">
              <UButton v-if="anyLatency" color="neutral" variant="ghost" size="lg" :label="t('rhythm.resetLatency')" @click="metronome.resetLatency()" />
              <UButton icon="i-lucide-timer" size="lg" :label="t('rhythm.calibrate')" @click="metronome.startCalibration()" />
            </div>
          </template>
        </div>
      </UCard>
    </div>
  </main>
</template>

<style scoped>
.subtitle {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
}

.layout {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.side {
  align-self: stretch;
}

/* Tablet landscape (Galaxy Tab S10+ is 1400 x ~800 CSS px): metronome left, latency check right, no scroll. */
@media (min-width: 961px) and (orientation: landscape) {
  .layout {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    align-items: start;
    gap: clamp(2rem, 4vw, 4rem);
    margin-top: 1rem;
  }

  .pulse {
    padding-block: 0.5rem 1.5rem;
  }

  .side {
    align-self: stretch;
  }
}

.pulse {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding-block: 2rem 1.5rem;
  text-align: center;
}

.dots {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: clamp(0.75rem, 3vw, 1.5rem);
  min-height: 4.5rem;
}

.dot {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 999px;
  background: var(--ui-bg-accented);
  transition: transform 60ms ease-out, background-color 60ms ease-out;
}

.dot--strong {
  width: 4rem;
  height: 4rem;
}

.dot--medium {
  width: 3.25rem;
  height: 3.25rem;
}

.dot--on {
  background: var(--color-pad-tomato);
  transform: scale(1.12);
}

.dot--on.dot--count-in {
  background: var(--color-pad-sky);
}

.count {
  min-height: 1.2em;
  font-family: var(--font-display);
  font-size: clamp(2.5rem, 7vw, 4rem);
  font-weight: 800;
  line-height: 1.1;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.tempo {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  max-width: 32rem;
}

.tempo__value {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.tempo__slider {
  grid-column: 1 / -1;
}

.bpm {
  font-family: var(--font-display);
  font-size: 3rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
}

.field__label {
  min-width: 6rem;
}

.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tap {
  min-height: 9rem;
  border-radius: 1.25rem;
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 800;
  color: #fff;
  background: var(--color-pad-tomato);
  touch-action: manipulation;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.tap--listen {
  background: var(--color-pad-sky);
  opacity: 0.85;
}

.tap:active {
  transform: translateY(3px) scale(0.98);
}

/* Short landscape screens (Galaxy Tab S10 FE, or Chrome with its bars): tighter, still no scroll. */
@media (orientation: landscape) and (max-height: 760px) {
  .pulse {
    gap: 0.25rem;
    padding-block: 0 0.75rem;
  }

  .dots {
    min-height: 3.5rem;
  }

  .dot--strong {
    width: 3.25rem;
    height: 3.25rem;
  }

  .count {
    font-size: 2.5rem;
  }

  .panel {
    gap: 1rem;
  }

  .bpm {
    font-size: 2.5rem;
  }
}
</style>
