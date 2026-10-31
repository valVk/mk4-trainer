<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ChordDiagram from '@/components/ChordDiagram.vue'
import PageHeader from '@/components/PageHeader.vue'
import RhythmStaff from '@/components/RhythmStaff.vue'
import { useProgress } from '@/composables/useProgress'
import { LEVELS, starsFor } from '@/lib/levels'
import { currentLevel, starsOf } from '@/lib/rhythmLevels'
import type { Rhythm } from '@/lib/rhythm'
import { buildChord } from '@/lib/theory'

// «Тренировка»: one entry from Home, two separate places behind it. Each card shows what is inside
// and where the child goes on from: chords are the levels 1-8, theory is the course from the video
// fitted to the 25 keys of the MK4 (plan section 9).
const { t } = useI18n()
const progress = useProgress()

const cMajor = buildChord(60, 'maj')
/** A taste of the theory course: the first rhythm the child meets. */
const sample: Rhythm = { meter: { numerator: 4, denominator: 4 }, notes: [{ duration: 'quarter' }, { duration: 'quarter' }, { duration: 'eighth' }, { duration: 'eighth' }, { duration: 'quarter' }] }

const chordLevel = computed(() => progress.trainLevel.value ?? 1)
const chordStars = computed(() => starsFor(progress.levels.value[chordLevel.value]?.correct ?? 0))
const rhythmLevel = computed(() => currentLevel(progress.rhythmProgress.value))
const rhythmStars = computed(() => starsOf(progress.rhythmProgress.value[rhythmLevel.value]?.passes ?? 0))
</script>

<template>
  <main class="page page--fill choice">
    <PageHeader :title="t('train.title')" />
    <nav class="cards" :aria-label="t('train.title')">
      <RouterLink to="/train/chords" class="card card--tomato">
        <span class="card__top">
          <UIcon name="i-lucide-target" class="card__icon" />
          <span class="card__title">{{ t('trainChoice.chords') }}</span>
        </span>
        <span class="card__body">
          <!-- F3 to D5: as wide as the rhythm on the other card, with the chord in the middle. -->
          <ChordDiagram :lit="cMajor" :from="53" :to="74" class="card__picture card__picture--wide" />
          <span class="card__lead">{{ t('trainChoice.chordsLead') }}</span>
        </span>
        <span class="card__foot">
          <span class="card__where">
            {{ t('trainChoice.chordsWhere', { n: chordLevel, total: LEVELS.length }) }}
            <span class="stars" :aria-label="t('train.stars', { n: chordStars })">{{ '★'.repeat(chordStars) }}<span class="stars__off">{{ '★'.repeat(3 - chordStars) }}</span></span>
          </span>
          <span class="card__go">{{ t('trainChoice.go') }} <UIcon name="i-lucide-arrow-right" class="size-5" /></span>
        </span>
      </RouterLink>

      <RouterLink to="/train/theory" class="card card--sky">
        <span class="card__top">
          <UIcon name="i-lucide-book-open" class="card__icon" />
          <span class="card__title">{{ t('trainChoice.theory') }}</span>
        </span>
        <span class="card__body">
          <RhythmStaff :rhythm="sample" :scale="1.9" class="card__picture card__picture--wide" />
          <span class="card__lead">{{ t('trainChoice.theoryLead') }}</span>
        </span>
        <span class="card__foot">
          <span class="card__where">
            {{ t('trainChoice.theoryWhere', { section: t('theory.sections.rhythm'), n: rhythmLevel }) }}
            <span class="stars" :aria-label="t('train.stars', { n: rhythmStars })">{{ '★'.repeat(rhythmStars) }}<span class="stars__off">{{ '★'.repeat(3 - rhythmStars) }}</span></span>
          </span>
          <span class="card__go">{{ t('trainChoice.go') }} <UIcon name="i-lucide-arrow-right" class="size-5" /></span>
        </span>
      </RouterLink>
    </nav>
  </main>
</template>

<style scoped>
.cards {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: center;
  gap: clamp(1rem, 2.5vw, 2rem);
  width: min(100%, 72rem);
  margin: clamp(0.75rem, 3vh, 2rem) auto 0;
}

/* The whole card is one big button: easy to hit, and it presses like a pad. */
.card {
  --hue: var(--color-pad-sky);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 1.5rem;
  background: var(--ui-bg-elevated);
  box-shadow:
    0 0 0 1px var(--ui-border) inset,
    0 6px 0 var(--ui-border),
    0 14px 32px -16px rgb(0 0 0 / 0.35);
  transition: transform 140ms var(--ease-out), box-shadow 140ms var(--ease-out);
}

.card:active {
  transform: translateY(4px);
  box-shadow:
    0 0 0 1px var(--ui-border) inset,
    0 2px 0 var(--ui-border);
  transition-duration: 60ms;
}

.card--tomato { --hue: var(--color-pad-tomato); }
.card--sky { --hue: var(--color-pad-sky); }

.card__top {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: clamp(0.875rem, 2.5vh, 1.25rem) 1.5rem;
  color: #fff;
  background: radial-gradient(120% 140% at 20% 0%, color-mix(in oklab, var(--hue) 70%, #fff) 0%, var(--hue) 65%);
}

.card__icon {
  width: 2.25rem;
  height: 2.25rem;
  flex: none;
}

.card__title {
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 2.6vw, 2.125rem);
  font-weight: 800;
  line-height: 1.1;
}

.card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.75rem;
  padding: clamp(0.75rem, 2.5vh, 1.5rem) 1.5rem;
}

.card__picture {
  width: 100%;
  max-width: 24rem;
  pointer-events: none;
}

/* A rhythm needs the whole width to breathe. */
.card__picture--wide {
  max-width: none;
}

.card__lead {
  font-size: 1.0625rem;
  line-height: 1.45;
  color: var(--ui-text-toned);
}

.card__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  padding: 0.875rem 1.5rem;
  border-top: 1px solid var(--ui-border);
}

.card__where {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}

.card__go {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border-radius: 999px;
  font-weight: 700;
  color: #fff;
  background: var(--hue);
}

.stars {
  font-size: 1.125rem;
  letter-spacing: 0.08em;
  color: var(--color-pad-sun);
}

.stars__off {
  color: var(--star-off);
}

@media (prefers-reduced-motion: reduce) {
  .card,
  .card:active {
    transform: none;
  }
}
</style>
