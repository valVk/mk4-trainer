// Moving around the screen without touching it (plan step 26): the MK4's display knob steps through the screen's
// buttons, tabs and links in the order they are read (the header, then the main area row by row, left to right,
// then the side column), and the focus shows where it is; Push presses that one. A control marked data-knob-turn
// (a seek bar) is grabbed by Push instead: turning then moves it (a `knobturn` event, detail +1 or -1) until Push
// again, Undo or leaving it lets go. Music pads have tabindex -1: they are played, so the knob passes them by.
// An open dialog keeps the knob inside it.

const FOCUSABLE = 'a[href], button:not([disabled]), [role="tab"]:not([disabled]), [role="button"], input:not([disabled]), select:not([disabled])'

/** Header first, side column last. */
function regionOf(element: HTMLElement): number {
  if (element.closest('header')) return 0
  if (element.closest('aside')) return 2
  return 1
}

function pressable(element: HTMLElement): boolean {
  if (element.tabIndex < 0 || element.getAttribute('aria-disabled') === 'true') return false
  if (element.closest('[inert], [aria-hidden="true"]')) return false
  if (element.getClientRects().length === 0) return false
  const style = getComputedStyle(element)
  return style.visibility !== 'hidden' && style.pointerEvents !== 'none'
}

/** Rows as the eye reads them: an element starting above the middle of the row's first one is on that row. */
function readingOrder(elements: HTMLElement[]): HTMLElement[] {
  const boxes = elements.map((element) => ({ element, box: element.getBoundingClientRect() })).sort((a, b) => a.box.top - b.box.top)
  const rows: { middle: number, items: typeof boxes }[] = []
  for (const item of boxes) {
    const row = rows[rows.length - 1]
    if (row && item.box.top < row.middle) row.items.push(item)
    else rows.push({ middle: item.box.top + item.box.height / 2, items: [item] })
  }
  return rows.flatMap((row) => row.items.sort((a, b) => a.box.left - b.box.left).map((item) => item.element))
}

/** Everything that can be pressed and is visible, in reading order; only inside the open dialog when there is one. */
function focusable(): HTMLElement[] {
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((dialog) => dialog.getClientRects().length > 0)
  const scope: ParentNode = dialogs[dialogs.length - 1] ?? document
  const items = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(pressable)
  return [0, 1, 2].flatMap((region) => readingOrder(items.filter((element) => regionOf(element) === region)))
}

/** Steps the focus to the next (+1) or previous (−1) control, round the ends. */
export function moveFocus(step: 1 | -1): void {
  // The cursor shows from now on, until the next tap (App.vue).
  document.documentElement.classList.add('knob-nav')
  const items = focusable()
  if (items.length === 0) return
  const current = items.indexOf(document.activeElement as HTMLElement)
  const next = current === -1 ? (step > 0 ? 0 : items.length - 1) : (current + step + items.length) % items.length
  // focusVisible: the ring shows, as for keyboard navigation (Chrome).
  items[next]!.focus({ focusVisible: true } as FocusOptions)
}

/** The control the knob turns now, after Push grabbed it. */
let grabbed: HTMLElement | null = null

/** Lets go of a grabbed control; false when nothing was grabbed. */
export function releaseKnob(): boolean {
  if (!grabbed) return false
  grabbed.classList.remove('knob-grabbed')
  grabbed.removeEventListener('blur', onGrabbedBlur)
  grabbed = null
  return true
}

function onGrabbedBlur() {
  releaseKnob()
}

/** A click of the knob: turns the grabbed control, else moves the focus. */
export function turnKnob(step: 1 | -1): void {
  if (grabbed) grabbed.dispatchEvent(new CustomEvent('knobturn', { detail: step }))
  else moveFocus(step)
}

/** Push: grabs a control the knob turns, lets it go again, or presses the focused one. */
export function pressKnob(): void {
  if (releaseKnob()) return
  const element = document.activeElement as HTMLElement | null
  if (!element || element === document.body) return
  if (element.hasAttribute('data-knob-turn')) {
    grabbed = element
    element.classList.add('knob-grabbed')
    element.addEventListener('blur', onGrabbedBlur)
    return
  }
  element.click()
}
