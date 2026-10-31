<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// The header of every screen, one slim row: back button, a small title, and the screen's own controls on the right.
// The content gets the height: no big title above it. A part shown inside a screen (a piece inside «Теория») puts
// its controls into this row through `actionsId` instead of a header of its own.
const { t } = useI18n()

const props = withDefaults(defineProps<{
  title: string
  /** Where the back button goes. */
  back?: string
  backLabel?: string
  /** Back stays on this screen (a part shown inside another, like a piece inside «Теория»): the listener decides. */
  onBack?: () => void
  /** Id of the controls' place, for a part inside the screen to bring its own controls (Teleport). */
  actionsId?: string
}>(), { back: '/', backLabel: undefined, onBack: undefined, actionsId: undefined })
</script>

<template>
  <header class="flex flex-wrap items-center gap-3 -ml-3">
    <UButton v-if="props.onBack" icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="xl" :aria-label="backLabel ?? t('nav.home')" @click="props.onBack()" />
    <UButton v-else :to="back" icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="xl" :aria-label="backLabel ?? t('nav.home')" />
    <div class="min-w-0">
      <h1 class="title text-highlighted">{{ title }}</h1>
      <slot name="subtitle" />
    </div>
    <div v-if="$slots.default || actionsId" :id="actionsId" class="ml-auto flex flex-wrap items-center gap-3">
      <slot />
    </div>
  </header>
</template>

<style scoped>
.title {
  font-family: var(--font-display);
  font-size: clamp(1.125rem, 1.8vw, 1.375rem);
  font-weight: 700;
  overflow-wrap: anywhere;
  text-wrap: balance;
}
</style>
