import { onBeforeUnmount, onMounted } from 'vue'

/**
 * Keeps the screen on while the page is open (plan 7d): the child plays on the MK4
 * and does not touch the tablet. The browser drops the lock when the app is hidden,
 * so it is taken again on return. Unsupported or refused: the screen just behaves as usual.
 */
export function useWakeLock(): void {
  let lock: WakeLockSentinel | null = null
  let active = false

  async function acquire() {
    if (!active || lock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return
    try {
      lock = await navigator.wakeLock.request('screen')
      lock.addEventListener('release', () => {
        lock = null
      })
    } catch {
      lock = null
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') void acquire()
  }

  onMounted(() => {
    active = true
    document.addEventListener('visibilitychange', onVisibility)
    void acquire()
  })

  onBeforeUnmount(() => {
    active = false
    document.removeEventListener('visibilitychange', onVisibility)
    void lock?.release()
    lock = null
  })
}
