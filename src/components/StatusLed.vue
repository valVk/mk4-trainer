<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  on: boolean
  label: string
  state?: string
  /** Increment to blink the LED, like the MIDI activity light on hardware. */
  activity?: number
}>()

const led = ref<HTMLElement | null>(null)

watch(() => props.activity, () => {
  // WAAPI: retriggers cleanly on every message, no class juggling.
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  led.value?.animate(
    still
      ? [{ filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }]
      : [{ transform: 'scale(1.35)', filter: 'brightness(1.6)' }, { transform: 'scale(1)', filter: 'brightness(1)' }],
    { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
  )
})
</script>

<template>
  <div class="flex items-center gap-3 text-[1.0625rem]">
    <span ref="led" class="led" :class="on ? 'led--on' : 'led--off'" aria-hidden="true" />
    <span class="text-highlighted">{{ label }}</span>
    <span v-if="state" class="text-muted">{{ state }}</span>
  </div>
</template>

<style scoped>
.led {
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 50%;
  flex: none;
  transition: background-color 200ms ease, box-shadow 200ms ease;
}

.led--on {
  background: var(--color-pad-aqua);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-pad-aqua) 25%, transparent), 0 0 12px var(--color-pad-aqua);
}

.led--off {
  background: var(--color-pad-tomato);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-pad-tomato) 25%, transparent);
}
</style>
