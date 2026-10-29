import { onScopeDispose, shallowRef, watch, type Ref } from 'vue'

/**
 * Fingers do not land or lift all at once: a chord is pressed and released key by key over a
 * few hundred milliseconds. This follows `source`, but waits `delayFor(next, shown)` ms before
 * showing a new value (0 shows it at once), so a passing in-between state does not flash.
 */
export function useSettled<T>(source: Ref<T>, delayFor: (next: T, shown: T) => number): Readonly<Ref<T>> {
  const shown = shallowRef(source.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(source, (next) => {
    clearTimeout(timer)
    const delay = delayFor(next, shown.value)
    if (delay <= 0) shown.value = next
    else timer = setTimeout(() => {
      shown.value = next
    }, delay)
  })
  onScopeDispose(() => clearTimeout(timer))
  return shown
}

/** Time to place or lift the fingers of a chord before the screen reacts to it (ms). */
export const SETTLE_MS = 300

/** Whether `next` only lifts keys from `shown` (some released, none added). */
export function isRelease(next: readonly number[], shown: readonly number[]): boolean {
  return next.length < shown.length && next.every((note) => shown.includes(note))
}
