import Dexie, { type EntityTable, type Table } from 'dexie'

// Local database in the tablet's browser (IndexedDB through Dexie), plan section 7.

export interface Profile {
  id: number
  name: string
  createdAt: number
}

export interface LevelProgress {
  profileId: number
  level: number
  /** Correct answers in the level, all sessions together; stars come from it. */
  correct: number
  stars: number
  bestStreak: number
  updatedAt: number
}

export interface Attempt {
  id: number
  profileId: number
  level: number
  /** Task id from lib/levels taskId(): "C#:min:inv1". */
  task: string
  correct: boolean
  usedHint: boolean
  /** Time from showing the task to the answer (or skip). */
  ms: number
  /** MIDI notes held at the moment of the answer. */
  played: number[]
  createdAt: number
}

export interface Setting {
  /** GLOBAL_PROFILE for app-wide settings (pad map, current profile). */
  profileId: number
  key: string
  value: unknown
}

/** A MIDI file imported from the device. Stays in this browser only, never published. */
export interface SongRecord {
  id: number
  name: string
  fileName: string
  data: ArrayBuffer
  size: number
  importedAt: number
  /** Volume per part set on the song map (lib/mix); missing until a part is changed. */
  mix?: Record<number, number>
}

/** Ladder progress of one unit (phrase, section or whole part) of one part of a song. */
export interface SongProgress {
  profileId: number
  songId: number
  channel: number
  /** Unit id from lib/ladder: "p3", "s2", "all". */
  unit: string
  /** Rungs passed so far. */
  passed: number
  stars: number
  /** Best tempo-mode accuracy, 0-1. */
  bestAccuracy: number
  updatedAt: number
}

export const GLOBAL_PROFILE = 0

export type TrainerDb = Dexie & {
  profile: EntityTable<Profile, 'id'>
  /** Key: [profileId, level] */
  levelProgress: Table<LevelProgress, [number, number]>
  attempt: EntityTable<Attempt, 'id'>
  /** Key: [profileId, key] */
  setting: Table<Setting, [number, string]>
  song: EntityTable<SongRecord, 'id'>
  /** Key: [profileId, songId, channel, unit] */
  songProgress: Table<SongProgress, [number, number, number, string]>
}

export function createDb(name = 'chord-trainer'): TrainerDb {
  const db = new Dexie(name) as TrainerDb
  db.version(1).stores({
    profile: '++id, name',
    levelProgress: '[profileId+level], profileId',
    attempt: '++id, profileId, [profileId+task], createdAt',
    setting: '[profileId+key], profileId',
  })
  // Song mode (plan step 10): imported MIDI files.
  db.version(2).stores({
    song: '++id, name, importedAt',
  })
  // Song mode (plan step 12): ladder progress per unit.
  db.version(3).stores({
    songProgress: '[profileId+songId+channel+unit], [profileId+songId], songId',
  })
  return db
}
