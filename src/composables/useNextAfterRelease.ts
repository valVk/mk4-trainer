import { onBeforeUnmount, watch } from 'vue'

import { useNoteSource } from '@/composables/useNoteSource'

/** A pause after the keys are up before the next task, so it starts from silence. */
export const NEXT_DELAY_MS = 700

/**
 * The answer flow of a task (plan steps 4, 19): once it is solved and the student has let go of the keys, the next
 * one comes; while `waiting` (a level-done card open) it waits for the student's choice instead.
 */
export function useNextAfterRelease(solved: () => boolean, waiting: () => boolean, next: () => void, delayMs = NEXT_DELAY_MS): { cancel: () => void } {
  const { heldNotes } = useNoteSource()
  let timer: ReturnType<typeof setTimeout> | undefined

  function cancel() {
    clearTimeout(timer)
  }

  watch([solved, () => heldNotes.value.length, waiting], ([isSolved, count, wait]) => {
    if (!isSolved || count > 0 || wait) return
    cancel()
    timer = setTimeout(next, delayMs)
  })

  onBeforeUnmount(cancel)
  return { cancel }
}
