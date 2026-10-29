<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import InstrumentPicker from '@/components/InstrumentPicker.vue'
import { useSynth } from '@/composables/useSynth'

// With `fixedInstrument`, the keys play a set instrument (a song part) and the picker is replaced by its name.
defineProps<{ fixedInstrument?: string, fixedLabel?: string }>()

const { t } = useI18n()
const { status, progress, error, downloaded, start } = useSynth()
</script>

<template>
  <div class="flex items-center gap-3">
    <!-- The window (SoundGate) asks first; this calm chip turns the sound on later with one tap. -->
    <UButton
      v-if="status === 'off' || status === 'error'"
      :icon="status === 'error' ? 'i-lucide-rotate-ccw' : 'i-lucide-volume-x'"
      color="neutral"
      variant="outline"
      size="lg"
      :label="status === 'error' ? t('sound.retry') : t('sound.off')"
      @click="start"
    />
    <div v-else-if="status === 'loading'" class="flex flex-col gap-1.5 w-44">
      <!-- A bank already on the device only starts up: no download percent for it. -->
      <span class="text-sm text-muted">{{ downloaded ? t('sound.starting') : t('sound.loading', { percent: Math.round(progress * 100) }) }}</span>
      <UProgress :model-value="downloaded ? null : Math.round(progress * 100)" size="sm" />
    </div>
    <span v-else-if="fixedInstrument" class="fixed-instrument">
      <UIcon name="i-lucide-music" class="size-5 shrink-0" />
      {{ fixedLabel ?? t('sound.yourKeys', { name: fixedInstrument }) }}
    </span>
    <InstrumentPicker v-else />
    <span v-if="status === 'error'" class="text-sm text-error max-w-56">{{ t('sound.failed', { error }) }}</span>
  </div>
</template>

<style scoped>
.fixed-instrument {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.5rem;
  padding: 0 0.875rem;
  border-radius: var(--ui-radius);
  font-weight: 500;
  color: var(--ui-text-toned);
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
}
</style>
