<script setup lang="ts">
import { computed } from 'vue'

import { intervalsBetween, midiName } from '@/lib/theory'

// Held notes in a row with the semitone count between neighbours: C4 4 E4 3 G4.
const props = defineProps<{
  notes: readonly number[]
}>()

const sorted = computed(() => [...new Set(props.notes)].sort((a, b) => a - b))
const gaps = computed(() => intervalsBetween(sorted.value))
</script>

<template>
  <ol class="flex flex-wrap items-center gap-2">
    <template v-for="(note, i) in sorted" :key="note">
      <li v-if="i > 0" class="gap" aria-hidden="true">{{ gaps[i - 1] }}</li>
      <li class="note text-highlighted">{{ midiName(note) }}</li>
    </template>
  </ol>
</template>

<style scoped>
.note {
  padding: 0.375rem 0.75rem;
  border-radius: 0.625rem;
  font-family: var(--font-display);
  font-size: 1.125rem;
  font-weight: 600;
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
}

.gap {
  display: grid;
  place-items: center;
  min-width: 2rem;
  height: 2rem;
  padding-inline: 0.5rem;
  border-radius: 999px;
  font-family: var(--font-display);
  font-weight: 700;
  color: #fff;
  background: var(--color-pad-sky);
}
</style>
