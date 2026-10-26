// Reads and writes for training progress. No Vue here: useProgress wraps these for the UI.

import { starsFor } from '@/lib/levels'

import { GLOBAL_PROFILE, type Attempt, type LevelProgress, type Profile, type TrainerDb } from './schema'

export const CURRENT_PROFILE_KEY = 'currentProfile'

/** The profile to play as: the remembered one, else the first, else a new one. */
export async function ensureProfile(db: TrainerDb, defaultName: string): Promise<Profile> {
  const remembered = await getSetting<number>(db, GLOBAL_PROFILE, CURRENT_PROFILE_KEY)
  const profile = (remembered !== undefined && await db.profile.get(remembered)) || await db.profile.orderBy('id').first()
  if (profile) return profile
  const created = { name: defaultName, createdAt: Date.now() }
  const id = await db.profile.add(created as Profile)
  await setSetting(db, GLOBAL_PROFILE, CURRENT_PROFILE_KEY, id)
  return { ...created, id }
}

export async function addProfile(db: TrainerDb, name: string): Promise<Profile> {
  const created = { name: name.trim(), createdAt: Date.now() }
  const id = await db.profile.add(created as Profile)
  return { ...created, id }
}

export async function renameProfile(db: TrainerDb, id: number, name: string): Promise<void> {
  await db.profile.update(id, { name: name.trim() })
}

export async function getSetting<T>(db: TrainerDb, profileId: number, key: string): Promise<T | undefined> {
  const row = await db.setting.get([profileId, key])
  return row?.value as T | undefined
}

export async function setSetting(db: TrainerDb, profileId: number, key: string, value: unknown): Promise<void> {
  await db.setting.put({ profileId, key, value })
}

export async function deleteSetting(db: TrainerDb, profileId: number, key: string): Promise<void> {
  await db.setting.delete([profileId, key])
}

export async function getLevels(db: TrainerDb, profileId: number): Promise<Record<number, LevelProgress>> {
  const rows = await db.levelProgress.where('profileId').equals(profileId).toArray()
  return Object.fromEntries(rows.map((row) => [row.level, row]))
}

export interface AttemptInput {
  profileId: number
  level: number
  task: string
  correct: boolean
  usedHint: boolean
  ms: number
  played: readonly number[]
  /** Correct answers in a row, including this one. */
  streak: number
}

/** Logs one answer or skip and updates the level totals in one transaction. */
export async function recordAttempt(db: TrainerDb, input: AttemptInput): Promise<LevelProgress> {
  const now = Date.now()
  return db.transaction('rw', ['attempt', 'levelProgress'], async () => {
    await db.attempt.add({
      profileId: input.profileId,
      level: input.level,
      task: input.task,
      correct: input.correct,
      usedHint: input.usedHint,
      ms: Math.round(input.ms),
      played: [...input.played],
      createdAt: now,
    } as Attempt)
    const current = await db.levelProgress.get([input.profileId, input.level])
    const correct = (current?.correct ?? 0) + (input.correct ? 1 : 0)
    const next: LevelProgress = {
      profileId: input.profileId,
      level: input.level,
      correct,
      stars: starsFor(correct),
      bestStreak: Math.max(current?.bestStreak ?? 0, input.streak),
      updatedAt: now,
    }
    await db.levelProgress.put(next)
    return next
  })
}

export interface TaskStats {
  task: string
  tries: number
  misses: number
  avgMs: number
}

/**
 * Tasks the child finds hardest (plan 7: pick tasks for weak spots):
 * most misses (skips and hint use) first, then the slowest.
 */
export async function weakTasks(db: TrainerDb, profileId: number, limit = 5): Promise<TaskStats[]> {
  const attempts = await db.attempt.where('profileId').equals(profileId).toArray()
  const byTask = new Map<string, { tries: number, misses: number, ms: number }>()
  for (const attempt of attempts) {
    const stats = byTask.get(attempt.task) ?? { tries: 0, misses: 0, ms: 0 }
    stats.tries++
    if (!attempt.correct || attempt.usedHint) stats.misses++
    stats.ms += attempt.ms
    byTask.set(attempt.task, stats)
  }
  return [...byTask.entries()]
    .map(([task, stats]) => ({ task, tries: stats.tries, misses: stats.misses, avgMs: Math.round(stats.ms / stats.tries) }))
    .filter((stats) => stats.misses > 0)
    .sort((a, b) => b.misses / b.tries - a.misses / a.tries || b.avgMs - a.avgMs)
    .slice(0, limit)
}
