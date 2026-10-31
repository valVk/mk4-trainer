// The order bars are played in (plan step 24): repeat signs, first and second endings, D.C. and D.S. al Fine or
// al Coda, Fine and the coda. As musicians read it: repeats are taken the first time through only; after D.C. or
// D.S. the music goes on to Fine, or jumps from «To Coda» to the coda. Pure code, no UI text.

export interface FormBar {
  /** Repeat sign at the start (|:) and at the end (:|) of the bar. */
  repeatStart?: boolean
  repeatEnd?: boolean
  /** Under a first or second ending bracket. */
  volta?: 1 | 2
  /** The segno sign (𝄋) at the start of the bar: where D.S. goes back to. */
  segno?: boolean
  /** Fine: the end, once the music has come back with D.C. or D.S. */
  fine?: boolean
  /** «To Coda» at the end of the bar: once back with D.C. or D.S., jump to the coda from here. */
  toCoda?: boolean
  /** The coda starts here (𝄌). */
  coda?: boolean
  /** At the end of the bar: back to the start (D.C.) or to the segno (D.S.), then al Fine or al Coda. */
  jump?: 'dcFine' | 'dcCoda' | 'dsFine' | 'dsCoda'
}

/** Bar indexes in the order they are played. */
export function playOrder(bars: readonly FormBar[]): number[] {
  const order: number[] = []
  let i = 0
  let repeatFrom = 0
  /** Repeats already taken: a :| is taken once. */
  const taken = new Set<number>()
  /** After D.C. or D.S.: repeats are not taken again, and Fine or To Coda count. */
  let returned: 'fine' | 'coda' | null = null
  let jumped = false
  /** The coda is played only when reached from «To Coda»; the first time through, the music stops before it. */
  let inCoda = false
  // A safety stop: a form never plays more bars than this.
  while (i < bars.length && order.length < bars.length * 4) {
    const bar = bars[i]!
    if (bar.repeatStart) repeatFrom = i
    // Second time through a repeat (or after a jump back), the first ending is skipped.
    const secondPass = taken.size > 0 && taken.has(lastRepeatEnd(bars, i))
    if (bar.volta === 1 && (secondPass || returned)) {
      i++
      continue
    }
    if (bar.volta === 2 && !secondPass && !returned) {
      i++
      continue
    }
    if (bar.coda && !inCoda) break
    order.push(i)
    if (returned === 'fine' && bar.fine) break
    if (returned === 'coda' && bar.toCoda) {
      i = bars.findIndex((item) => item.coda)
      returned = null
      inCoda = true
      continue
    }
    if (bar.repeatEnd && !returned && !taken.has(i)) {
      taken.add(i)
      i = repeatFrom
      continue
    }
    if (bar.jump && !jumped) {
      jumped = true
      returned = bar.jump.endsWith('Fine') ? 'fine' : 'coda'
      i = bar.jump.startsWith('ds') ? Math.max(0, bars.findIndex((item) => item.segno)) : 0
      continue
    }
    i++
  }
  return order
}

/** The repeat end that closes the section a bar belongs to (the next :| at or after it, or the one just before). */
function lastRepeatEnd(bars: readonly FormBar[], index: number): number {
  for (let i = index; i < bars.length; i++) if (bars[i]!.repeatEnd) return i
  for (let i = index - 1; i >= 0; i--) if (bars[i]!.repeatEnd) return i
  return -1
}

/** Forms asked in «Септаккорды» (С4): one of each kind of sign. */
export const FORMS: readonly FormBar[][] = [
  [{ repeatStart: true }, { repeatEnd: true }, {}],
  [{ repeatStart: true }, {}, { volta: 1, repeatEnd: true }, { volta: 2 }],
  [{}, { fine: true }, {}, { jump: 'dcFine' }],
  [{}, { segno: true }, { fine: true }, { jump: 'dsFine' }],
  [{}, { toCoda: true }, { jump: 'dcCoda' }, { coda: true }],
]
