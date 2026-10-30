import { expect, test } from '@playwright/test'

import { open, scrollSize } from './helpers'

// Main screens fill a landscape Tab S10 without scrolling (plan 8.2, landscape only).
for (const path of ['/', '/train', '/train/chords', '/train/theory', '/lab', '/rhythm']) {
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

  // Moving to another screen with sound inside the app does not ask again.
  await page.getByRole('link', { name: 'Главная' }).first().click()
  await page.getByRole('link', { name: 'Тренировка' }).click()
  await page.getByRole('link', { name: 'Аккорды' }).click()
  await page.locator('main.train').waitFor()
  await expect(page.getByRole('button', { name: 'Включить звук' })).toBeHidden()
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
