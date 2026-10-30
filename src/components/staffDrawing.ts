import { Renderer, type RenderContext, type StaveNote } from 'vexflow/bravura'

// Shared by the staff components: an SVG drawing surface for VexFlow with the bravura font built
// into the bundle (works offline).

/** Notes are drawn this much bigger than VexFlow's default, to be read at arm's length on a tablet. */
export const STAFF_SCALE = 1.5

/**
 * Clears `element` and returns a VexFlow context on it, scaled (STAFF_SCALE by default), with `width` in
 * unscaled units for laying out bars. Notes take the text colour, so they follow the light and dark theme.
 */
export function staffContext(element: HTMLDivElement, height: number, scale = STAFF_SCALE): { context: RenderContext, width: number } {
  element.replaceChildren()
  const pixels = Math.max(240, element.clientWidth)
  const renderer = new Renderer(element, Renderer.Backends.SVG)
  renderer.resize(pixels, height * scale)
  const context = renderer.getContext()
  context.scale(scale, scale)
  context.setFillStyle('currentColor')
  context.setStrokeStyle('currentColor')
  return { context, width: pixels / scale }
}

/** Colour of a note: the one playing now, then a result after an attempt. */
export const STAFF_COLOURS = {
  current: 'var(--color-pad-sky)',
  onTime: 'var(--color-pad-aqua)',
  off: 'var(--color-pad-sun)',
  missed: 'var(--color-pad-tomato)',
} as const

/**
 * Paints the whole note (head, stem, flag) in one colour: the text colour unless a result colour is given.
 * VexFlow draws stems black on its own, which vanishes in the dark theme and leaves coloured notes with black stems.
 */
export function paintNote(note: StaveNote, colour?: string | null): StaveNote {
  const paint = colour ?? 'currentColor'
  if (colour) note.setStyle({ fillStyle: paint, strokeStyle: paint })
  note.setStemStyle({ fillStyle: paint, strokeStyle: paint })
  note.setFlagStyle({ fillStyle: paint, strokeStyle: paint })
  return note
}
