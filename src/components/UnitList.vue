<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import StarRating from '@/components/StarRating.vue'
import { starsFor, type Unit } from '@/lib/ladder'

// The teacher's units of a part (phrases, sections, the whole part), with stars and the suggested next one.
const { t } = useI18n()

defineProps<{
  units: readonly Unit[]
  current: number
  /** Rungs passed per unit id. */
  passed: Readonly<Record<string, number>>
  suggestedId: string | null
  label: (unit: Unit) => string
  repeats: (unit: Unit) => number
}>()

defineEmits<{ select: [index: number] }>()
</script>

<template>
  <nav class="units" :aria-label="t('songs.unitsLabel')">
    <button
      v-for="(item, index) in units"
      :key="item.id"
      type="button"
      class="unit"
      :class="{ 'unit--current': index === current, 'unit--done': (passed[item.id] ?? 0) >= item.rungs.length, 'unit--next': item.id === suggestedId && index !== current }"
      :aria-current="index === current"
      @click="$emit('select', index)"
    >
      <span class="unit__name">{{ label(item) }}</span>
      <span class="unit__meta">
        <StarRating :value="starsFor(item, passed[item.id] ?? 0)" size="inline" />
        <template v-if="repeats(item) > 1"> {{ t('songs.repeats', { n: repeats(item) }) }}</template>
      </span>
    </button>
  </nav>
</template>

<style scoped>
.unit {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
  min-width: 7rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  text-align: left;
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
  transition: background-color 120ms ease, transform 100ms ease-out;
}

/* Press feedback on finger down, not on release. */
.unit:active {
  transform: scale(0.97);
}

.unit__name {
  font-weight: 600;
  color: var(--ui-text-highlighted);
}

.unit__meta {
  font-size: 0.8125rem;
  color: var(--ui-text-muted);
}

.unit--current {
  box-shadow: 0 0 0 var(--ring-width) var(--color-active) inset;
}

.unit--next {
  box-shadow: 0 0 0 var(--ring-width) var(--color-correct) inset;
}

.unit--done .unit__name {
  color: var(--ui-text-toned);
}

/* Tablet landscape: the units are a column beside the stage, one line each. */
@media (min-width: 700px) and (orientation: landscape) {
  .unit {
    min-width: 0;
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
  }
}
</style>
