<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// The header of every screen: back button, title, and the screen's own controls on the right.
const { t } = useI18n()

withDefaults(defineProps<{
  title: string
  /** Where the back button goes. */
  back?: string
  backLabel?: string
}>(), { back: '/', backLabel: undefined })
</script>

<template>
  <header class="flex flex-wrap items-center gap-3 -ml-3">
    <UButton :to="back" icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="xl" :aria-label="backLabel ?? t('nav.home')" />
    <div class="min-w-0">
      <h1 class="title text-highlighted">{{ title }}</h1>
      <slot name="subtitle" />
    </div>
    <div v-if="$slots.default" class="ml-auto flex flex-wrap items-center gap-3">
      <slot />
    </div>
  </header>
</template>

<style scoped>
.title {
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 3vw, 2.25rem);
  font-weight: 700;
  overflow-wrap: anywhere;
  text-wrap: balance;
}
</style>
