import { expect, test } from '@playwright/test'

import { keyFor, open, reload, storedSetting } from './helpers'

// «Тренировка», level 1: «Найди ноту X». The note comes from the prompt.
async function targetNote(page: import('@playwright/test').Page): Promise<string> {
  const prompt = await page.locator('.prompt').textContent()
  const match = /ноту ([A-G][#b]?)/.exec(prompt ?? '')
  if (!match) throw new Error(`Unexpected prompt: ${prompt}`)
  return match[1]!
}

const level = (page: import('@playwright/test').Page, n: number) => page.getByRole('tab', { name: `Уровень ${n}` })

test('opens on the level the child was on, after a reload and after leaving', async ({ page }) => {
  await open(page, '/train/chords')
  await expect(level(page, 1)).toHaveAttribute('aria-selected', 'true')

  await level(page, 2).click()
  await expect(level(page, 2)).toHaveAttribute('aria-selected', 'true')
  // Saving takes a moment; a child never reloads within milliseconds of a tap.
  await expect.poll(() => storedSetting(page, 'trainLevel')).toBe(2)

  await reload(page)
  await expect(level(page, 2)).toHaveAttribute('aria-selected', 'true')

  await open(page, '/')
  await open(page, '/train/chords')
  await expect(level(page, 2)).toHaveAttribute('aria-selected', 'true')
})

test('praises the right note at once', async ({ page }) => {
  await open(page, '/train/chords')
  const note = await targetNote(page)
  await page.keyboard.down(keyFor(note))
  await expect(page.locator('.feedback--success')).toBeVisible({ timeout: 150 })
  await page.keyboard.up(keyFor(note))
})

test('waits for the finger to settle before saying «not this note»', async ({ page }) => {
  await open(page, '/train/chords')
  const note = await targetNote(page)
  const wrong = note === 'C' ? 'D' : 'C'
  await page.keyboard.down(keyFor(wrong))
  // A finger still landing: no warning yet.
  await page.waitForTimeout(120)
  await expect(page.locator('.feedback--warning')).toHaveCount(0)
  // Still on the wrong key after the settle time: now it says so.
  await expect(page.locator('.feedback--warning')).toBeVisible({ timeout: 1000 })
  await page.keyboard.up(keyFor(wrong))
  await expect(page.locator('.feedback--warning')).toHaveCount(0)
})
