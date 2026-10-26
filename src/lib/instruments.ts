// Instrument catalog built from the presets of the loaded SoundFont. Pure code, no UI text.

/** A playable preset: bank 0 is the General MIDI set, other banks hold variants. */
export interface Instrument {
  bank: number
  program: number
}

export interface PresetInfo extends Instrument {
  name: string
  isDrum: boolean
}

export interface CatalogEntry extends Instrument {
  name: string
}

export interface CatalogGroup {
  id: GroupId
  entries: CatalogEntry[]
}

// General MIDI families: programs 0-7 are pianos, 8-15 chromatic percussion, and so on.
export const GM_GROUPS = [
  'piano', 'chromatic', 'organ', 'guitar', 'bass', 'strings', 'ensemble', 'brass',
  'reed', 'pipe', 'synthLead', 'synthPad', 'synthEffects', 'ethnic', 'percussive', 'soundEffects',
] as const

/** Picker order: what is played most with chords first, effects last. */
export const GROUP_ORDER: readonly (typeof GM_GROUPS)[number][] = [
  'piano', 'organ', 'guitar', 'strings', 'synthPad', 'bass', 'ensemble', 'brass',
  'reed', 'pipe', 'chromatic', 'synthLead', 'ethnic', 'synthEffects', 'percussive', 'soundEffects',
]

/** Banks that are separate sets rather than variants: their program numbers do not follow GM. */
export const EXTRA_SETS = { 127: 'mt32' } as const

export type GroupId = (typeof GM_GROUPS)[number] | (typeof EXTRA_SETS)[keyof typeof EXTRA_SETS]

export const DEFAULT_INSTRUMENT: Instrument = { bank: 0, program: 0 }

/**
 * MuseScore General's "... Expr." presets take their loudness from MIDI CC2 (breath controller),
 * not from key velocity. Nothing here sends CC2, so they stay silent; they are left out.
 * Checked against the file: exactly the 92 CC2-driven presets carry this name ending.
 */
const NEEDS_BREATH_CONTROLLER = /\bExpr\.$/

/** A preset the trainer can play: not a drum kit, and sounding from velocity alone. */
export function isPlayable(preset: PresetInfo): boolean {
  return !preset.isDrum && !NEEDS_BREATH_CONTROLLER.test(preset.name.trim())
}

export function groupOf(program: number): (typeof GM_GROUPS)[number] {
  return GM_GROUPS[Math.min(15, Math.max(0, Math.floor(program / 8)))]!
}

const isExtraSet = (bank: number): bank is keyof typeof EXTRA_SETS => bank in EXTRA_SETS

/**
 * Groups in GROUP_ORDER, extra sets last. One flat list per group: each GM instrument,
 * then its variants from other banks (e.g. Steel Guitar, 12-String Guitar, Mandolin).
 * Variants without a GM instrument, drum kits and breath-controlled presets are left out.
 */
export function buildCatalog(presets: readonly PresetInfo[]): CatalogGroup[] {
  const melodic = presets.filter(isPlayable)
  const gmPrograms = new Set(melodic.filter((preset) => preset.bank === 0).map((preset) => preset.program))
  const entry = (preset: PresetInfo): CatalogEntry => ({ bank: preset.bank, program: preset.program, name: preset.name.trim() })
  const groups: CatalogGroup[] = GROUP_ORDER.map((id) => ({
    id,
    entries: melodic
      .filter((preset) => !isExtraSet(preset.bank) && gmPrograms.has(preset.program) && groupOf(preset.program) === id)
      .sort((a, b) => a.program - b.program || a.bank - b.bank)
      .map(entry),
  }))
  for (const [bank, id] of Object.entries(EXTRA_SETS)) {
    const entries = melodic
      .filter((preset) => preset.bank === Number(bank))
      .sort((a, b) => a.program - b.program)
      .map(entry)
    if (entries.length) groups.push({ id, entries })
  }
  return groups.filter((group) => group.entries.length > 0)
}

export function sameInstrument(a: Instrument, b: Instrument): boolean {
  return a.bank === b.bank && a.program === b.program
}

/**
 * The instrument to play from this bank: the chosen one if the bank has it,
 * else the same GM program, else the first piano.
 */
export function resolveInstrument(wanted: Instrument, presets: readonly PresetInfo[]): Instrument {
  const melodic = presets.filter(isPlayable)
  if (melodic.some((preset) => sameInstrument(preset, wanted))) return wanted
  const gm = { bank: 0, program: wanted.program }
  if (!isExtraSet(wanted.bank) && melodic.some((preset) => sameInstrument(preset, gm))) return gm
  return DEFAULT_INSTRUMENT
}

export function findName(instrument: Instrument, presets: readonly PresetInfo[]): string | null {
  return presets.find((preset) => !preset.isDrum && sameInstrument(preset, instrument))?.name.trim() ?? null
}

/** Saved settings: current shape, or a program number from the old short instrument list. */
export function parseInstrument(value: unknown): Instrument {
  const legacy: Record<string, number> = { piano: 0, epiano: 4, organ: 19, strings: 48, pad: 88, bass: 33 }
  if (typeof value === 'string' && value in legacy) return { bank: 0, program: legacy[value]! }
  const candidate = value as Partial<Instrument> | null
  const valid = (n: unknown, max: number) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= max
  if (candidate && valid(candidate.bank, 127) && valid(candidate.program, 127)) {
    return { bank: candidate.bank!, program: candidate.program! }
  }
  return DEFAULT_INSTRUMENT
}
