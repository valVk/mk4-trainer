import { computed, onBeforeUnmount, ref, type ComputedRef } from 'vue'

/** Below this height (the smaller tablets, 650 px) screens draw their staves smaller so they do not scroll. */
const SHORT_HEIGHT = 720

/** Below this height a phone lies in landscape (390-430 px): staves get smaller still (plan step 30). */
const PHONE_HEIGHT = 500

function windowHeight() {
  const height = ref(window.innerHeight)
  const onResize = () => {
    height.value = window.innerHeight
  }
  window.addEventListener('resize', onResize)
  onBeforeUnmount(() => window.removeEventListener('resize', onResize))
  return height
}

/** Whether the window is short, kept up to date while the component lives. */
export function useShortScreen(): ComputedRef<boolean> {
  const height = windowHeight()
  return computed(() => height.value < SHORT_HEIGHT)
}

/** Whether the window is as low as a phone in landscape. */
export function usePhoneScreen(): ComputedRef<boolean> {
  const height = windowHeight()
  return computed(() => height.value < PHONE_HEIGHT)
}
