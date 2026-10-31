import { ref, watch, type Ref } from 'vue'

import { useNoteSource } from '@/composables/useNoteSource'
import { isCleanChord } from '@/lib/levels'

/**
 * A chord that sounds as a chord (plan step 28, the exam): its keys down together, not one by one. Knows when each
 * held key went down; `together` says whether the held keys made a chord and, if not, says so once (`notTogether`)
 * until the keys are up and the student tries again.
 */
export function useCleanChord(): { notTogether: Ref<boolean>, together: () => boolean } {
  const { heldNotes, onEvent } = useNoteSource()
  const downAt = new Map<number, number>()
  onEvent((event) => {
    if (event.type === 'noteOn') downAt.set(event.note, performance.now())
    else if (event.type === 'noteOff') downAt.delete(event.note)
  })
  const notTogether = ref(false)
  watch(() => heldNotes.value.length, (count) => {
    if (count === 0) notTogether.value = false
  })

  function together(): boolean {
    if (isCleanChord(heldNotes.value.map((note) => downAt.get(note) ?? 0))) return true
    notTogether.value = true
    return false
  }

  return { notTogether, together }
}
