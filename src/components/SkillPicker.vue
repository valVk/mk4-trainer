<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useProgress } from '@/composables/useProgress'
import { SKILLS, type Skill } from '@/lib/skill'

// How strictly playing is judged (lib/skill), one row in the drawer's settings on every screen that judges timing:
// «Новичок» for a start, «Эксперт» for a trained ear. One choice per profile.
withDefaults(defineProps<{
  /** Rendered where it stands (the profile page) instead of going to the drawer. */
  inPlace?: boolean
}>(), { inPlace: false })

const { t } = useI18n()
const progress = useProgress()
const items = computed(() => SKILLS.map((skill) => ({ label: t(`skill.${skill}`), value: skill })))
</script>

<template>
  <Teleport defer to="#page-actions" :disabled="inPlace">
    <div class="skill">
      <span class="skill__label">{{ t('skill.label') }}</span>
      <USelect
        :model-value="progress.skill.value"
        :items="items"
        size="lg"
        class="min-w-40"
        :aria-label="t('skill.label')"
        @update:model-value="progress.setSkill($event as Skill)"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.skill {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  /* In the drawer every row starts on the left; this one spreads like a switch row. */
  justify-content: space-between !important;
}

.skill__label {
  font-size: 1rem;
  font-weight: 500;
  color: var(--ui-text);
}
</style>
