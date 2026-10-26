// JSON backup: the only way to keep progress when site data is cleared or the address changes (plan 7).

import type { Attempt, LevelProgress, Profile, Setting, TrainerDb } from './schema'

export const BACKUP_APP = 'chord-trainer'
export const BACKUP_VERSION = 1
const TABLES = ['profile', 'levelProgress', 'attempt', 'setting']

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  profile: Profile[]
  levelProgress: LevelProgress[]
  attempt: Attempt[]
  setting: Setting[]
}

export async function exportBackup(db: TrainerDb): Promise<Backup> {
  return db.transaction('r', TABLES, async () => ({
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profile: await db.profile.toArray(),
    levelProgress: await db.levelProgress.toArray(),
    attempt: await db.attempt.toArray(),
    setting: await db.setting.toArray(),
  }))
}

export type BackupError = 'notJson' | 'notBackup' | 'newerVersion'

export class BackupParseError extends Error {
  constructor(readonly code: BackupError) {
    super(code)
  }
}

/** Checks a file's text before anything is replaced. Throws BackupParseError with a code for the UI. */
export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupParseError('notJson')
  }
  const value = data as Partial<Backup> | null
  if (!value || value.app !== BACKUP_APP || typeof value.version !== 'number') throw new BackupParseError('notBackup')
  if (value.version > BACKUP_VERSION) throw new BackupParseError('newerVersion')
  const tables = [value.profile, value.levelProgress, value.attempt, value.setting]
  if (!tables.every(Array.isArray)) throw new BackupParseError('notBackup')
  return value as Backup
}

/** Replaces everything in the database with the backup, all or nothing. */
export async function importBackup(db: TrainerDb, backup: Backup): Promise<void> {
  await db.transaction('rw', TABLES, async () => {
    await Promise.all([db.profile.clear(), db.levelProgress.clear(), db.attempt.clear(), db.setting.clear()])
    await db.profile.bulkPut(backup.profile)
    await db.levelProgress.bulkPut(backup.levelProgress)
    await db.attempt.bulkPut(backup.attempt)
    await db.setting.bulkPut(backup.setting)
  })
}
