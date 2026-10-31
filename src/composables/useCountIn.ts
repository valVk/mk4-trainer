import { onBeforeUnmount, ref, type Ref } from 'vue'

import { countdown } from '@/lib/rhythm'

/**
 * The countdown shown big (3, 2, 1) in the last seconds before the first note, on every screen that plays along
 * (theory rhythm, reading, songs): follows the heard position every frame; null while nothing is counted.
 * `position` is real seconds from the first note (negative before it).
 */
export function useCountIn(read: () => { active: boolean, position: number }): Ref<number | null> {
  const value = ref<number | null>(null)
  let frame = 0
  function follow() {
    const { active, position } = read()
    value.value = active ? countdown(position) : null
    frame = requestAnimationFrame(follow)
  }
  frame = requestAnimationFrame(follow)
  onBeforeUnmount(() => cancelAnimationFrame(frame))
  return value
}
