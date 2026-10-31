import { computed, type ComputedRef } from 'vue'

import { useProgress } from '@/composables/useProgress'

/**
 * Help on a screen (plan steps 28-29): the app's one «С подсказкой» switch, unless the screen is in its exam, where
 * there is none. `examNow` says when that is (two stars on a level, a phrase's last rung); a screen without an exam
 * leaves it out.
 */
export function useHelp(examNow: () => boolean = () => false): { exam: ComputedRef<boolean>, guideOn: ComputedRef<boolean> } {
  const progress = useProgress()
  const exam = computed(examNow)
  const guideOn = computed(() => progress.guide.value && !exam.value)
  return { exam, guideOn }
}
