import { onBeforeUnmount, ref, type Ref } from 'vue'

import { countInBeat } from '@/lib/rhythm'

/**
 * The countdown shown big (4-3-2-1) in the last bar before the first note, on every screen that plays along
 * (theory rhythm, reading, songs): follows the heard position every frame; null while nothing is counted.
 * `position` is seconds from the first note (negative before it), `beat` one beat in the same seconds.
 */
export function useCountIn(read: () => { active: boolean, position: number, beat: number, beats: number }): Ref<number | null> {
  const value = ref<number | null>(null)
  let frame = 0
  function follow() {
    const { active, position, beat, beats } = read()
    value.value = active ? countInBeat(position, beat, beats) : null
    frame = requestAnimationFrame(follow)
  }
  frame = requestAnimationFrame(follow)
  onBeforeUnmount(() => cancelAnimationFrame(frame))
  return value
}
