<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import AppPad from '@/components/AppPad.vue'
import PageHeader from '@/components/PageHeader.vue'

// «Тренировка»: one entry from Home, two separate places behind it. Chords are the levels 1-8;
// theory is the course from the video, fitted to the 25 keys of the MK4 (plan section 9).
const { t } = useI18n()
</script>

<template>
  <main class="page page--fill choice">
    <PageHeader :title="t('train.title')" />
    <nav class="pads" :aria-label="t('train.title')">
      <AppPad color="tomato" icon="i-lucide-target" :label="t('trainChoice.chords')" to="/train/chords" />
      <AppPad color="sky" icon="i-lucide-book-open" :label="t('trainChoice.theory')" to="/train/theory" />
    </nav>
  </main>
</template>

<style scoped>
.pads {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.25rem;
  margin-top: clamp(1rem, 3vh, 2rem);
  max-height: 34rem;
  container-type: inline-size;
  --pad-icon: clamp(2.5rem, 9cqi, 5rem);
  --pad-label: clamp(1.25rem, 4cqi, 2.25rem);
  --pad-padding: clamp(1.25rem, 4cqi, 2rem);
}
</style>
