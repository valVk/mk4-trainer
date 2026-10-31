import { ref } from 'vue'

/** How often an open app looks for a new version: an installed app may stay open for days. */
export const UPDATE_CHECK_MS = 60 * 60 * 1000

/** The app's service worker, once registered (PwaUpdate.vue); none in development. */
let registration: ServiceWorkerRegistration | undefined

/** Set by PwaUpdate.vue when the service worker is registered; from then on it looks for a new version every hour. */
export function rememberRegistration(found: ServiceWorkerRegistration | undefined): void {
  registration = found
  if (found) setInterval(() => void found.update().catch(() => undefined), UPDATE_CHECK_MS)
}

export type UpdateCheck = 'found' | 'latest' | 'offline' | 'unavailable'

/** Being checked now: the button shows it is busy. */
export const checking = ref(false)

/**
 * Looks for a new version now («Проверить обновление»). Found, the usual «Доступно обновление» notice appears
 * by itself (PwaUpdate.vue); the result says what to tell when nothing is found.
 */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!registration) return 'unavailable'
  checking.value = true
  try {
    await registration.update()
    return registration.installing || registration.waiting ? 'found' : 'latest'
  } catch {
    return 'offline'
  } finally {
    checking.value = false
  }
}
