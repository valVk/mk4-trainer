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

// «Читаем с ритмом» (Н9): a melody in time. The levels before it are opened through the page's own progress store.
const NAME_OF: Record<number, string> = { 60: 'C', 62: 'D', 64: 'E', 65: 'F', 67: 'G' }

async function openReading(page: Page) {
  await open(page, '/train/theory?section=notes')
  await page.evaluate(async () => {
    const s = (document.querySelector('.levels-row') as unknown as { __vueParentComponent: { setupState: { progress: { addNoteCorrect: (level: number) => Promise<void> } } } }).__vueParentComponent.setupState
    for (let level = 1; level <= 8; level++) for (let i = 0; i < 20; i++) await s.progress.addNoteCorrect(level)
  })
  await page.getByRole('tab', { name: 'Н9' }).click()
  await page.getByRole('button', { name: 'Понятно' }).click()
  // The keys start at C3 like the MK4; the melodies lie on C4-G4: one Octave + (X on the computer keyboard).
  await page.keyboard.press('x')
}

/** Plays the melody on the computer keys after Octave + (C4 up), every note at its heard time; `wrongAt` plays one note a step too high. */
async function playMelody(page: Page, wrongAt: number | null = null) {
  const notes = await page.evaluate(() => {
    const s = (document.querySelector('.task') as unknown as { __vueParentComponent: { setupState: { bpm: number, melody: { notes: { duration: string, rest?: boolean, key?: number }[] } } } }).__vueParentComponent.setupState
    const quarters: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, sixteenth: 0.25 }
    let time = 0
    const out: { start: number, length: number, key: number }[] = []
    for (const note of s.melody.notes) {
      const length = quarters[note.duration]! * (60 / s.bpm)
      if (!note.rest) out.push({ start: time, length, key: note.key! })
      time += length
    }
    return out
  })
  const at = (seconds: number) => page.waitForFunction(
    (t) => (document.querySelector('.task') as unknown as { __vueParentComponent: { setupState: { player: { heardPosition: () => number } } } }).__vueParentComponent.setupState.player.heardPosition() >= t,
    seconds,
    { polling: 'raf', timeout: 30_000 },
  )
  await page.getByRole('button', { name: 'Играть' }).click()
  for (const [i, note] of notes.entries()) {
    const key = keyFor(NAME_OF[i === wrongAt ? (note.key === 67 ? 65 : note.key + (note.key === 64 ? 1 : 2)) : note.key]!)
    await at(note.start)
    await page.keyboard.down(key)
    await at(note.start + note.length * 0.85)
    await page.keyboard.up(key)
  }
}

test.describe('reading in rhythm', () => {
  // An attempt at 60 BPM: a count-in bar and two bars of melody, about 12 s.
  test.describe.configure({ timeout: 90_000 })

  test('the right keys in time pass and count', async ({ page }) => {
    await openReading(page)
    await playMelody(page)
    await expect(page.getByText('Получилось!')).toBeVisible({ timeout: 5000 })
    await expect.poll(async () => ((await storedSetting(page, 'theoryNotes')) as Record<number, { correct: number }>)[9]?.correct).toBe(1)
  })

  test('a wrong key fails and says which notes', async ({ page }) => {
    await openReading(page)
    await playMelody(page, 1)
    await expect(page.getByText('Красные ноты — другая клавиша')).toBeVisible({ timeout: 5000 })
  })
})
