import { ref, watch, type Ref } from 'vue'

import { useNoteSource } from '@/composables/useNoteSource'
import { followRange, rangeStartFor } from '@/lib/keyboard'

/**
 * First key of the on-screen 25-key window: it follows the MK4 octave buttons and moves to
 * notes played outside it.
 */
export function useKeyboardWindow(): Ref<number> {
  const { heldNotes, baseNote } = useNoteSource()
  const start = ref(rangeStartFor(baseNote.value))
  watch(baseNote, (base) => {
    start.value = rangeStartFor(base)
  })
  watch(heldNotes, (held) => {
    start.value = followRange(start.value, held)
  })
  return start
}
