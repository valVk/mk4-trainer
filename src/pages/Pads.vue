<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import PadMap from '@/components/PadMap.vue'
import PageHeader from '@/components/PageHeader.vue'

const { t } = useI18n()
</script>

<template>
  <main class="page">
    <PageHeader :title="t('pads.title')" back="/midi-test" :back-label="t('midiTest.title')" />
    <p class="lead text-muted">{{ t('pads.lead') }}</p>
    <PadMap />
  </main>
</template>

<style scoped>
.lead {
  max-width: 52ch;
  margin-block: 1rem 2rem;
  font-size: 1.125rem;
  line-height: 1.45;
}
</style>
