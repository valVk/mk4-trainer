<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useProgress } from '@/composables/useProgress'

// The app's one «С подсказкой» switch (plan steps 28-29), in the drawer's settings. In an exam it is off and greyed
// out, and says why.
const props = withDefaults(defineProps<{
  on: boolean
  exam?: boolean
  /** Rendered where it stands, inside a screen's own block of settings, instead of going to the drawer by itself. */
  inPlace?: boolean
}>(), { exam: false, inPlace: false })

const { t } = useI18n()
const progress = useProgress()
</script>

<template>
  <Teleport defer to="#page-actions" :disabled="inPlace">
    <USwitch
      :model-value="props.on"
      :disabled="exam"
      size="lg"
      :label="exam ? t('train.guideExam') : t('train.guide')"
      @update:model-value="progress.setGuide($event)"
    />
  </Teleport>
</template>
