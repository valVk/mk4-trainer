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
document.title = useI18n().t('app.name')
usePadActions({
  train: () => router.push('/train'),
  lab: () => router.push('/lab'),
})
</script>

<template>
  <UApp :locale="ru">
    <RouterView />
    <PwaUpdate />
  </UApp>
</template>
