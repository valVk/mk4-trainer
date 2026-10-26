import { createI18n } from 'vue-i18n'

import ru from './locales/ru.json'

export type MessageSchema = typeof ru

/** Russian plural forms: 1 полутон, 2 полутона, 5 полутонов (messages list them in that order). */
function russianPlural(choice: number): number {
  const n = Math.abs(choice) % 100
  const last = n % 10
  if (n > 10 && n < 20) return 2
  if (last === 1) return 0
  if (last >= 2 && last <= 4) return 1
  return 2
}

export const i18n = createI18n<[MessageSchema], 'ru'>({
  legacy: false,
  locale: 'ru',
  fallbackLocale: 'ru',
  messages: { ru },
  pluralRules: { ru: russianPlural },
})
