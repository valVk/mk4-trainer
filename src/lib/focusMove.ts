// Moving around the screen without touching it (plan step 26): the MK4's display knob steps through the screen's
// buttons, tabs and links in reading order, and the focus ring shows where it is; Push presses that one.

const FOCUSABLE = 'a[href], button:not([disabled]), [role="tab"]:not([disabled]), [role="button"], input:not([disabled]), select:not([disabled])'

/** Everything that can be pressed and is visible, in document order. */
function focusable(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.offsetParent !== null || element.getClientRects().length > 0)
}

/** Steps the focus to the next (+1) or previous (−1) control, round the ends. */
export function moveFocus(step: 1 | -1): void {
  const items = focusable()
  if (items.length === 0) return
  const current = items.indexOf(document.activeElement as HTMLElement)
  const next = current === -1 ? (step > 0 ? 0 : items.length - 1) : (current + step + items.length) % items.length
  // focusVisible: the ring shows, as for keyboard navigation (Chrome).
  items[next]!.focus({ focusVisible: true } as FocusOptions)
}
