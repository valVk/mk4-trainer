<script setup lang="ts">
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables'
import { useRegisterSW } from 'virtual:pwa-register/vue'

const { t } = useI18n()
const toast = useToast()
const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW()

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
