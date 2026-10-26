import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { BackupParseError, base64ToBytes, bytesToBase64, exportBackup, importBackup, parseBackup } from '@/db/backup'
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
import { addSong, deleteSong, getSong, getSongProgress, listSongs, saveUnitResult } from '@/db/songs'

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
    expect(code('{"app":"chord-trainer","version":1,"profile":[],"levelProgress":[],"attempt":[],"setting":[],"song":"x"}')).toBe('notBackup')
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

describe('song progress', () => {
  const result = (unit: string, passed: number, stars: number, bestAccuracy = 0, profileId = 1, songId = 7, channel = 0) =>
    ({ profileId, songId, channel, unit, passed, stars, bestAccuracy })

  it('saves per unit and never lowers a result', async () => {
    const db = freshDb()
    await saveUnitResult(db, result('p0', 3, 1, 0.5))
    const lower = await saveUnitResult(db, result('p0', 2, 0, 0.4))
    expect(lower).toMatchObject({ passed: 3, stars: 1, bestAccuracy: 0.5 })
    await saveUnitResult(db, result('p0', 5, 3, 0.9))
    await saveUnitResult(db, result('all', 1, 2, 0.85))
    const saved = await getSongProgress(db, 1, 7)
    expect(saved.map((row) => [row.unit, row.passed, row.stars]).sort()).toEqual([['all', 1, 2], ['p0', 5, 3]])
  })

  it('keeps players and songs apart and is removed with the song', async () => {
    const db = freshDb()
    const { id } = await addSong(db, { name: 'S', fileName: 's.mid', data: new ArrayBuffer(4), size: 4, importedAt: 1 })
    await saveUnitResult(db, result('p0', 1, 0, 0, 1, id))
    await saveUnitResult(db, result('p0', 2, 0, 0, 2, id))
    expect(await getSongProgress(db, 1, id)).toHaveLength(1)
    expect(await getSongProgress(db, 2, id)).toHaveLength(1)
    await deleteSong(db, id)
    expect(await db.songProgress.count()).toBe(0)
  })
})

describe('backup with songs', () => {
  it('round-trips bytes through base64, also for large files', () => {
    const big = new Uint8Array(200_000).map((_, i) => (i * 7) % 256)
    expect(new Uint8Array(base64ToBytes(bytesToBase64(big.buffer)))).toEqual(big)
  })

  it('exports and imports songs and their progress', async () => {
    const source = freshDb()
    const bytes = new Uint8Array([77, 84, 104, 100, 0, 0, 0, 6]).buffer
    const { id } = await addSong(source, { name: 'Song', fileName: 'song.mid', data: bytes, size: 8, importedAt: 5 })
    await saveUnitResult(source, { profileId: 1, songId: id, channel: 1, unit: 'p0', passed: 5, stars: 3, bestAccuracy: 1 })
    const text = JSON.stringify(await exportBackup(source))
    expect(text).toContain('"song":[{')

    const target = freshDb()
    await addSong(target, { name: 'Other', fileName: 'other.mid', data: new ArrayBuffer(2), size: 2, importedAt: 1 })
    await importBackup(target, parseBackup(text))
    expect((await listSongs(target)).map((song) => song.name)).toEqual(['Song'])
    expect(new Uint8Array((await getSong(target, id))!.data)).toEqual(new Uint8Array(bytes))
    expect(await getSongProgress(target, 1, id)).toHaveLength(1)
  })

  it('still imports version 1 files (no songs) and clears old songs', async () => {
    const db = freshDb()
    await addSong(db, { name: 'Old', fileName: 'old.mid', data: new ArrayBuffer(2), size: 2, importedAt: 1 })
    const v1 = JSON.stringify({ app: 'chord-trainer', version: 1, exportedAt: '', profile: [{ id: 1, name: 'Маша', createdAt: 1 }], levelProgress: [], attempt: [], setting: [] })
    await importBackup(db, parseBackup(v1))
    expect(await listSongs(db)).toEqual([])
    expect((await db.profile.toArray()).map((p) => p.name)).toEqual(['Маша'])
  })
})
