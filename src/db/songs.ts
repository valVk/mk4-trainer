// Imported songs. Pages reach them only through useProgress (plan section 7).

import type { SongProgress, SongRecord, TrainerDb } from './schema'

/** What the song list shows; the MIDI bytes stay in the database until a song is opened. */
export type SongSummary = Omit<SongRecord, 'data'>

export async function addSong(db: TrainerDb, song: Omit<SongRecord, 'id'>): Promise<SongSummary> {
  const id = await db.song.add(song as SongRecord)
  const { data: _data, ...summary } = { ...song, id }
  return summary
}

/** Newest first, without the MIDI bytes. */
export async function listSongs(db: TrainerDb): Promise<SongSummary[]> {
  const songs: SongSummary[] = []
  await db.song.orderBy('importedAt').reverse().each(({ data: _data, ...summary }) => {
    songs.push(summary)
  })
  return songs
}

export async function getSong(db: TrainerDb, id: number): Promise<SongRecord | undefined> {
  return db.song.get(id)
}

export async function setSongMix(db: TrainerDb, id: number, mix: Record<number, number>): Promise<void> {
  await db.song.update(id, { mix })
}

export async function deleteSong(db: TrainerDb, id: number): Promise<void> {
  await db.transaction('rw', ['song', 'songProgress'], async () => {
    await db.song.delete(id)
    await db.songProgress.where('songId').equals(id).delete()
  })
}

/** All ladder progress of one player for one song. */
export async function getSongProgress(db: TrainerDb, profileId: number, songId: number): Promise<SongProgress[]> {
  return db.songProgress.where('[profileId+songId]').equals([profileId, songId]).toArray()
}

export type UnitResult = Omit<SongProgress, 'updatedAt'>

/** Saves a ladder result; never lowers rungs passed, stars or best accuracy already saved. */
export async function saveUnitResult(db: TrainerDb, result: UnitResult): Promise<SongProgress> {
  return db.transaction('rw', ['songProgress'], async () => {
    const key: [number, number, number, string] = [result.profileId, result.songId, result.channel, result.unit]
    const current = await db.songProgress.get(key)
    const next: SongProgress = {
      ...result,
      passed: Math.max(current?.passed ?? 0, result.passed),
      stars: Math.max(current?.stars ?? 0, result.stars),
      bestAccuracy: Math.max(current?.bestAccuracy ?? 0, result.bestAccuracy),
      updatedAt: Date.now(),
    }
    await db.songProgress.put(next)
    return next
  })
}

/** Forgets ladder progress of one part: the given units, or every unit of the part. */
export async function resetUnits(db: TrainerDb, profileId: number, songId: number, channel: number, units?: readonly string[]): Promise<void> {
  await db.songProgress
    .where('[profileId+songId]')
    .equals([profileId, songId])
    .filter((row) => row.channel === channel && (!units || units.includes(row.unit)))
    .delete()
}
