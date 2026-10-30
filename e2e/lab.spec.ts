import { expect, test } from '@playwright/test'

import { open } from './helpers'

test('keeps the chord name while the chord is lifted key by key', async ({ page }) => {
  await open(page, '/lab')
  const reading = page.locator('main.lab .chord')
  // C major on the virtual MK4: C (a), E (d), G (g).
  for (const key of ['a', 'd', 'g']) await page.keyboard.down(key)
  await expect(reading).toHaveText('C')

  await page.keyboard.up('g')
  await page.waitForTimeout(60)
  await expect(reading).toHaveText('C')
  await page.keyboard.up('d')
  await page.waitForTimeout(60)
  await expect(reading).toHaveText('C')

  await page.keyboard.up('a')
  await expect(reading).toHaveCount(0, { timeout: 1000 })
})

test('shows the octave map once the octave presses settle, then puts it away', async ({ page }) => {
  await open(page, '/lab')
  const map = page.locator('.octave-map-pop')
  // Two quick Octave + presses (X on the computer keyboard) open the map once, at the final place.
  await page.keyboard.press('x')
  await page.waitForTimeout(120)
  await page.keyboard.press('x')
  await page.waitForTimeout(150)
  await expect(map).toBeHidden()
  await expect(map).toBeVisible({ timeout: 800 })
  await expect(map).toBeHidden({ timeout: 4000 })
})
