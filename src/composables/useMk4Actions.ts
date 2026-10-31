import { onBeforeUnmount } from 'vue'

import { useKeyboardWindow } from '@/composables/useKeyboardWindow'
import { useNoteSource } from '@/composables/useNoteSource'
import { useProgress } from '@/composables/useProgress'
import { resolveAction, type Mk4Action } from '@/lib/mk4Control'
import { controlFor } from '@/lib/mk4Layout'

export type Mk4Handlers = Partial<Record<Mk4Action, (value?: number) => void>>

/**
 * The MK4 drives the app (plan step 26), the way Ableton's script for it does: its buttons and knobs send plain
 * CCs; the app decides what they mean. A screen registers handlers for what it can do (play, again, seek…);
 * the newest screen wins, and what no screen handles goes to the app's own handlers (metronome, tempo, moving
 * around the screen, back).
 */
const screens: Mk4Handlers[] = []
let app: Mk4Handlers = {}
let listening = false
let shiftHeld = false

function dispatch(action: Mk4Action, value?: number) {
  // While developing: what the MK4 asked for, to check the mapping on the real keyboard.
  if (import.meta.env.DEV) ((window as unknown as { __mk4Actions?: unknown[] }).__mk4Actions ??= []).push({ action, value, at: Math.round(performance.now()) })
  for (let i = screens.length - 1; i >= 0; i--) {
    const handler = screens[i]![action]
    if (handler) {
      handler(value)
      return
    }
  }
  app[action]?.(value)
}

function listen() {
  if (listening) return
  listening = true
  if (import.meta.env.DEV) (window as unknown as { __mk4Dispatch?: typeof dispatch }).__mk4Dispatch = dispatch
  const { onEvent, padMap } = useNoteSource()
  const progress = useProgress()
  const keysStart = useKeyboardWindow()
  onEvent((event) => {
    if (event.type !== 'knob' || event.source !== 'midi') return
    const messageId = `cc:${event.channel}:${event.control}`
    const control = controlFor(messageId, progress.mk4Panel.value.learnt, keysStart.value, padMap.value)
    if (control === 'shift') shiftHeld = event.value > 0
    const resolved = resolveAction(control, messageId, event.value, shiftHeld, progress.mk4Panel.value.actions)
    if (resolved) dispatch(resolved.action, resolved.value)
  })
}

/** The app's own handlers, set once (App.vue). */
export function setAppMk4Actions(handlers: Mk4Handlers): void {
  app = handlers
  listen()
}

/** A screen's handlers while it is shown. */
export function useMk4Actions(handlers: Mk4Handlers): void {
  listen()
  screens.push(handlers)
  onBeforeUnmount(() => {
    const index = screens.indexOf(handlers)
    if (index !== -1) screens.splice(index, 1)
  })
}
