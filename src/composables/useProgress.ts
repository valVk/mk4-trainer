import { readonly, ref, shallowRef, watch } from 'vue'

import { useNoteSource } from '@/composables/useNoteSource'
import { INSTRUMENTS, useSynth, type InstrumentId } from '@/composables/useSynth'
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
import { GLOBAL_PROFILE, createDb, type LevelProgress, type Profile, type TrainerDb } from '@/db/schema'
import { i18n } from '@/i18n'
import { starsFor } from '@/lib/levels'
import { isValidPadMap, type PadMap } from '@/lib/noteSource'

// The only door to the database: pages never touch Dexie, so the storage can change later (plan 7).

const PAD_MAP_KEY = 'padMap'
const INSTRUMENT_KEY = 'instrument'
const DECLINED_KEY = 'declinedLevels'
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
  const instrument = await getSetting<InstrumentId>(database, current.id, INSTRUMENT_KEY)
  applying = true
  useSynth().setInstrument(INSTRUMENTS.some((item) => item.id === instrument) ? instrument! : 'piano')
  applying = false
}

function watchSettings(): void {
  const { padMap } = useNoteSource()
  watch(padMap, (map) => {
    if (applying) return
    void safely((database) => setSetting(database, GLOBAL_PROFILE, PAD_MAP_KEY, { channel: map.channel, notes: [...map.notes] }))
  })
  watch(useSynth().instrument, (id) => {
    if (applying || !profile.value) return
    const profileId = profile.value.id
    void safely((database) => setSetting(database, profileId, INSTRUMENT_KEY, id))
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
  })
}

async function weakTasks(limit = 5): Promise<TaskStats[]> {
  const profileId = profile.value?.id
  if (profileId === undefined) return []
  return (await safely((database) => weakTasksQuery(database, profileId, limit))) ?? []
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
  }
}
