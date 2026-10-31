import { onBeforeUnmount, ref, type Ref } from 'vue'

import { KEY_HINT_DELAY_MS } from '@/lib/practice'

/**
 * A teacher who waits before pointing (plan step 11): the key lights up only after the student has had time to find
 * it. `restart` begins the wait again (a new note, a new step), `stop` hides the hint.
 */
export function useTeacherWait(delayMs = KEY_HINT_DELAY_MS): { shown: Ref<boolean>, restart: () => void, stop: () => void } {
  const shown = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  function stop() {
    clearTimeout(timer)
    shown.value = false
  }

  function restart() {
    stop()
    timer = setTimeout(() => {
      shown.value = true
    }, delayMs)
  }

  onBeforeUnmount(() => clearTimeout(timer))
  return { shown, restart, stop }
}
