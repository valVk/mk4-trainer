import { useNoteSource } from '@/composables/useNoteSource'
import { padAction, type PadAction } from '@/lib/noteSource'

export type PadHandlers = Partial<Record<PadAction, () => void>>

/**
 * Runs the handler for each pad press (MK4 pads or keys 1-8 on the computer).
 * Unhandled actions are ignored; the listener goes away with the calling component.
 */
export function usePadActions(handlers: PadHandlers): void {
  const { onEvent } = useNoteSource()
  onEvent((event) => {
    if (event.type !== 'pad') return
    const action = padAction(event.pad)
    if (action) handlers[action]?.()
  })
}
