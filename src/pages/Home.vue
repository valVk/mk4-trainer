<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import AppPad from '@/components/AppPad.vue'
import ChordDiagram from '@/components/ChordDiagram.vue'
import { useProgress } from '@/composables/useProgress'
import { useSynth } from '@/composables/useSynth'
import { buildChord } from '@/lib/theory'

const { t } = useI18n()

const cMajor = buildChord(60, 'maj')
const { downloaded, bankSizeMb } = useSynth()
const { profile } = useProgress()
</script>

<template>
  <main class="page home">
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
      <AppPad color="aqua" icon="i-lucide-music" :label="t('home.songs')" to="/songs" />
      <AppPad color="sun" icon="i-lucide-drum" :label="t('home.rhythm')" to="/rhythm" />
      <AppPad color="sky" icon="i-lucide-star" :label="t('home.progress')" to="/progress" class="pad-wide" />
      <p class="sound-status text-muted">
        <UIcon :name="downloaded ? 'i-lucide-circle-check' : 'i-lucide-download'" class="size-4 shrink-0" />
        {{ downloaded ? t('sound.downloaded') : t('sound.notDownloaded', { size: bankSizeMb() }) }}
        <span class="ml-auto flex gap-4">
          <ULink to="/midi-test" class="underline underline-offset-2">{{ t('home.midiTest') }}</ULink>
          <ULink to="/licenses" class="underline underline-offset-2">{{ t('home.licenses') }}</ULink>
        </span>
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
  flex: 1 0 auto;
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

/* Five pads: the last one takes the whole row. */
.pad-wide {
  grid-column: 1 / -1;
  min-height: 6rem;
}

.pads {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.25rem;
  /* Pads grow with the screen: icon, label and padding grow with the pad grid, the same on all five. */
  container-type: inline-size;
  --pad-icon: clamp(2.25rem, 9cqi, 5rem);
  --pad-label: clamp(1.125rem, 4cqi, 2rem);
  --pad-padding: clamp(1.25rem, 4cqi, 2rem);
}

/* Tablet landscape (Galaxy Tab S10+ is 1400 x ~800 CSS px): the pads fill the screen height. */
@media (min-width: 961px) and (orientation: landscape) {
  .home {
    align-items: stretch;
    padding-block: 4.5rem 1.5rem;
  }

  .home > section {
    align-self: center;
  }

  .pads {
    grid-template-rows: 1fr 1fr minmax(6rem, 0.6fr) auto;
    /* On a tall desktop window the pads would grow taller than wide: stop at about square. Tablets never reach this. */
    height: min(100%, 56rem);
    align-self: center;
  }

  .example {
    max-width: 30rem;
  }
}

@media (min-width: 961px) and (orientation: landscape) and (max-height: 700px) {
  .home {
    padding-block: 4rem 1rem;
  }

  .title {
    font-size: clamp(2.25rem, 4.5vw, 3.5rem);
  }

  .example {
    max-width: 24rem;
    margin-top: 1.5rem;
  }
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
