<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ChordDiagram from '@/components/ChordDiagram.vue'
import { useNoteSource } from '@/composables/useNoteSource'
import { chordSymbol, identifyChord, midiName } from '@/lib/theory'

const { t } = useI18n()
const { heldNotes, baseNote, onEvent } = useNoteSource()

const lastPad = ref<number | null>(null)
const padHits = ref(0)

onEvent((event) => {
  if (event.type !== 'pad') return
  lastPad.value = event.pad
  padHits.value++
})

// Two octaves starting at the C below the lowest note in play.
const range = computed(() => {
  const lowest = Math.min(baseNote.value, ...heldNotes.value)
  const from = Math.floor(lowest / 12) * 12
  return { from, to: from + 24 }
})

const chord = computed(() => {
  const match = identifyChord(heldNotes.value)[0]
  return match ? chordSymbol(match.root, match.type) : null
})

const noteNames = computed(() => heldNotes.value.map((note) => midiName(note)).join(' '))
</script>

<template>
  <UCard variant="subtle" :ui="{ header: 'flex items-center justify-between gap-3 min-h-16 py-3' }">
    <template #header>
      <h2 class="subtitle text-highlighted">{{ t('held.title') }}</h2>
      <UBadge
        v-if="lastPad !== null"
        :key="padHits"
        :label="t('held.pad', { pad: lastPad })"
        color="warning"
        variant="solid"
        size="lg"
        class="pad-hit"
      />
    </template>

    <div class="flex items-baseline gap-4 min-h-10">
      <span class="chord text-highlighted">{{ chord ?? (heldNotes.length ? noteNames : '—') }}</span>
      <span v-if="chord" class="text-muted">{{ noteNames }}</span>
    </div>

    <ChordDiagram :lit="heldNotes" :from="range.from" :to="range.to" class="mt-2" />

    <p class="mt-4 text-muted text-sm leading-relaxed">
      {{ t('held.keys', { base: midiName(baseNote) }) }}
    </p>
  </UCard>
</template>

<style scoped>
.subtitle {
  font-family: var(--font-display);
  font-size: 1.125rem;
  font-weight: 600;
}

.chord {
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 700;
}

/* Re-keyed on every hit, so each pad press pops once */
.pad-hit {
  animation: pop 220ms cubic-bezier(0.23, 1, 0.32, 1);
}

@keyframes pop {
  from {
    opacity: 0.6;
    transform: scale(0.9);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pad-hit {
    animation-name: fade;
  }

  @keyframes fade {
    from { opacity: 0.6; }
  }
}
</style>
