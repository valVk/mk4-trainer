import { computed, onBeforeUnmount, ref, type ComputedRef } from 'vue'

/** Below this height (the smaller tablets, 650 px) screens draw their staves smaller so they do not scroll. */
const SHORT_HEIGHT = 720

/** Whether the window is short, kept up to date while the component lives. */
export function useShortScreen(): ComputedRef<boolean> {
  const height = ref(window.innerHeight)
  const onResize = () => {
    height.value = window.innerHeight
  }
  window.addEventListener('resize', onResize)
  onBeforeUnmount(() => window.removeEventListener('resize', onResize))
  return computed(() => height.value < SHORT_HEIGHT)
}
