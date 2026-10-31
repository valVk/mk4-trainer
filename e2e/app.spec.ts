import { expect, test } from '@playwright/test'

import { open, scrollSize } from './helpers'

// Main screens fill a landscape Tab S10 without scrolling (plan 8.2, landscape only).
for (const path of ['/', '/train', '/train/chords', '/train/theory', '/train/theory?section=notes', '/train/theory?section=accidentals', '/train/theory?section=intervals', '/train/theory?section=scales', '/train/theory?section=functions', '/train/theory?section=sevenths', '/lab', '/rhythm']) {
  test(`${path} fits the screen without scrolling`, async ({ page }) => {
    await open(page, path)
    const viewport = page.viewportSize()!
    const size = await scrollSize(page)
    expect(size.width).toBeLessThanOrEqual(viewport.width)
    expect(size.height).toBeLessThanOrEqual(viewport.height)
  })
}

test('asks for sound once, and «Пока без звука» holds for the visit', async ({ page }) => {
  await page.goto('/lab')
  await expect(page.getByRole('button', { name: 'Включить звук' })).toBeVisible()
  await page.getByRole('button', { name: 'Пока без звука' }).click()
  await expect(page.getByRole('button', { name: 'Включить звук' })).toBeHidden()

  // Moving to another screen with sound inside the app does not ask again. Back is in the header row.
  await page.getByRole('link', { name: 'Главная' }).first().click()
  await page.getByRole('link', { name: 'Тренировка' }).click()
  await page.getByRole('link', { name: 'Аккорды' }).click()
  await page.locator('main.train').waitFor()
  await expect(page.getByRole('button', { name: 'Включить звук' })).toBeHidden()
  await page.getByRole('button', { name: /^Меню/ }).click()
  await expect(page.getByRole('button', { name: 'Звук выключен' })).toBeVisible()
})

test('home pads share one icon and label size', async ({ page }) => {
  await open(page, '/')
  const sizes = await page.locator('.pad').evaluateAll((pads) => pads.map((pad) => ({
    icon: Math.round(pad.querySelector('.pad__icon')!.getBoundingClientRect().width),
    label: getComputedStyle(pad.querySelector('.pad__label')!).fontSize,
  })))
  expect(sizes).toHaveLength(5)
  expect(new Set(sizes.map((size) => `${size.icon}/${size.label}`)).size).toBe(1)
})

test.describe('portrait on a touch tablet', () => {
  test.use({ viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true })

  test('asks to turn the tablet', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Поверни планшет')).toBeVisible()
  })
})

test('without Web MIDI the MK4 state says calmly that it needs Chrome', async ({ page }) => {
  // Safari and Firefox have no Web MIDI: the app still works with the screen keys.
  await page.addInitScript(() => {
    delete (Navigator.prototype as unknown as { requestMIDIAccess?: unknown }).requestMIDIAccess
  })
  await open(page, '/lab')
  await page.getByRole('button', { name: /^Меню/ }).click()
  await page.getByRole('button', { name: 'MK4: нужен Chrome' }).click()
  await expect(page.getByText(/работают в любом браузере/)).toBeVisible()
})

// Phones in landscape (plan step 30): the main screens fit there too.
test.describe('on a phone in landscape', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true })
  for (const path of ['/', '/train', '/train/chords', '/train/theory', '/train/theory?section=notes', '/lab', '/rhythm']) {
    test(`${path} fits without scrolling`, async ({ page }) => {
      await open(page, path)
      const size = await scrollSize(page)
      expect(size.width).toBeLessThanOrEqual(844)
      expect(size.height).toBeLessThanOrEqual(390)
    })
  }
})
