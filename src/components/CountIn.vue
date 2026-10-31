<script setup lang="ts">
// The count-in number, big, over the notes (4-3-2-1): the same on every screen that counts in.
defineProps<{ value: number | null }>()
</script>

<template>
  <span v-if="value !== null" class="count-in" aria-live="assertive">{{ value }}</span>
</template>

<style scoped>
.count-in {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 5rem;
  font-weight: 800;
  color: var(--color-active);
  pointer-events: none;
}
</style>
