<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import AppPad from '@/components/AppPad.vue'
import ChordDiagram from '@/components/ChordDiagram.vue'
import { useProgress } from '@/composables/useProgress'
import { useSynth } from '@/composables/useSynth'
import { buildChord } from '@/lib/theory'

const { t } = useI18n()

const cMajor = buildChord(60, 'maj')
const { downloaded } = useSynth()
const { profile } = useProgress()
</script>

<template>
  <main class="home">
    <div class="top-bar">
      <UButton
        v-if="profile"
        to="/progress"
        icon="i-lucide-user"
        color="neutral"
        variant="ghost"
        size="lg"
        :label="t('home.player', { name: profile.name })"
      />
      <UColorModeButton color="neutral" variant="ghost" size="xl" />
    </div>

    <section>
      <h1 class="title text-highlighted">{{ t('home.title') }}</h1>
      <p class="lead text-muted">{{ t('home.lead') }}</p>
      <figure class="example">
        <ChordDiagram :lit="cMajor" animated />
        <figcaption class="mt-3 text-muted">{{ t('home.example') }}</figcaption>
      </figure>
    </section>

    <nav class="pads" :aria-label="t('home.menu')">
      <AppPad color="tomato" icon="i-lucide-target" :label="t('home.train')" to="/train" />
      <AppPad color="sky" icon="i-lucide-flask-conical" :label="t('home.lab')" to="/lab" />
      <AppPad color="sun" icon="i-lucide-star" :label="t('home.progress')" to="/progress" />
      <AppPad color="aqua" icon="i-lucide-cable" :label="t('home.midiTest')" to="/midi-test" />
      <p class="sound-status text-muted">
        <UIcon :name="downloaded ? 'i-lucide-circle-check' : 'i-lucide-download'" class="size-4 shrink-0" />
        {{ downloaded ? t('sound.downloaded') : t('sound.notDownloaded') }}
      </p>
    </nav>
  </main>
</template>

<style scoped>
.home {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: clamp(2rem, 5vw, 5rem);
  align-items: center;
  min-height: 100dvh;
  max-width: 72rem;
  margin: 0 auto;
  padding: clamp(1.5rem, 4vw, 3.5rem);
}

.top-bar {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  top: clamp(0.75rem, 2vw, 1.5rem);
  right: clamp(0.75rem, 2vw, 1.5rem);
}

.title {
  font-family: var(--font-display);
  font-size: clamp(2.5rem, 5.5vw, 4.25rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
}

.lead {
  max-width: 34ch;
  margin-top: 1.25rem;
  font-size: 1.25rem;
  line-height: 1.45;
}

.example {
  max-width: 24rem;
  margin-top: 2.5rem;
}

.sound-status {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  font-size: 0.9375rem;
}

.pads {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.25rem;
}

/* Tablet portrait and narrower: text above, pads full width below */
@media (max-width: 960px) {
  .home {
    grid-template-columns: minmax(0, 1fr);
    align-content: center;
    padding-top: 5rem;
  }
}
</style>
