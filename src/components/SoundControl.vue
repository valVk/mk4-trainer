<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import InstrumentPicker from '@/components/InstrumentPicker.vue'
import { useSynth } from '@/composables/useSynth'

const { t } = useI18n()
const { status, progress, error, start } = useSynth()
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
    <InstrumentPicker v-else />
    <span v-if="status === 'error'" class="text-sm text-error max-w-56">{{ t('sound.failed', { error }) }}</span>
  </div>
</template>
