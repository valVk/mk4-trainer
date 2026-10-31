<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import DrawerStatus from '@/components/DrawerStatus.vue'
import IntervalBar from '@/components/IntervalBar.vue'
import PageHeader from '@/components/PageHeader.vue'
import PianoKeyboard from '@/components/PianoKeyboard.vue'
import { useKeyboardWindow } from '@/composables/useKeyboardWindow'
import { useLastPlace } from '@/composables/useLastPlace'
import { useNoteNames } from '@/composables/useNoteNames'
import { useNoteSource } from '@/composables/useNoteSource'
import { SETTLE_MS, isRelease, useSettled } from '@/composables/useSettled'
import { usePadActions } from '@/composables/usePadActions'
import { useSynth } from '@/composables/useSynth'
import { useWakeLock } from '@/composables/useWakeLock'
import { KEYBOARD_KEYS } from '@/lib/keyboard'
import { buildChord, chordSymbol, identifyChord, intervalsBetween, midiName, noteName } from '@/lib/theory'

const { t } = useI18n()
useLastPlace(() => t('lab.title'))
useWakeLock()
const { heldNotes, pressNote, releaseNote } = useNoteSource()
const { status: soundStatus, playChord } = useSynth()
const { localName, withLocal } = useNoteNames()
// Lifting a chord key by key would read it as an interval, then a note: the name stays
// until the hand is off, and changes at once when keys are added.
const shown = useSettled(heldNotes, (next, current) => (isRelease(next, current) ? SETTLE_MS : 0))

// Reference: the recognised chord in root position, from the octave of the lowest held note.
function listen() {
  const chord = primary.value
  if (!chord) return
  const lowest = Math.min(...shown.value)
  const root = Math.floor(lowest / 12) * 12 + chord.root
  playChord(buildChord(root > lowest ? root - 12 : root, chord.type))
}

usePadActions({
  listen: () => {
    if (soundStatus.value === 'ready') listen()
  },
})

const start = useKeyboardWindow()

const matches = computed(() => identifyChord(shown.value))
const primary = computed(() => matches.value[0] ?? null)
const others = computed(() => matches.value.slice(1).map((match) => chordSymbol(match.root, match.type)))

const reading = computed(() => {
  const held = shown.value
  if (held.length === 0) return { kind: 'empty' as const }
  if (held.length === 1) {
    const note = held[0] as number
    return { kind: 'note' as const, title: midiName(note), name: localName(note) }
  }
  const chord = primary.value
  if (chord) {
    return {
      kind: 'chord' as const,
      title: chordSymbol(chord.root, chord.type),
      name: t(`lab.type.${chord.type}`, { root: withLocal(noteName(chord.root), localName(chord.root)) }),
      inversion: chord.inversion,
    }
  }
  if (held.length === 2) {
    const semitones = intervalsBetween(held)[0] ?? 0
    return { kind: 'interval' as const, title: t('lab.interval', { n: semitones }, semitones) }
  }
  return { kind: 'unknown' as const, title: t('lab.unknown') }
})

const rangeLabel = computed(() => `${midiName(start.value)} – ${midiName(start.value + KEYBOARD_KEYS - 1)}`)
</script>

<template>
  <main class="page page--fill lab">
    <PageHeader :title="t('lab.title')" />
    <!-- Sound and MK4 state live in the drawer, the map in the footer: the content gets the height. -->
    <DrawerStatus :window-start="start" show-on-shift />

    <section class="readout" aria-live="polite">
      <p v-if="reading.kind === 'empty'" class="prompt text-muted">{{ t('lab.empty') }}</p>
      <template v-else>
        <div class="flex flex-wrap items-center gap-5">
          <p class="chord text-highlighted">{{ reading.title }}</p>
          <UButton
            v-if="reading.kind === 'chord' && soundStatus === 'ready'"
            icon="i-lucide-play"
            color="neutral"
            variant="soft"
            size="lg"
            :label="t('sound.listen')"
            @click="listen"
          />
        </div>
        <p v-if="reading.kind === 'chord'" class="name text-toned">
          {{ reading.name }}<template v-if="reading.inversion > 0">, {{ t(`lab.inversion.${reading.inversion}`) }}</template>
        </p>
        <p v-else-if="reading.kind === 'note' && reading.name" class="name text-toned">{{ reading.name }}</p>
        <p v-else-if="reading.kind === 'unknown'" class="name text-toned">{{ t('lab.unknownHint') }}</p>
        <IntervalBar v-if="shown.length > 1" :notes="shown" class="mt-5" />
        <p v-if="others.length" class="mt-4 text-muted">{{ t('lab.alsoKnownAs', { names: others.join(', ') }) }}</p>
      </template>
    </section>

    <section class="board">
      <PianoKeyboard
        :start="start"
        :held="heldNotes"
        show-names
        context-names
        show-intervals
        @press="pressNote"
        @release="releaseNote"
      />
      <div class="controls">
        <!-- The octave moves with the MK4's Octave buttons or Z and X; the range just says where the keys are. -->
        <span class="range text-highlighted">{{ rangeLabel }}</span>
        <p class="text-muted text-sm">{{ t('lab.keysHint') }}</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.readout {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 12rem;
  padding-block: 1.5rem;
}

.prompt {
  font-size: 1.5rem;
  max-width: 28ch;
}

.chord {
  font-family: var(--font-display);
  font-size: clamp(3rem, 8vw, 5.5rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
}

.name {
  margin-top: 0.75rem;
  font-size: 1.375rem;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1.25rem;
}

.range {
  min-width: 7.5rem;
  text-align: center;
  font-family: var(--font-display);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
