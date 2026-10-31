<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import { useNoteSource } from '@/composables/useNoteSource'
import { useSynth } from '@/composables/useSynth'

// Sound is the heart of the trainer: screens that play it (route meta `sound`) ask for it in a
// window, not with a small header button. Browsers only start audio from a tap, hence the button.

const { t } = useI18n()
const route = useRoute()
const { status, progress, error, downloaded, bankSizeMb, start: startSound } = useSynth()
const { askMidiOnTap } = useNoteSource()

/** Either answer is a tap: it also asks for the MK4 when MIDI is still undecided (a phone's first visit). */
function start() {
  askMidiOnTap()
  return startSound()
}
function later() {
  askMidiOnTap()
  open.value = false
}

/** «Пока без звука»: no more asking until the app is opened again. */
const declined = ref(false)

const open = computed({
  get: () => Boolean(route.meta.sound) && !declined.value && status.value !== 'ready',
  set: (value: boolean) => {
    if (!value) declined.value = true
  },
})
const loading = computed(() => status.value === 'loading')
const percent = computed(() => Math.round(progress.value * 100))
</script>

<template>
  <UModal v-model:open="open" :dismissible="!loading" :close="false" :ui="{ content: 'max-w-md' }">
    <template #content>
      <div class="gate">
        <UIcon name="i-lucide-volume-2" class="gate__icon" />
        <h2 class="gate__title text-highlighted">{{ t('soundGate.title') }}</h2>
        <p class="text-toned leading-relaxed">{{ t('soundGate.lead') }}</p>

        <template v-if="loading">
          <p class="text-muted">{{ downloaded ? t('sound.starting') : t('sound.loading', { percent }) }}</p>
          <UProgress :model-value="downloaded ? null : percent" size="md" class="w-full" />
        </template>
        <template v-else>
          <p v-if="status === 'error'" class="text-error text-sm">{{ t('sound.failed', { error }) }}</p>
          <p v-else-if="!downloaded" class="text-muted text-sm">{{ t('soundGate.download', { size: bankSizeMb() }) }}</p>
          <UButton
            :icon="status === 'error' ? 'i-lucide-rotate-ccw' : 'i-lucide-volume-2'"
            size="xl"
            block
            :label="status === 'error' ? t('sound.retry') : t('sound.enable')"
            @click="start"
          />
          <UButton color="neutral" variant="ghost" size="lg" block :label="t('soundGate.later')" @click="later" />
        </template>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.gate {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem 1.75rem 1.5rem;
  text-align: center;
}

.gate__icon {
  width: 3.5rem;
  height: 3.5rem;
  color: var(--color-active);
}

.gate__title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 800;
}
</style>
