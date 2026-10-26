import { ref } from 'vue'

import { useNoteSource } from '@/composables/useNoteSource'
import { padAction, type PadAction } from '@/lib/noteSource'

export type PadHandlers = Partial<Record<PadAction, () => void>>

/**
 * While a song part is played on the pads, they make music, not game actions
 * (including the global pads 5/6 that switch modes).
 */
export const padsPlayMusic = ref(false)

/**
 * Runs the handler for each pad press (MK4 pads or keys 1-8 on the computer).
 * Unhandled actions are ignored; the listener goes away with the calling component.
 */
export function usePadActions(handlers: PadHandlers): void {
  const { onEvent } = useNoteSource()
  onEvent((event) => {
    if (event.type !== 'pad' || padsPlayMusic.value) return
    const action = padAction(event.pad)
    if (action) handlers[action]?.()
  })
}
