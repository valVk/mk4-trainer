<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// A level's or a phrase's exam (plan steps 28-29): no help, and the badge says so. Its look is the shared `.exam`
// style (main.css): outlined on the dark ground, filled on the light one.
const { t } = useI18n()
</script>

<template>
  <span class="exam">
    <UIcon name="i-lucide-graduation-cap" class="size-5" />
    {{ t('train.exam') }}
  </span>
</template>
