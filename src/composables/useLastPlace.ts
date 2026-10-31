import { watch } from 'vue'
import { useRoute } from 'vue-router'

import { useProgress } from '@/composables/useProgress'

/**
 * A screen worth coming back to tells Home what it is (plan step 27): «Продолжить» opens its address again, and the
 * screen itself reopens on the child's level, phrase or section. `label` is null while the screen is still loading.
 */
export function useLastPlace(label: () => string | null): void {
  const route = useRoute()
  const progress = useProgress()
  watch([label, () => route.fullPath, () => progress.ready.value], ([text, path, ready]) => {
    if (text && ready) void progress.setLastPlace({ path, label: text })
  }, { immediate: true })
}
