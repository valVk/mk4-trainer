// «Продолжить» on Home (plan step 27): the screen the child was on last, and what to call it on the card.

export interface LastPlace {
  /** The address to open again: the screen itself reopens on the child's level, phrase or section. */
  path: string
  /** «Аккорды · Уровень 3», «Ода к радости · Фортепиано». */
  label: string
}

export function parseLastPlace(value: unknown): LastPlace | null {
  if (typeof value !== 'object' || value === null) return null
  const { path, label } = value as Partial<Record<keyof LastPlace, unknown>>
  if (typeof path !== 'string' || !path.startsWith('/') || typeof label !== 'string' || label === '') return null
  return { path, label }
}
