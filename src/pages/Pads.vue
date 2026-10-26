<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import PadMap from '@/components/PadMap.vue'

const { t } = useI18n()
</script>

<template>
  <main class="page">
    <header class="flex items-center gap-3 -ml-3">
      <UButton to="/midi-test" icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="xl" :aria-label="t('midiTest.title')" />
      <h1 class="title text-highlighted">{{ t('pads.title') }}</h1>
    </header>
    <p class="lead text-muted">{{ t('pads.lead') }}</p>
    <PadMap />
  </main>
</template>

<style scoped>
.page {
  max-width: 72rem;
  margin: 0 auto;
  padding: clamp(1rem, 3vw, 2.5rem);
}

.title {
  font-family: var(--font-display);
  font-size: clamp(1.75rem, 3vw, 2.25rem);
  font-weight: 700;
}

.lead {
  max-width: 52ch;
  margin-block: 1rem 2rem;
  font-size: 1.125rem;
  line-height: 1.45;
}
</style>
