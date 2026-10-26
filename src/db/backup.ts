// JSON backup: the only way to keep progress when site data is cleared or the address changes (plan 7).

import type { Attempt, LevelProgress, Profile, Setting, SongProgress, SongRecord, TrainerDb } from './schema'

export const BACKUP_APP = 'chord-trainer'
/** 2: imported songs and their ladder progress are included. Version 1 files still import. */
export const BACKUP_VERSION = 2
const TABLES = ['profile', 'levelProgress', 'attempt', 'setting', 'song', 'songProgress']

/** A song as stored in the backup file: the MIDI bytes as base64 text. */
export type BackupSong = Omit<SongRecord, 'data'> & { data: string }

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  profile: Profile[]
  levelProgress: LevelProgress[]
  attempt: Attempt[]
  setting: Setting[]
  /** Missing in version 1 files. */
  song?: BackupSong[]
  songProgress?: SongProgress[]
}

export function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  // In chunks: String.fromCharCode with a whole song as arguments overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export function base64ToBytes(text: string): ArrayBuffer {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
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
    song: (await db.song.toArray()).map((song) => ({ ...song, data: bytesToBase64(song.data) })),
    songProgress: await db.songProgress.toArray(),
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
  const optional = [value.song, value.songProgress]
  if (!optional.every((table) => table === undefined || Array.isArray(table))) throw new BackupParseError('notBackup')
  return value as Backup
}

/** Replaces everything in the database with the backup, all or nothing. */
export async function importBackup(db: TrainerDb, backup: Backup): Promise<void> {
  await db.transaction('rw', TABLES, async () => {
    await Promise.all([
      db.profile.clear(), db.levelProgress.clear(), db.attempt.clear(), db.setting.clear(), db.song.clear(), db.songProgress.clear(),
    ])
    await db.profile.bulkPut(backup.profile)
    await db.levelProgress.bulkPut(backup.levelProgress)
    await db.attempt.bulkPut(backup.attempt)
    await db.setting.bulkPut(backup.setting)
    await db.song.bulkPut((backup.song ?? []).map((song) => ({ ...song, data: base64ToBytes(song.data) })))
    await db.songProgress.bulkPut(backup.songProgress ?? [])
  })
}
