<script setup lang="ts">
import { ru } from '@nuxt/ui/locale'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import PwaUpdate from '@/components/PwaUpdate.vue'
import SoundGate from '@/components/SoundGate.vue'
import { useNoteSource } from '@/composables/useNoteSource'
import { setAppMk4Actions } from '@/composables/useMk4Actions'
import { useMetronome } from '@/composables/useMetronome'
import { usePadActions } from '@/composables/usePadActions'
import { useProgress } from '@/composables/useProgress'
import { moveFocus } from '@/lib/focusMove'
import { addTap, knobBpm, tapBpm } from '@/lib/mk4Control'

// Connect the MK4 right away when MIDI is already allowed; otherwise the «Подключить MK4» button asks.
void useNoteSource().autoConnectMidi()
// Open the database, restore the profile, pad map and instrument.
void useProgress().init()

// Pads 5 and 6 switch modes from any screen (plan 4.2); the other pads belong to each page.
const router = useRouter()
const { t } = useI18n()
document.title = t('app.name')
const footer = t('app.footer', { year: new Date().getFullYear(), version: __APP_VERSION__ })
usePadActions({
  train: () => router.push('/train'),
  lab: () => router.push('/lab'),
})

// The MK4's own buttons and knobs (plan step 26), as Ableton's script uses them: Tap Tempo sets the metronome's
// tempo, Shift+Tap Tempo turns it on and off, the BPM knob turns the tempo, the display knob moves along the
// screen's buttons and presses one, Undo goes back. A screen's own handlers (play, again, seek) come first.
const metronome = useMetronome()
let taps: number[] = []
setAppMk4Actions({
  tapTempo: () => {
    taps = addTap(taps, performance.now())
    const bpm = tapBpm(taps)
    if (bpm) metronome.update({ bpm })
  },
  metronome: () => metronome.toggle(),
  tempo: (value) => metronome.update({ bpm: knobBpm(value ?? 64) }),
  next: () => moveFocus(1),
  previous: () => moveFocus(-1),
  select: () => (document.activeElement as HTMLElement | null)?.click(),
  back: () => router.back(),
})
</script>

<template>
  <UApp :locale="ru">
    <div class="shell">
      <RouterView />
      <footer class="footer text-dimmed text-xs tabular-nums">{{ footer }}</footer>
    </div>
    <PwaUpdate />
    <SoundGate />
    <!-- Portable devices are landscape only: the installed app is locked by the manifest, a browser tab gets this cover. -->
    <div class="rotate" role="alert">
      <UIcon name="i-lucide-rotate-ccw-square" class="rotate__icon" />
      <p class="rotate__title">{{ t('app.rotateTitle') }}</p>
      <p class="rotate__hint">{{ t('app.rotateHint') }}</p>
    </div>
  </UApp>
</template>

<style scoped>
/* Pages grow to fill the screen, so the footer sits at the bottom without a scroll. */
.shell {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

/* :where keeps this weak, so a page can set its own flex (the song screen does in landscape). */
:where(.shell) > :where(:first-child) {
  flex: 1 0 auto;
  /* Pages centre themselves with auto margins; without this they shrink to their content. */
  width: 100%;
}

.rotate {
  display: none;
}

@media (orientation: portrait) and (pointer: coarse) {
  .rotate {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
    background: var(--ui-bg);
  }
}

.rotate__icon {
  width: 5rem;
  height: 5rem;
  color: var(--color-pad-sky);
}

.rotate__title {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 800;
  color: var(--ui-text-highlighted);
}

.rotate__hint {
  max-width: 28ch;
  font-size: 1.125rem;
  color: var(--ui-text-muted);
}

.footer {
  padding: 0.75rem 1rem;
  text-align: center;
}
</style>
