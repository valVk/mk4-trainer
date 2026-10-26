// Imported songs. Pages reach them only through useProgress (plan section 7).

import type { SongRecord, TrainerDb } from './schema'

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

export async function deleteSong(db: TrainerDb, id: number): Promise<void> {
  await db.song.delete(id)
}
