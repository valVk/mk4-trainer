<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables'

import { useNoteSource } from '@/composables/useNoteSource'
import { DEFAULT_PAD_MAP, PAD_COUNT, calibrationPress, padAction } from '@/lib/noteSource'

const { t } = useI18n()
const toast = useToast()
const { padMap, setPadMap, capturePresses, midiStatus, connectMidi, onEvent } = useNoteSource()

// MK4 layout: pads 5-8 on top, 1-4 below.
const rows = [[5, 6, 7, 8], [1, 2, 3, 4]]

// Each press re-keys the pad's glow, so it flashes once per hit.
const hits = reactive<Record<number, number>>({})
onEvent((event) => {
  if (event.type === 'pad') hits[event.pad] = (hits[event.pad] ?? 0) + 1
})

const calibrating = ref(false)
const collected = ref<number[]>([])
const channel = ref<number | null>(null)
const problem = ref<string | null>(null)
let stopCapture: (() => void) | null = null

const currentPad = computed(() => (calibrating.value ? collected.value.length + 1 : null))
const isDefault = computed(() => padMap.value.channel === DEFAULT_PAD_MAP.channel
  && padMap.value.notes.every((note, i) => note === DEFAULT_PAD_MAP.notes[i]))

function noteFor(pad: number): number | undefined {
  return calibrating.value ? collected.value[pad - 1] : padMap.value.notes[pad - 1]
}

function startCalibration() {
  collected.value = []
  channel.value = null
  problem.value = null
  calibrating.value = true
  stopCapture = capturePresses((press) => {
    const step = calibrationPress(collected.value, channel.value, press)
    if (step.status === 'duplicate') {
      problem.value = t('pads.duplicate', { pad: step.pad })
    } else if (step.status === 'otherChannel') {
      problem.value = t('pads.otherChannel', { channel: step.channel })
    } else if (step.status === 'next') {
      problem.value = null
      collected.value = step.notes
      channel.value = step.channel
    } else {
      setPadMap(step.padMap)
      finish()
      toast.add({ title: t('pads.saved'), icon: 'i-lucide-circle-check', color: 'success' })
    }
  })
}

function finish() {
  stopCapture?.()
  stopCapture = null
  calibrating.value = false
  problem.value = null
}

function reset() {
  setPadMap(null)
  toast.add({ title: t('pads.resetDone'), icon: 'i-lucide-rotate-ccw' })
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="grid" role="list">
      <template v-for="row in rows" :key="row[0]">
        <div
          v-for="pad in row"
          :key="pad"
          role="listitem"
          class="pad"
          :class="{
            'pad--target': pad === currentPad,
            'pad--done': calibrating && noteFor(pad) !== undefined,
          }"
        >
          <span :key="hits[pad] ?? 0" class="pad__glow" :class="{ 'pad__glow--hit': (hits[pad] ?? 0) > 0 }" aria-hidden="true" />
          <span class="pad__number">{{ pad }}</span>
          <span class="pad__action">{{ t(`pads.action.${padAction(pad)}`) }}</span>
          <span class="pad__note">
            <template v-if="noteFor(pad) !== undefined">{{ t('pads.note', { note: noteFor(pad) }) }}</template>
            <template v-else-if="pad === currentPad">{{ t('pads.pressNow') }}</template>
          </span>
        </div>
      </template>
    </div>

    <div v-if="calibrating" class="flex flex-col gap-3" aria-live="polite">
      <p class="prompt text-highlighted">{{ t('pads.pressPad', { pad: currentPad, total: PAD_COUNT }) }}</p>
      <p v-if="problem" class="text-error text-lg">{{ problem }}</p>
      <div class="flex flex-wrap gap-3">
        <UButton icon="i-lucide-rotate-ccw" color="neutral" variant="soft" size="xl" :label="t('pads.restart')" @click="startCalibration" />
        <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xl" :label="t('pads.cancel')" @click="finish" />
      </div>
    </div>

    <div v-else class="flex flex-col gap-4">
      <p class="text-muted">
        {{ isDefault ? t('pads.defaultMap', { channel: padMap.channel }) : t('pads.customMap', { channel: padMap.channel }) }}
      </p>
      <div class="flex flex-wrap gap-3">
        <UButton
          v-if="!isDefault"
          icon="i-lucide-rotate-ccw"
          color="neutral"
          variant="ghost"
          size="xl"
          :label="t('pads.reset')"
          @click="reset"
        />
        <UButton
          v-if="midiStatus !== 'connected'"
          icon="i-lucide-plug"
          size="xl"
          :disabled="midiStatus === 'unsupported'"
          :loading="midiStatus === 'connecting'"
          :label="t('midiTest.connect')"
          @click="connectMidi"
        />
        <UButton v-else icon="i-lucide-crosshair" size="xl" :label="t('pads.calibrate')" @click="startCalibration" />
      </div>
      <p class="text-muted text-sm">{{ t('pads.virtualHint') }}</p>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  max-width: 44rem;
}

.pad {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-height: 7.5rem;
  padding: 0.875rem 1rem;
  border-radius: 1rem;
  background: var(--rubber);
  box-shadow: 0 0 0 1px var(--rubber-edge) inset, 0 5px 0 var(--rubber-edge);
}

.pad__glow {
  position: absolute;
  inset: 0;
  opacity: 0;
  background: radial-gradient(100% 90% at 50% 40%, var(--color-attention), color-mix(in oklab, var(--color-attention) 40%, transparent));
  pointer-events: none;
}

/* Flash on each hit, like the pad lighting up under the finger */
.pad__glow--hit {
  animation: hit 420ms var(--ease-out);
}

.pad__number {
  position: relative;
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ui-text-highlighted);
}

.pad__action {
  position: relative;
  font-weight: 500;
  color: var(--ui-text-toned);
}

.pad__note {
  position: relative;
  margin-top: auto;
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  font-variant-numeric: tabular-nums;
}

.pad--done {
  box-shadow: 0 0 0 var(--ring-width) var(--color-correct) inset, 0 5px 0 var(--rubber-edge);
}

/* The pad to press now: a slow ring pulse draws the eye without moving anything */
.pad--target {
  box-shadow: 0 0 0 var(--ring-width-strong) var(--color-active) inset, 0 5px 0 var(--rubber-edge);
  animation: target 1.4s ease-in-out infinite;
}

.prompt {
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 700;
}

@keyframes hit {
  from { opacity: 0.9; }
  to { opacity: 0; }
}

@keyframes target {
  50% {
    box-shadow: 0 0 0 var(--ring-width-strong) var(--color-active) inset, 0 5px 0 var(--rubber-edge), 0 0 0 6px color-mix(in oklab, var(--color-active) 30%, transparent);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pad--target {
    animation: none;
  }
}

@media (max-width: 640px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
