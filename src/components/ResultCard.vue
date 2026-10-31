<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { TEMPO_PASS_ACCURACY, allowedMistakes, type AttemptScore } from '@/lib/ladder'

// The verdict after an attempt. It sits over the stopped notes, so the columns do not jump when it appears.
const { t } = useI18n()

const props = defineProps<{
  result: AttemptScore
  /** The teacher's ladder is on: a pass offers the next step. */
  guided: boolean
  /** The unit is finished with this pass. */
  unitDone: boolean
  /** Label of the button to the next rung or unit. */
  nextLabel: string
}>()

const emit = defineEmits<{ next: [], again: [] }>()

const title = computed(() => {
  if (!props.result.passed) return t('songs.result.again')
  return props.guided && props.unitDone ? t('songs.result.unitDone') : t('songs.result.passed')
})

const description = computed(() => {
  const { mode, hits, total, mistakes, extra, short } = props.result
  // Notes let go too soon: said first, it is what to change (a note is as long as it is written).
  const held = short ? `${t('songs.result.short', { n: short }, short)} ` : ''
  if (mode === 'tempo') {
    const timing = t('songs.result.tempo', { hits, total, need: Math.ceil(total * TEMPO_PASS_ACCURACY) })
    return held + (extra ? `${timing} ${t('songs.result.tempoExtra', { extra, allowed: allowedMistakes(total) })}` : timing)
  }
  if (mode === 'wait') return held + (mistakes ? t('songs.result.wait', { mistakes }) : t('songs.result.waitClean'))
  return t('songs.result.listen')
})

const actions = computed(() => (props.result.passed && props.guided
  ? [
      { label: props.nextLabel, icon: 'i-lucide-arrow-right', size: 'lg' as const, onClick: () => emit('next') },
      { label: t('songs.again'), color: 'neutral' as const, variant: 'soft' as const, size: 'lg' as const, onClick: () => emit('again') },
    ]
  : [{ label: t('songs.again'), icon: 'i-lucide-rotate-ccw', size: 'lg' as const, onClick: () => emit('again') }]))
</script>

<template>
  <div class="result-overlay">
    <UAlert
      :color="result.passed ? 'success' : 'warning'"
      variant="subtle"
      :icon="result.passed ? 'i-lucide-circle-check' : 'i-lucide-rotate-ccw'"
      orientation="horizontal"
      :title="title"
      :description="description"
      :actions="actions"
    />
  </div>
</template>

<style scoped>
.result-overlay {
  position: absolute;
  z-index: 2;
  top: 1rem;
  left: 50%;
  width: min(calc(100% - 2rem), 40rem);
  transform: translateX(-50%);
}

.result-overlay :deep([data-slot="root"]),
.result-overlay > * {
  background: color-mix(in oklab, var(--ui-bg-elevated) 92%, transparent);
  backdrop-filter: blur(6px);
  box-shadow: 0 12px 32px -12px var(--shadow-strong);
}
</style>
