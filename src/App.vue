<script setup lang="ts">
import { ru } from '@nuxt/ui/locale'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import PwaUpdate from '@/components/PwaUpdate.vue'
import { useNoteSource } from '@/composables/useNoteSource'
import { usePadActions } from '@/composables/usePadActions'
import { useProgress } from '@/composables/useProgress'

// Connect the MK4 right away: the child should not need to find a button first.
// Chrome asks for permission once and remembers it; a refusal just leaves the connect buttons visible.
void useNoteSource().connectMidi()
// Open the database, restore the profile, pad map and instrument.
void useProgress().init()

// Pads 5 and 6 switch modes from any screen (plan 4.2); the other pads belong to each page.
const router = useRouter()
const { t } = useI18n()
document.title = t('app.name')
const footer = t('app.footer', { year: new Date().getFullYear(), version: __APP_VERSION__ })
usePadActions({
  train: () => router.push('/train'),
  lab: () => router.push('/lab'),
})
</script>

<template>
  <UApp :locale="ru">
    <div class="shell">
      <RouterView />
      <footer class="footer text-dimmed text-xs tabular-nums">{{ footer }}</footer>
    </div>
    <PwaUpdate />
  </UApp>
</template>

<style scoped>
/* Pages grow to fill the screen, so the footer sits at the bottom without a scroll. */
.shell {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.shell > :first-child {
  flex: 1 0 auto;
}

.footer {
  padding: 0.75rem 1rem;
  text-align: center;
}
</style>
