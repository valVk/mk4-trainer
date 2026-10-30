import { expect, test, type Page } from '@playwright/test'

import { keyFor, open, storedSetting } from './helpers'

const state = (page: Page) => page.evaluate(() => {
  const s = (document.querySelector('.levels-row') as unknown as { __vueParentComponent: { setupState: Record<string, unknown> } }).__vueParentComponent.setupState
  return { phase: s.phase as string, passes: s.levelPasses as number, passed: s.attemptPassed as boolean }
})

/** Seconds from the first note, as heard, of every note of the task; plays them on a computer key. */
async function playTask(page: Page, lateBy = 0) {
  const notes = await page.evaluate(() => {
    const s = (document.querySelector('.levels-row') as unknown as { __vueParentComponent: { setupState: { bpm: number, task: { notes: { duration: string, rest?: boolean }[] } } } }).__vueParentComponent.setupState
    const quarters: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, sixteenth: 0.25 }
    let time = 0
    const out: { start: number, length: number }[] = []
    for (const note of s.task.notes) {
      const length = quarters[note.duration]! * (60 / s.bpm)
      if (!note.rest) out.push({ start: time, length })
      time += length
    }
    return out
  })
  const at = (seconds: number) => page.waitForFunction(
    (t) => (document.querySelector('.levels-row') as unknown as { __vueParentComponent: { setupState: { player: { heardPosition: () => number } } } }).__vueParentComponent.setupState.player.heardPosition() >= t,
    seconds,
    { polling: 'raf', timeout: 30_000 },
  )
  for (const note of notes) {
    await at(note.start + lateBy)
    await page.keyboard.down(keyFor('C'))
    await at(note.start + lateBy + note.length * 0.85)
    await page.keyboard.up(keyFor('C'))
  }
}

// Real attempts at tempo 60 take ~12 s each (count-in bar and two bars of rhythm).
test.describe.configure({ timeout: 90_000 })

test('«Тренировка» leads to chords and theory', async ({ page }) => {
  await open(page, '/train')
  await expect(page.getByRole('link', { name: 'Аккорды' })).toBeVisible()
  await page.getByRole('link', { name: 'Теория' }).click()
  await expect(page.getByRole('tab', { name: /Ритм/ })).toHaveAttribute('aria-selected', 'true')
})

test('a rhythm played on time passes and counts once', async ({ page }) => {
  await open(page, '/train/theory')
  if ((await state(page)).phase === 'intro') await page.getByRole('button', { name: 'Понятно' }).click()
  await page.getByRole('button', { name: 'Играть' }).click()
  await playTask(page)
  await expect.poll(async () => (await state(page)).phase, { timeout: 15_000 }).toBe('result')
  expect(await state(page)).toMatchObject({ passed: true, passes: 1 })
  await expect(page.getByText('Получилось!')).toBeVisible()

  // The same rhythm again: still fine, but it does not count a second time.
  await page.getByRole('button', { name: 'Ещё раз' }).click()
  await playTask(page)
  await expect.poll(async () => (await state(page)).phase, { timeout: 15_000 }).toBe('result')
  expect(await state(page)).toMatchObject({ passed: true, passes: 1 })
})

test('a rhythm played late is not passed and says so', async ({ page }) => {
  await open(page, '/train/theory')
  if ((await state(page)).phase === 'intro') await page.getByRole('button', { name: 'Понятно' }).click()
  await page.getByRole('button', { name: 'Играть' }).click()
  await playTask(page, 0.16)
  await expect.poll(async () => (await state(page)).phase, { timeout: 15_000 }).toBe('result')
  expect(await state(page)).toMatchObject({ passed: false, passes: 0 })
  await expect(page.getByText('Отстаёшь')).toBeVisible()
})

test('saves progress of every level, not only the first', async ({ page }) => {
  await open(page, '/train/theory')
  // Two levels of passes through the page's own progress store, as finished attempts do.
  await page.evaluate(async () => {
    const s = (document.querySelector('.levels-row') as unknown as { __vueParentComponent: { setupState: { progress: { addRhythmPass: (level: number) => Promise<void> } } } }).__vueParentComponent.setupState
    for (let i = 0; i < 9; i++) await s.progress.addRhythmPass(1)
    await s.progress.addRhythmPass(2)
  })
  await expect.poll(() => storedSetting(page, 'theoryRhythm')).toEqual({ 1: { passes: 9 }, 2: { passes: 1 } })
})
