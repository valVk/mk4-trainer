<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { FormBar } from '@/lib/form'

// «Септаккорды» С4 (plan step 24): «покажи, в каком порядке играть такты». Bars with their signs in a row; the child
// taps them in the order they are played, and the order builds up under them. A wrong bar is just not taken.

const props = defineProps<{
  bars: readonly FormBar[]
  /** The right order, bar indexes. */
  order: readonly number[]
  solved: boolean
}>()

const emit = defineEmits<{
  right: []
}>()

const { t } = useI18n()
const tapped = ref<number[]>([])
const wrongBar = ref<number | null>(null)

watch(() => props.bars, () => {
  tapped.value = []
  wrongBar.value = null
})

function tap(index: number) {
  if (props.solved) return
  if (index !== props.order[tapped.value.length]) {
    wrongBar.value = index
    return
  }
  wrongBar.value = null
  tapped.value = [...tapped.value, index]
  if (tapped.value.length === props.order.length) emit('right')
}

/** The signs of a bar in words and symbols, as printed in music. */
const JUMPS: Record<NonNullable<FormBar['jump']>, string> = { dcFine: 'D.C. al Fine', dcCoda: 'D.C. al Coda', dsFine: 'D.S. al Fine', dsCoda: 'D.S. al Coda' }
const signs = computed(() => props.bars.map((bar) => ({
  // Plain signs the app font has (the music symbols 𝄆 𝄇 𝄋 𝄌 are not in it): ‖: :‖ and the words, as children's books print them.
  before: [bar.repeatStart ? '‖:' : '', bar.segno ? 'Segno' : '', bar.coda ? 'Coda' : ''].filter(Boolean).join(' '),
  after: [bar.repeatEnd ? ':‖' : '', bar.fine ? 'Fine' : '', bar.toCoda ? 'To Coda' : '', bar.jump ? JUMPS[bar.jump] : ''].filter(Boolean).join(' '),
  volta: bar.volta ? `${bar.volta}.` : '',
})))
</script>

<template>
  <div class="form">
    <div class="form__bars" role="group" :aria-label="t('theory.sevenths.barsLabel')">
      <button
        v-for="(bar, i) in signs"
        :key="i"
        type="button"
        class="form__bar"
        :class="{ 'form__bar--wrong': wrongBar === i }"
        @click="tap(i)"
      >
        <span v-if="bar.volta" class="form__volta">{{ bar.volta }}</span>
        <span class="form__before">{{ bar.before }}</span>
        <span class="form__number">{{ i + 1 }}</span>
        <span class="form__after">{{ bar.after }}</span>
      </button>
    </div>
    <ol class="form__played" :aria-label="t('theory.sevenths.playedLabel')">
      <li v-for="(index, n) in tapped" :key="n" class="form__chip">{{ index + 1 }}</li>
      <li v-if="!solved" class="form__chip form__chip--next">?</li>
    </ol>
    <p v-if="wrongBar !== null && !solved" class="pill" role="status">{{ t('theory.sevenths.notThisBar', { n: wrongBar + 1 }) }}</p>
  </div>
</template>

<style scoped>
.form {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1.5rem;
}

.form__bars {
  display: flex;
  justify-content: center;
}

.form__bar {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  min-width: 9rem;
  min-height: 5.5rem;
  padding: 0.75rem 0.75rem 0.5rem;
  border: solid var(--ui-text-highlighted);
  border-width: 0 2px;
  margin-left: -2px;
  color: var(--ui-text-highlighted);
  background: var(--ui-bg-elevated);
  transition: background-color 150ms ease;
}

.form__bar:active {
  background: color-mix(in oklab, var(--color-active) 18%, var(--ui-bg-elevated));
}

.form__bar--wrong {
  background: var(--ui-bg-muted);
}

.form__volta {
  position: absolute;
  top: 0.25rem;
  left: 0.5rem;
  right: 0.5rem;
  border-top: 2px solid currentColor;
  border-left: 2px solid currentColor;
  padding-left: 0.25rem;
  font-size: 0.875rem;
  font-weight: 700;
  text-align: left;
}

.form__before,
.form__after {
  font-size: 1.5rem;
  font-weight: 700;
  white-space: nowrap;
}

.form__after {
  font-size: 0.9375rem;
  font-style: italic;
}

.form__number {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 800;
}

.form__played {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}

.form__chip {
  min-width: 2.5rem;
  padding: 0.375rem 0.75rem;
  border-radius: 0.625rem;
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
  text-align: center;
  color: var(--color-on-fill);
  background: var(--color-correct);
}

.form__chip--next {
  color: var(--ui-text-muted);
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
}

.pill {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  padding: 0.5rem 0.875rem;
  border-radius: 999px;
  font-weight: 600;
  color: var(--ui-text-toned);
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
}
</style>
