import { describe, expect, it } from 'vitest'

import { FORMS, playOrder } from '@/lib/form'

const bars = (order: number[]) => order.map((i) => i + 1).join(' ')

describe('the order of bars', () => {
  it('repeats once', () => {
    expect(bars(playOrder(FORMS[0]!))).toBe('1 2 1 2 3')
  })

  it('takes the first ending, then skips it for the second', () => {
    expect(bars(playOrder(FORMS[1]!))).toBe('1 2 3 1 2 4')
  })

  it('goes back to the start and ends at Fine (D.C. al Fine)', () => {
    expect(bars(playOrder(FORMS[2]!))).toBe('1 2 3 4 1 2')
  })

  it('goes back to the segno and ends at Fine (D.S. al Fine)', () => {
    expect(bars(playOrder(FORMS[3]!))).toBe('1 2 3 4 2 3')
  })

  it('jumps from «To Coda» to the coda after D.C.', () => {
    expect(bars(playOrder(FORMS[4]!))).toBe('1 2 3 1 2 4')
  })

  it('does not take repeats again after D.C.', () => {
    expect(bars(playOrder([{ repeatStart: true }, { repeatEnd: true }, { fine: true }, { jump: 'dcFine' }]))).toBe('1 2 1 2 3 4 1 2 3')
  })
})
