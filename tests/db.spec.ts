import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { BackupParseError, exportBackup, importBackup, parseBackup } from '@/db/backup'
import {
  CURRENT_PROFILE_KEY,
  addProfile,
  ensureProfile,
  getLevels,
  getSetting,
  recordAttempt,
  setSetting,
  weakTasks,
  type AttemptInput,
} from '@/db/progress'
import { GLOBAL_PROFILE, createDb, type TrainerDb } from '@/db/schema'
import { addSong, deleteSong, getSong, listSongs } from '@/db/songs'

let counter = 0
const opened: TrainerDb[] = []

function freshDb(): TrainerDb {
  const db = createDb(`test-${counter++}`)
  opened.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((db) => db.delete()))
})

const attempt = (overrides: Partial<AttemptInput> = {}): AttemptInput => ({
  profileId: 1,
  level: 2,
  task: 'C:maj',
  correct: true,
  usedHint: false,
  ms: 1500,
  played: [60, 64, 67],
  streak: 1,
  ...overrides,
})

describe('profiles and settings', () => {
  it('creates a first profile and remembers it', async () => {
    const db = freshDb()
    const profile = await ensureProfile(db, 'Игрок')
    expect(profile.name).toBe('Игрок')
    expect(await getSetting(db, GLOBAL_PROFILE, CURRENT_PROFILE_KEY)).toBe(profile.id)
    expect((await ensureProfile(db, 'Другой')).id).toBe(profile.id)
    expect(await db.profile.count()).toBe(1)
  })

  it('returns the remembered profile among several', async () => {
    const db = freshDb()
    await ensureProfile(db, 'Первый')
    const second = await addProfile(db, '  Второй ')
    await setSetting(db, GLOBAL_PROFILE, CURRENT_PROFILE_KEY, second.id)
    expect(await ensureProfile(db, 'x')).toMatchObject({ id: second.id, name: 'Второй' })
  })

  it('keeps settings per profile', async () => {
    const db = freshDb()
    await setSetting(db, 1, 'instrument', 'piano')
    await setSetting(db, 2, 'instrument', 'organ')
    await setSetting(db, 1, 'instrument', 'strings')
    expect(await getSetting(db, 1, 'instrument')).toBe('strings')
    expect(await getSetting(db, 2, 'instrument')).toBe('organ')
    expect(await getSetting(db, 3, 'instrument')).toBeUndefined()
  })
})

describe('recordAttempt', () => {
  it('logs attempts and keeps level totals, stars and best streak', async () => {
    const db = freshDb()
    for (let i = 1; i <= 5; i++) await recordAttempt(db, attempt({ streak: i }))
    await recordAttempt(db, attempt({ correct: false, streak: 0 }))
    const level = await recordAttempt(db, attempt({ streak: 1 }))
    expect(level).toMatchObject({ correct: 6, stars: 1, bestStreak: 5 })
    expect(await db.attempt.count()).toBe(7)
    expect((await getLevels(db, 1))[2]).toMatchObject({ correct: 6, stars: 1 })
    expect(await getLevels(db, 2)).toEqual({})
  })

  it('finds weak spots: misses first, then the slowest', async () => {
    const db = freshDb()
    await recordAttempt(db, attempt({ task: 'C:maj' }))
    await recordAttempt(db, attempt({ task: 'F#:min', correct: false }))
    await recordAttempt(db, attempt({ task: 'F#:min', correct: false }))
    await recordAttempt(db, attempt({ task: 'D:min', usedHint: true, ms: 4000 }))
    await recordAttempt(db, attempt({ task: 'D:min' }))
    await recordAttempt(db, attempt({ task: 'E:maj', usedHint: true, ms: 9000 }))
    await recordAttempt(db, attempt({ task: 'E:maj' }))
    expect((await weakTasks(db, 1)).map((stats) => stats.task)).toEqual(['F#:min', 'E:maj', 'D:min'])
  })
})

describe('backup', () => {
  it('exports and imports everything', async () => {
    const source = freshDb()
    const profile = await ensureProfile(source, 'Маша')
    await recordAttempt(source, attempt({ profileId: profile.id }))
    await setSetting(source, GLOBAL_PROFILE, 'padMap', { channel: 10, notes: [44, 45, 46, 47, 48, 49, 50, 51] })
    const backup = await exportBackup(source)
    const text = JSON.stringify(backup)

    const target = freshDb()
    await addProfile(target, 'Старый')
    await importBackup(target, parseBackup(text))
    expect(await target.profile.toArray()).toEqual(await source.profile.toArray())
    expect(await target.attempt.count()).toBe(1)
    expect(await getSetting(target, GLOBAL_PROFILE, 'padMap')).toEqual({ channel: 10, notes: [44, 45, 46, 47, 48, 49, 50, 51] })
    expect((await getLevels(target, profile.id))[2]).toMatchObject({ correct: 1 })
  })

  it('rejects files that are not a backup', () => {
    const code = (text: string) => {
      try {
        parseBackup(text)
        return 'ok'
      } catch (error) {
        return error instanceof BackupParseError ? error.code : 'other'
      }
    }
    expect(code('not json')).toBe('notJson')
    expect(code('{"app":"other","version":1}')).toBe('notBackup')
    expect(code('{"app":"chord-trainer","version":1,"profile":[]}')).toBe('notBackup')
    expect(code('{"app":"chord-trainer","version":99,"profile":[],"levelProgress":[],"attempt":[],"setting":[]}')).toBe('newerVersion')
  })
})

describe('songs', () => {
  const bytes = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i % 256)).buffer

  it('stores songs and lists them newest first without the MIDI bytes', async () => {
    const db = freshDb()
    await addSong(db, { name: 'Old', fileName: 'old.mid', data: bytes(10), size: 10, importedAt: 1 })
    const added = await addSong(db, { name: 'New', fileName: 'new.mid', data: bytes(20), size: 20, importedAt: 2 })
    expect(added).not.toHaveProperty('data')
    const list = await listSongs(db)
    expect(list.map((song) => song.name)).toEqual(['New', 'Old'])
    expect(list.every((song) => !('data' in song))).toBe(true)
  })

  it('returns the bytes of one song and deletes it', async () => {
    const db = freshDb()
    const { id } = await addSong(db, { name: 'Song', fileName: 'song.mid', data: bytes(16), size: 16, importedAt: 1 })
    const song = await getSong(db, id)
    expect(new Uint8Array(song!.data)).toEqual(new Uint8Array(bytes(16)))
    await deleteSong(db, id)
    expect(await getSong(db, id)).toBeUndefined()
    expect(await listSongs(db)).toEqual([])
  })

  it('keeps existing progress when the database is upgraded to version 2', async () => {
    const name = `upgrade-${counter++}`
    const { default: Dexie } = await import('dexie')
    const old = new Dexie(name)
    old.version(1).stores({ profile: '++id, name', levelProgress: '[profileId+level], profileId', attempt: '++id, profileId, [profileId+task], createdAt', setting: '[profileId+key], profileId' })
    await old.table('profile').add({ name: 'Маша', createdAt: 1 })
    old.close()
    const db = createDb(name)
    opened.push(db)
    expect((await db.profile.toArray()).map((p) => p.name)).toEqual(['Маша'])
    expect(await db.song.count()).toBe(0)
  })
})
