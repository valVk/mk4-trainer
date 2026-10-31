import { describe, expect, it } from 'vitest'

import { parseLastPlace } from '@/lib/lastPlace'

describe('parseLastPlace', () => {
  it('keeps a saved place', () => {
    expect(parseLastPlace({ path: '/train/chords', label: 'Аккорды · Уровень 3' })).toEqual({ path: '/train/chords', label: 'Аккорды · Уровень 3' })
  })

  it('drops anything else', () => {
    expect(parseLastPlace(null)).toBeNull()
    expect(parseLastPlace('/lab')).toBeNull()
    expect(parseLastPlace({ path: 'https://example.com', label: 'x' })).toBeNull()
    expect(parseLastPlace({ path: '/lab', label: '' })).toBeNull()
  })
})
