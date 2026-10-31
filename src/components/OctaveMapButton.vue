<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import PianoMap from '@/components/PianoMap.vue'
import { DEFAULT_BASE_NOTE } from '@/lib/noteSource'

// Where the keys are (plan step 19): one button opens the whole piano with the MK4 window on it, so it never
// takes room on the screen.
// With `showOnShift` it also opens by itself when the window moves (Octave + or −), once the presses have
// settled, and closes a little after the last one: the child sees where the keys went, then it is out of the way.
const props = defineProps<{
  /** First key of the 25 keys under the hands now. */
  windowStart: number
  showOnShift?: boolean
}>()
// It lives in the app's footer, small and quiet, next to the version: the map opens upwards from there.

const { t } = useI18n()

/** Quick presses in a row open the map once, at the final place. */
const SHOW_AFTER_MS = 350
/** How long the map stays after the last move when it opened by itself. */
const HIDE_AFTER_MS = 1750

const open = ref(false)
/** Opened by a move, not by a tap: only then it closes by itself. */
let byShift = false
let showTimer: ReturnType<typeof setTimeout> | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined

watch(() => props.windowStart, () => {
  if (!props.showOnShift) return
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  showTimer = setTimeout(() => {
    if (!open.value) byShift = true
    open.value = true
    if (byShift) {
      hideTimer = setTimeout(() => {
        open.value = false
      }, HIDE_AFTER_MS)
    }
  }, SHOW_AFTER_MS)
})

watch(open, (value) => {
  if (value) return
  byShift = false
  clearTimeout(hideTimer)
})

/** A tap on the button: the map stays until it is closed. */
function onTap(value: boolean) {
  open.value = value
  byShift = false
  clearTimeout(hideTimer)
}

onBeforeUnmount(() => {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
})
</script>

<template>
  <UPopover :open="open" :content="{ side: 'top', align: 'end' }" :modal="false" @update:open="onTap">
    <UButton icon="i-lucide-map" color="neutral" variant="ghost" size="sm" class="text-dimmed" :aria-label="t('theory.notes.octaveMapOpen')" />
    <template #content>
      <div class="octave-map-pop">
        <!-- The whole piano: where the 25 keys are now, and where they usually are. -->
        <PianoMap :window-start="windowStart" :home-start="DEFAULT_BASE_NOTE" />
      </div>
    </template>
  </UPopover>
</template>

<style scoped>
.octave-map-pop {
  width: min(44rem, 90vw);
  padding: 0.75rem 1rem 0.5rem;
}
</style>
