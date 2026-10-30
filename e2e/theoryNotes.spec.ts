import { expect, test, type Page } from '@playwright/test'

import { keyFor, open, storedSetting } from './helpers'

// «Теория» → «Ноты», level Н1: the name of a note → press its key, any octave.
const LETTER: Record<string, string> = { до: 'C', ре: 'D', ми: 'E', фа: 'F', соль: 'G', ля: 'A', си: 'B' }

async function openNames(page: Page): Promise<string> {
  await open(page, '/train/theory?section=notes')
  await page.getByRole('button', { name: 'Понятно' }).click()
  const name = (await page.locator('.big-name').textContent())?.trim() ?? ''
  const letter = LETTER[name]
  if (!letter) throw new Error(`Unexpected note name: ${name}`)
  return letter
}

test('praises the right key at once and saves it', async ({ page }) => {
  const letter = await openNames(page)
  await page.keyboard.down(keyFor(letter))
  await expect(page.locator('.big-name--right')).toBeVisible({ timeout: 150 })
  await page.keyboard.up(keyFor(letter))
  await expect.poll(() => storedSetting(page, 'theoryNotes')).toEqual({ 1: { correct: 1 } })
})

test('says «другая нота» only after the finger has settled', async ({ page }) => {
  const letter = await openNames(page)
  const wrong = letter === 'C' ? 'E' : 'C'
  await page.keyboard.down(keyFor(wrong))
  await page.waitForTimeout(100)
  await expect(page.getByText('Это другая нота')).toBeHidden()
  await page.waitForTimeout(450)
  await expect(page.getByText('Это другая нота')).toBeVisible()
  await page.keyboard.up(keyFor(wrong))
  await expect(page.getByText('Это другая нота')).toBeHidden()
})

test('lights the key up only after time to look for it', async ({ page }) => {
  await openNames(page)
  await page.waitForTimeout(800)
  await expect(page.locator('.key--hint')).toBeHidden()
  await expect(page.locator('.key--hint')).toBeVisible({ timeout: 2500 })
})
