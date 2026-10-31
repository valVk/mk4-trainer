<script setup lang="ts">
import MidiStatus from '@/components/MidiStatus.vue'
import OctaveMapButton from '@/components/OctaveMapButton.vue'
import SoundControl from '@/components/SoundControl.vue'

// What every playing screen shows around its content, in one place: the octave map as a small icon in the footer
// (when the screen has keys), the sound and instrument in the drawer's settings, the MK4 state in the drawer.
withDefaults(defineProps<{
  /** The keys' window, for the map; no map without it. */
  windowStart?: number | null
  /** The map opens by itself when the window moves (Octave ±). */
  showOnShift?: boolean
  /** The sound control; a part with its own instrument brings its own instead. */
  sound?: boolean
  /** The MK4 state. */
  midi?: boolean
}>(), { windowStart: null, showOnShift: false, sound: true, midi: true })
</script>

<template>
  <Teleport v-if="windowStart !== null" defer to="#footer-tools">
    <OctaveMapButton :window-start="windowStart" :show-on-shift="showOnShift" />
  </Teleport>
  <Teleport v-if="sound" defer to="#page-actions">
    <SoundControl />
  </Teleport>
  <Teleport v-if="midi" defer to="#drawer-status">
    <MidiStatus />
  </Teleport>
</template>
