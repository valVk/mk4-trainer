<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { openRungs, type Unit } from '@/lib/ladder'

// The rungs of a unit: number (check when passed, lock when not open yet), mode and speed.
const { t } = useI18n()

defineProps<{
  unit: Unit
  /** Rungs passed in this unit. */
  passed: number
  current: number
}>()

defineEmits<{ choose: [index: number] }>()
</script>

<template>
  <ol class="ladder" :aria-label="t('songs.rungsLabel')">
    <li v-for="(item, index) in unit.rungs" :key="index">
      <button
        type="button"
        class="rung"
        :class="{ 'rung--done': index < passed, 'rung--current': index === current }"
        :disabled="index >= openRungs(unit, passed)"
        :aria-current="index === current ? 'step' : undefined"
        @click="$emit('choose', index)"
      >
        <span class="rung__mark">
          <UIcon v-if="index < passed" name="i-lucide-check" class="size-4" />
          <UIcon v-else-if="index >= openRungs(unit, passed)" name="i-lucide-lock" class="size-3.5" />
          <template v-else>{{ index + 1 }}</template>
        </span>
        <span class="rung__text">
          <span class="rung__mode">{{ t(`songs.rungMode.${item.mode}`) }}</span>
          <span class="rung__rate tabular-nums">{{ Math.round(item.rate * 100) }}%</span>
        </span>
      </button>
    </li>
  </ol>
</template>

<style scoped>
.ladder {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.rung {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.5rem;
  padding: 0.1875rem 0.75rem 0.1875rem 0.25rem;
  border-radius: 999px;
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
  transition: background-color 120ms ease, box-shadow 120ms ease, transform 100ms ease-out;
}

/* Press feedback on finger down, not on release. */
.rung:not(:disabled):active {
  transform: scale(0.96);
}

.rung:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.rung__mark {
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  font-size: 0.875rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: var(--ui-bg-accented);
}

.rung__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.15;
}

.rung__mode {
  font-size: 0.875rem;
  font-weight: 600;
}

.rung__rate {
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.rung--done .rung__mark {
  color: #fff;
  background: var(--color-pad-aqua);
}

.rung--current {
  box-shadow: 0 0 0 2px var(--color-pad-sky) inset;
  background: color-mix(in oklab, var(--color-pad-sky) 14%, var(--ui-bg-elevated));
}

.rung--current .rung__mark {
  color: #fff;
  background: var(--color-pad-sky);
}
</style>
