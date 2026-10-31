<script setup lang="ts">
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables'
import { useRegisterSW } from 'virtual:pwa-register/vue'

import { rememberRegistration } from '@/composables/usePwaUpdate'

const { t } = useI18n()
const toast = useToast()
// Registered: an open app also looks for a new version every hour (usePwaUpdate), and on «Проверить обновление».
const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
  onRegisteredSW: (_url, found) => rememberRegistration(found),
})

// Never reload on its own: a new version waits until the user taps "Update".
watch(needRefresh, (value) => {
  if (!value) return
  toast.add({
    title: t('pwa.updateTitle'),
    icon: 'i-lucide-refresh-cw',
    duration: 0,
    actions: [
      {
        label: t('pwa.updateAction'),
        onClick: () => updateServiceWorker(true),
      },
    ],
  })
})

watch(offlineReady, (value) => {
  if (!value) return
  toast.add({
    title: t('pwa.offlineReady'),
    icon: 'i-lucide-wifi-off',
  })
})
</script>

<template>
  <span hidden />
</template>
