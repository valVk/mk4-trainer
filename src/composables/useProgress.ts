import { readonly, ref, shallowRef, watch } from 'vue'

import { useMetronome } from '@/composables/useMetronome'
import { useNoteSource } from '@/composables/useNoteSource'
import { BANKS, useSynth, type BankId } from '@/composables/useSynth'
import { exportBackup, importBackup, parseBackup, type Backup } from '@/db/backup'
import {
  CURRENT_PROFILE_KEY,
  addProfile as addProfileRow,
  deleteSetting,
  ensureProfile,
  getLevels,
  getSetting,
  recordAttempt,
  renameProfile as renameProfileRow,
  setSetting,
  weakTasks as weakTasksQuery,
  type AttemptInput,
  type TaskStats,
} from '@/db/progress'
import { GLOBAL_PROFILE, createDb, type LevelProgress, type Profile, type SongProgress, type SongRecord, type TrainerDb } from '@/db/schema'
import { addSong, deleteSong as deleteSongRow, getSong, getSongProgress, listSongs, resetUnits, saveUnitResult, type SongSummary } from '@/db/songs'
import { i18n } from '@/i18n'
import { parseInstrument } from '@/lib/instruments'
import { parseLatencyHistories, parseMetronomeSettings } from '@/lib/metronome'
import { starsFor } from '@/lib/levels'
import { isValidPadMap, type PadMap } from '@/lib/noteSource'
import { parseSong, songNameFromFile } from '@/lib/song'

// The only door to the database: pages never touch Dexie, so the storage can change later (plan 7).

const PAD_MAP_KEY = 'padMap'
const INSTRUMENT_KEY = 'instrument'
const BANK_KEY = 'soundBank'
const DECLINED_KEY = 'declinedLevels'
const METRONOME_KEY = 'metronome'
/** How late this child's taps arrive after the click, per input: the last checks on the «Ритм» page (median is used). */
const LATENCY_KEY = 'tapLatencyMs'
/** Where step 5 kept the pad map before the database existed. */
const LEGACY_PAD_MAP_KEY = 'chord-trainer:padMap'

let db: TrainerDb | null = null
let initializing: Promise<void> | null = null

const ready = ref(false)
/** False when IndexedDB is unavailable (e.g. incognito): the app still works, nothing is saved. */
const available = ref(true)
const persisted = ref<boolean | null>(null)
const profile = shallowRef<Profile | null>(null)
const profiles = shallowRef<Profile[]>([])
const levels = ref<Record<number, LevelProgress>>({})
const declinedLevels = ref<number[]>([])
const songs = shallowRef<SongSummary[]>([])
// Applying stored settings must not write them straight back.
let applying = false

async function safely<T>(action: (database: TrainerDb) => Promise<T>): Promise<T | undefined> {
  if (!db || !available.value) return undefined
  try {
    return await action(db)
  } catch (error) {
    console.warn('[progress] storage unavailable', error)
    available.value = false
    return undefined
  }
}

async function requestPersist(): Promise<void> {
  try {
    persisted.value = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false
  } catch {
    persisted.value = false
  }
}

function readLegacyPadMap(): PadMap | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LEGACY_PAD_MAP_KEY) ?? 'null')
    return isValidPadMap(value) ? value : null
  } catch {
    return null
  }
}

async function loadPadMap(database: TrainerDb): Promise<void> {
  let map = await getSetting<PadMap>(database, GLOBAL_PROFILE, PAD_MAP_KEY)
  const legacy = readLegacyPadMap()
  if (!map && legacy) {
    map = legacy
    await setSetting(database, GLOBAL_PROFILE, PAD_MAP_KEY, legacy)
  }
  try {
    localStorage.removeItem(LEGACY_PAD_MAP_KEY)
  } catch {
    // Nothing to clean up.
  }
  applying = true
  useNoteSource().setPadMap(isValidPadMap(map) ? map : null)
  applying = false
}

async function loadProfileData(database: TrainerDb, current: Profile): Promise<void> {
  profile.value = current
  profiles.value = await database.profile.orderBy('id').toArray()
  levels.value = await getLevels(database, current.id)
  declinedLevels.value = (await getSetting<number[]>(database, current.id, DECLINED_KEY)) ?? []
  const instrument = await getSetting<unknown>(database, current.id, INSTRUMENT_KEY)
  const bank = await getSetting<BankId>(database, current.id, BANK_KEY)
  const metronome = await getSetting<unknown>(database, current.id, METRONOME_KEY)
  const latency = await getSetting<unknown>(database, current.id, LATENCY_KEY)
  applying = true
  useMetronome().update(parseMetronomeSettings(metronome))
  useMetronome().setLatencyHistories(parseLatencyHistories(latency))
  // Also converts the old short list ("piano", "organ"...) to bank and program.
  useSynth().setInstrument(parseInstrument(instrument))
  useSynth().setBank(BANKS.some((item) => item.id === bank) ? bank! : 'musescore')
  applying = false
}

function watchSettings(): void {
  const { padMap } = useNoteSource()
  watch(padMap, (map) => {
    if (applying) return
    void safely((database) => setSetting(database, GLOBAL_PROFILE, PAD_MAP_KEY, { channel: map.channel, notes: [...map.notes] }))
  })
  watch(useSynth().instrument, (value) => {
    if (applying || !profile.value) return
    const profileId = profile.value.id
    void safely((database) => setSetting(database, profileId, INSTRUMENT_KEY, { bank: value.bank, program: value.program }))
  })
  watch(useSynth().bank, (id) => {
    if (applying || !profile.value) return
    const profileId = profile.value.id
    void safely((database) => setSetting(database, profileId, BANK_KEY, id))
  })
  watch(useMetronome().settings, (value) => {
    if (applying || !profile.value) return
    const profileId = profile.value.id
    void safely((database) => setSetting(database, profileId, METRONOME_KEY, { ...value }))
  })
  watch(useMetronome().latencyHistories, (histories) => {
    if (applying || !profile.value) return
    const profileId = profile.value.id
    const value = { screen: [...histories.screen], midi: [...histories.midi], keys: [...histories.keys] }
    void safely((database) => setSetting(database, profileId, LATENCY_KEY, value))
  })
}

function init(): Promise<void> {
  initializing ??= (async () => {
    void requestPersist()
    try {
      db = createDb()
      await db.open()
    } catch (error) {
      console.warn('[progress] no database, progress will not be saved', error)
      available.value = false
    }
    await safely(async (database) => {
      await loadPadMap(database)
      await loadProfileData(database, await ensureProfile(database, i18n.global.t('progress.defaultName')))
      songs.value = await listSongs(database)
    })
    watchSettings()
    ready.value = true
  })()
  return initializing
}

/** Saves an answer or a skip. Totals update right away, even when storage is unavailable. */
async function record(input: Omit<AttemptInput, 'profileId'>): Promise<void> {
  const profileId = profile.value?.id ?? 0
  const current = levels.value[input.level]
  const correct = (current?.correct ?? 0) + (input.correct ? 1 : 0)
  levels.value = {
    ...levels.value,
    [input.level]: {
      profileId,
      level: input.level,
      correct,
      stars: starsFor(correct),
      bestStreak: Math.max(current?.bestStreak ?? 0, input.streak),
      updatedAt: Date.now(),
    },
  }
  const saved = await safely((database) => recordAttempt(database, { ...input, profileId }))
  if (saved && profile.value?.id === profileId) levels.value = { ...levels.value, [input.level]: saved }
}

async function declineLevel(level: number): Promise<void> {
  if (declinedLevels.value.includes(level)) return
  declinedLevels.value = [...declinedLevels.value, level]
  const profileId = profile.value?.id
  if (profileId === undefined) return
  const list = [...declinedLevels.value]
  await safely((database) => setSetting(database, profileId, DECLINED_KEY, list))
}

async function switchProfile(id: number): Promise<void> {
  await safely(async (database) => {
    const next = await database.profile.get(id)
    if (!next) return
    await setSetting(database, GLOBAL_PROFILE, CURRENT_PROFILE_KEY, id)
    await loadProfileData(database, next)
  })
}

async function addProfile(name: string): Promise<void> {
  await safely(async (database) => {
    const created = await addProfileRow(database, name)
    await setSetting(database, GLOBAL_PROFILE, CURRENT_PROFILE_KEY, created.id)
    await loadProfileData(database, created)
  })
}

async function renameProfile(name: string): Promise<void> {
  const current = profile.value
  if (!current) return
  await safely(async (database) => {
    await renameProfileRow(database, current.id, name)
    const updated = await database.profile.get(current.id)
    if (updated) await loadProfileData(database, updated)
  })
}

async function exportData(): Promise<Backup | undefined> {
  return safely(exportBackup)
}

/** Validates first (throws BackupParseError), then replaces all data and reloads it. */
async function importData(text: string): Promise<void> {
  const backup = parseBackup(text)
  await safely(async (database) => {
    await importBackup(database, backup)
    await loadPadMap(database)
    await loadProfileData(database, await ensureProfile(database, i18n.global.t('progress.defaultName')))
    songs.value = await listSongs(database)
  })
}

async function weakTasks(limit = 5): Promise<TaskStats[]> {
  const profileId = profile.value?.id
  if (profileId === undefined) return []
  return (await safely((database) => weakTasksQuery(database, profileId, limit))) ?? []
}

/**
 * Imports a MIDI file from the device. The file is parsed first, so a broken or non-MIDI file
 * throws before anything is saved. Songs stay in this browser only.
 */
async function importSong(file: File): Promise<SongSummary> {
  const data = await file.arrayBuffer()
  parseSong(data, file.name)
  const record = { name: songNameFromFile(file.name), fileName: file.name, data, size: data.byteLength, importedAt: Date.now() }
  const saved = await safely(async (database) => {
    const summary = await addSong(database, record)
    songs.value = await listSongs(database)
    return summary
  })
  if (!saved) throw new Error('storage')
  return saved
}

async function loadSong(id: number): Promise<SongRecord | undefined> {
  return safely((database) => getSong(database, id))
}

async function removeSong(id: number): Promise<void> {
  await safely(async (database) => {
    await deleteSongRow(database, id)
    songs.value = await listSongs(database)
  })
}

/** Ladder progress of the current player for one song, as channel -> unit id -> progress. */
async function loadSongProgress(songId: number): Promise<Record<number, Record<string, SongProgress>>> {
  const profileId = profile.value?.id
  if (profileId === undefined) return {}
  const rows = (await safely((database) => getSongProgress(database, profileId, songId))) ?? []
  const byChannel: Record<number, Record<string, SongProgress>> = {}
  for (const row of rows) (byChannel[row.channel] ??= {})[row.unit] = row
  return byChannel
}

/** Saves one ladder attempt for the current player (never lowers what was reached before). */
async function saveSongUnit(result: { songId: number, channel: number, unit: string, passed: number, stars: number, bestAccuracy: number }): Promise<SongProgress | undefined> {
  const profileId = profile.value?.id
  if (profileId === undefined) return undefined
  return safely((database) => saveUnitResult(database, { ...result, profileId }))
}

/** Starts the ladder again for the current player: some units of a part, or the whole part. */
async function resetSongUnits(songId: number, channel: number, units?: readonly string[]): Promise<void> {
  const profileId = profile.value?.id
  if (profileId === undefined) return
  await safely((database) => resetUnits(database, profileId, songId, channel, units))
}

async function forgetSetting(key: string): Promise<void> {
  const profileId = profile.value?.id
  if (profileId !== undefined) await safely((database) => deleteSetting(database, profileId, key))
}

export function useProgress() {
  return {
    ready: readonly(ready),
    available: readonly(available),
    persisted: readonly(persisted),
    profile: readonly(profile),
    profiles: readonly(profiles),
    levels: readonly(levels),
    declinedLevels: readonly(declinedLevels),
    songs: readonly(songs),
    init,
    record,
    declineLevel,
    switchProfile,
    addProfile,
    renameProfile,
    exportData,
    importData,
    weakTasks,
    forgetSetting,
    importSong,
    loadSong,
    removeSong,
    loadSongProgress,
    saveSongUnit,
    resetSongUnits,
  }
}
