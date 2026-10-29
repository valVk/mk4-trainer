import { expect, type Page } from '@playwright/test'

/** Computer-keyboard keys of the virtual MK4 (lib/noteSource VIRTUAL_NOTE_KEYS), by note name. */
const NOTE_KEYS: Record<string, string> = {
  'C': 'a', 'C#': 'w', 'Db': 'w', 'D': 's', 'D#': 'e', 'Eb': 'e', 'E': 'd', 'F': 'f',
  'F#': 't', 'Gb': 't', 'G': 'g', 'G#': 'y', 'Ab': 'y', 'A': 'h', 'A#': 'u', 'Bb': 'u', 'B': 'j',
}

export function keyFor(note: string): string {
  const key = NOTE_KEYS[note]
  if (!key) throw new Error(`No virtual key for ${note}`)
  return key
}

/** Opens a page and answers the sound window with «Пока без звука», as a child would who wants to look first. */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await answerSoundWindow(page)
}

/** A reload is a new visit: the sound window asks again. */
export async function reload(page: Page): Promise<void> {
  await page.reload()
  await answerSoundWindow(page)
}

async function answerSoundWindow(page: Page): Promise<void> {
  await page.locator('main').waitFor()
  const later = page.getByRole('button', { name: 'Пока без звука' })
  // The window only opens on screens that play sound, and only until it is answered once.
  const asked = await later.waitFor({ timeout: 3000 }).then(() => true, () => false)
  if (asked) await later.click()
  await expect(later).toBeHidden()
}

/** Whether the page fits the screen without scrolling. */
export async function scrollSize(page: Page): Promise<{ width: number, height: number }> {
  return page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))
}
