import { expect, test } from '@playwright/test'

import { keyFor, open, reload, storeSetting } from './helpers'

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
  // Level 2 opens only after level 1's exam: start from a student who was on it.
  await expect(level(page, 2)).toBeDisabled()
  await storeSetting(page, 'trainLevel', 2)

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

test('the exam: no help, and a chord counts only when its keys go down together', async ({ page }) => {
  await open(page, '/train/chords')
  // A student who finished level 1 and has two stars on level 2: its exam.
  await page.evaluate(() => new Promise<void>((resolve) => {
    const request = indexedDB.open('chord-trainer')
    request.onsuccess = () => {
      const transaction = request.result.transaction(['profile', 'levelProgress', 'setting'], 'readwrite')
      const profiles = transaction.objectStore('profile').getAll()
      profiles.onsuccess = () => {
        const profileId = (profiles.result as { id: number }[])[0]!.id
        const store = transaction.objectStore('levelProgress')
        store.put({ profileId, level: 1, correct: 20, stars: 3, bestStreak: 0, updatedAt: 0 })
        store.put({ profileId, level: 2, correct: 10, stars: 2, bestStreak: 0, updatedAt: 0 })
        transaction.objectStore('setting').put({ profileId, key: 'trainLevel', value: 2 })
      }
      transaction.oncomplete = () => resolve()
    }
  }))
  await reload(page)
  await expect(page.getByText('Экзамен', { exact: true })).toBeVisible()
  await expect(page.locator('.formula')).toHaveCount(0)

  const prompt = (await page.locator('.prompt').textContent()) ?? ''
  const match = /Сыграй ([A-G])\S* (мажор|минор)/.exec(prompt)
  if (!match) throw new Error(`Unexpected prompt: ${prompt}`)
  const order = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const root = order.indexOf(match[1]!)
  const keys = (match[2] === 'мажор' ? [0, 4, 7] : [0, 3, 7]).map((step) => keyFor(order[(root + step) % 12]!))

  // Key by key, slower than fingers landing together: not a chord.
  for (const key of keys) {
    await page.keyboard.down(key)
    await page.waitForTimeout(300)
  }
  await expect(page.getByText(/Нажми всё сразу/)).toBeVisible()
  for (const key of keys) await page.keyboard.up(key)

  // All together: the chord counts.
  for (const key of keys) await page.keyboard.down(key)
  await expect(page.locator('.feedback--success')).toBeVisible()
  for (const key of keys) await page.keyboard.up(key)
})
