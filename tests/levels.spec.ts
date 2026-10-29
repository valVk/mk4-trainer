import { describe, expect, it } from 'vitest'

import {
  LEVELS,
  PROGRESSIONS,
  STAR_THRESHOLDS,
  STREAK_TO_FADE,
  checkTask,
  generateTask,
  getLevel,
  hintStage,
  progressionTask,
  starsFor,
  taskId,
  taskNotes,
  type ProgressionId,
  type Task,
} from '@/lib/levels'
import { fitsWindow } from '@/lib/keyboard'
import { CHORD_FORMULAS, identifyChord, noteName } from '@/lib/theory'

/** Deterministic random source for repeatable tests. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32
    return state / 2 ** 32
  }
}

const WHITE = [0, 2, 4, 5, 7, 9, 11]
const BLACK = [1, 3, 6, 8, 10]

describe('generateTask', () => {
  it('level 1 asks for white-key notes only', () => {
    const random = seeded(1)
    for (let i = 0; i < 200; i++) {
      const task = generateTask(1, random)
      expect(task.kind).toBe('note')
      expect(WHITE).toContain(task.root)
    }
  })

  it('level 2 asks for major or minor chords on white keys', () => {
    const random = seeded(2)
    const types = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const task = generateTask(2, random)
      expect(task.kind).toBe('chord')
      expect(WHITE).toContain(task.root)
      if (task.kind === 'chord') types.add(task.type)
    }
    expect([...types].sort()).toEqual(['maj', 'min'])
  })

  it('levels 3 and 4 also use black keys', () => {
    for (const level of [3, 4]) {
      const random = seeded(level)
      const roots = new Set(Array.from({ length: 300 }, () => generateTask(level, random).root))
      for (const pc of BLACK) expect(roots).toContain(pc)
    }
  })

  it('never repeats the previous task', () => {
    const random = seeded(7)
    const tasks = [generateTask(1, random)]
    for (let i = 0; i < 300; i++) tasks.push(generateTask(1, random, tasks[tasks.length - 1]))
    const repeats = tasks.filter((task, i) => i > 0 && task.root === tasks[i - 1]?.root)
    expect(repeats).toEqual([])
  })

  it('still changes the task with a stuck random source', () => {
    const previous: Task = { kind: 'note', root: 0 }
    expect(generateTask(1, () => 0, previous)).not.toEqual(previous)
  })

  it('rejects unknown levels', () => {
    expect(() => getLevel(9)).toThrow(RangeError)
  })
})

describe('taskNotes', () => {
  it('builds root-position notes from the keyboard start', () => {
    expect(taskNotes({ kind: 'note', root: 4 }, 48)).toEqual([52])
    expect(taskNotes({ kind: 'chord', root: 0, type: 'maj' }, 60)).toEqual([60, 64, 67])
    expect(taskNotes({ kind: 'chord', root: 9, type: 'min' }, 60)).toEqual([69, 72, 76])
  })

  it('every task of every level fits on the 25 keys for any start', () => {
    const tasks: Task[] = []
    for (const level of LEVELS) {
      for (const root of level.roots) {
        if (level.kind === 'note') tasks.push({ kind: 'note', root })
        if (level.kind === 'progression') {
          for (const id of Object.keys(PROGRESSIONS) as ProgressionId[]) tasks.push(progressionTask(root, id))
        }
        for (const type of level.types) {
          const inversions = level.inversions ? CHORD_FORMULAS[type].length : 1
          for (let inversion = 0; inversion < inversions; inversion++) {
            tasks.push(level.inversions ? { kind: 'chord', root, type, inversion } : { kind: 'chord', root, type })
          }
        }
      }
    }
    const misfits: string[] = []
    for (const task of tasks) {
      const steps = task.kind === 'progression' ? task.steps.length : 1
      for (let start = 0; start <= 96; start += 12) {
        for (let step = 0; step < steps; step++) {
          if (!fitsWindow(taskNotes(task, start, step), start)) misfits.push(`${taskId(task, noteName)}@${start}`)
        }
      }
    }
    expect(tasks.length).toBeGreaterThan(200)
    expect(misfits).toEqual([])
  })

  it('keeps the asked inversion when moving down an octave', () => {
    const notes = taskNotes({ kind: 'chord', root: 11, type: 'maj', inversion: 2 }, 60)
    expect(notes).toEqual([66, 71, 75])
    expect(identifyChord(notes)[0]).toMatchObject({ root: 11, type: 'maj', inversion: 2 })
  })
})

describe('checkTask', () => {
  const findE: Task = { kind: 'note', root: 4 }
  const aMinor: Task = { kind: 'chord', root: 9, type: 'min' }

  it('accepts the note in any octave, doublings included', () => {
    expect(checkTask(findE, [52]).status).toBe('correct')
    expect(checkTask(findE, [64, 76]).status).toBe('correct')
  })

  it('reports a wrong note and an extra one', () => {
    expect(checkTask(findE, [])).toEqual({ status: 'empty', missing: [], extra: [] })
    expect(checkTask(findE, [62])).toEqual({ status: 'wrong', missing: [4], extra: [2] })
    expect(checkTask(findE, [64, 62])).toEqual({ status: 'extra', missing: [], extra: [2] })
  })

  it('checks chords by pitch class in any inversion', () => {
    expect(checkTask(aMinor, [57, 60, 64]).status).toBe('correct')
    expect(checkTask(aMinor, [60, 64, 69]).status).toBe('correct')
    expect(checkTask(aMinor, [57, 60]).status).toBe('incomplete')
    expect(checkTask(aMinor, [57, 61, 64]).status).toBe('wrong')
  })

  it('turns correct when an extra note is released', () => {
    expect(checkTask(aMinor, [57, 60, 62, 64]).status).toBe('extra')
    expect(checkTask(aMinor, [57, 60, 64]).status).toBe('correct')
  })
})

describe('hints and stars', () => {
  it('fades hints after a streak of correct answers', () => {
    expect(hintStage(2, 0)).toBe('namesHighlight')
    expect(hintStage(2, STREAK_TO_FADE - 1)).toBe('namesHighlight')
    expect(hintStage(2, STREAK_TO_FADE)).toBe('highlight')
    expect(hintStage(2, 100)).toBe('highlight')
    expect(hintStage(3, STREAK_TO_FADE)).toBe('none')
    expect(hintStage(4, 100)).toBe('formula')
  })

  it('gives stars at the thresholds', () => {
    expect(starsFor(0)).toBe(0)
    expect(starsFor(STAR_THRESHOLDS[0])).toBe(1)
    expect(starsFor(STAR_THRESHOLDS[1])).toBe(2)
    expect(starsFor(STAR_THRESHOLDS[2] + 10)).toBe(3)
  })

  it('builds attempt ids', () => {
    expect(taskId({ kind: 'chord', root: 1, type: 'min' }, (pc) => noteName(pc))).toBe('C#:min')
    expect(taskId({ kind: 'note', root: 4 }, (pc) => noteName(pc))).toBe('E:note')
  })
})

describe('levels 5-8', () => {
  it('level 5 asks for every inversion of major and minor', () => {
    const random = seeded(5)
    const tasks = Array.from({ length: 200 }, () => generateTask(5, random))
    const inversions = new Set(tasks.map((task) => (task.kind === 'chord' ? task.inversion : undefined)))
    expect([...inversions].sort()).toEqual([0, 1, 2])
  })

  it('level 5 needs the right bass', () => {
    const task: Task = { kind: 'chord', root: 0, type: 'maj', inversion: 1 }
    expect(checkTask(task, [64, 67, 72]).status).toBe('correct')
    expect(checkTask(task, [60, 64, 67]).status).toBe('wrongInversion')
  })

  it('levels 6 and 7 use the new chord types', () => {
    const types = (level: number) => {
      const random = seeded(level)
      return [...new Set(Array.from({ length: 300 }, () => {
        const task = generateTask(level, random)
        return task.kind === 'chord' ? task.type : 'x'
      }))].sort()
    }
    expect(types(6)).toEqual(['aug', 'dim', 'sus2', 'sus4'])
    expect(types(7)).toEqual(['7', 'm7', 'maj7'])
  })

  it('level 8 builds progressions from the key', () => {
    const steps = (task: Task) => (task.kind === 'progression' ? task.steps : [])
    expect(steps(progressionTask(7, 'pop')).map((step) => step.roman)).toEqual(['I', 'V', 'vi', 'IV'])
    expect(steps(progressionTask(7, 'pop')).map((step) => `${noteName(step.root)}${step.type}`)).toEqual(['Gmaj', 'Dmaj', 'Emin', 'Cmaj'])
    expect(steps(progressionTask(0, 'jazz')).map((step) => step.roman)).toEqual(['ii', 'V', 'I'])
    expect(generateTask(8, seeded(8)).kind).toBe('progression')
  })

  it('checks a progression one chord at a time', () => {
    const task = progressionTask(0, 'rock')
    expect(checkTask(task, [60, 64, 67], 0).status).toBe('correct')
    expect(checkTask(task, [60, 64, 67], 1).status).toBe('wrong')
    expect(checkTask(task, [65, 69, 72], 1).status).toBe('correct')
    expect(taskNotes(task, 60, 2)).toEqual([67, 71, 74])
  })

  it('gives progressions and inversions their own attempt ids', () => {
    expect(taskId(progressionTask(7, 'pop'), noteName)).toBe('G:pop')
    expect(taskId({ kind: 'chord', root: 1, type: 'min', inversion: 2 }, noteName)).toBe('C#:min:inv2')
    expect(taskId({ kind: 'chord', root: 2, type: 'sus4' }, noteName)).toBe('D:sus4')
  })
})
