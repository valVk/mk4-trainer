<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { INSTRUMENTS, useSynth, type InstrumentId } from '@/composables/useSynth'

const { t } = useI18n()
const { status, progress, error, instrument, start, setInstrument } = useSynth()

const items = computed(() => INSTRUMENTS.map((item) => ({ label: t(`sound.instrument.${item.id}`), value: item.id })))

const selected = computed({
  get: () => instrument.value,
  set: (value: InstrumentId) => setInstrument(value),
})
</script>

<template>
  <div class="flex items-center gap-3">
    <UButton
      v-if="status === 'off' || status === 'error'"
      icon="i-lucide-volume-2"
      size="lg"
      :label="status === 'error' ? t('sound.retry') : t('sound.enable')"
      @click="start"
    />
    <div v-else-if="status === 'loading'" class="flex flex-col gap-1.5 w-44">
      <span class="text-sm text-muted">{{ t('sound.loading', { percent: Math.round(progress * 100) }) }}</span>
      <UProgress :model-value="Math.round(progress * 100)" size="sm" />
    </div>
    <USelect
      v-else
      v-model="selected"
      :items="items"
      icon="i-lucide-volume-2"
      size="lg"
      class="w-48"
      :aria-label="t('sound.instrumentLabel')"
    />
    <span v-if="status === 'error'" class="text-sm text-error max-w-56">{{ t('sound.failed', { error }) }}</span>
  </div>
</template>
