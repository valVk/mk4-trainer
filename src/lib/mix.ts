// Volume of each part of a song, set on the song map. Files mixed for another synth (a Yamaha XG
// file played with a General MIDI bank) can bury the melody under a loud pad; the child or a parent
// fixes the balance once and it stays with the song. Pure code, no Vue.

/** Channel (0-based) -> gain, 1 is the file's own level. Channels not listed play at 1. */
export type SongMix = Readonly<Record<number, number>>

export const MIX_MIN = 0
export const MIX_MAX = 1.5
export const MIX_STEP = 0.05

export function clampGain(gain: number): number {
  if (!Number.isFinite(gain)) return 1
  const stepped = Math.round(gain / MIX_STEP) * MIX_STEP
  return Math.min(MIX_MAX, Math.max(MIX_MIN, Number(stepped.toFixed(2))))
}

export function gainOf(mix: SongMix | undefined, channel: number): number {
  return mix?.[channel] ?? 1
}

/** A new mix with one part changed; parts back at 1 are dropped, so an untouched song stores nothing. */
export function withGain(mix: SongMix | undefined, channel: number, gain: number): SongMix {
  const next: Record<number, number> = { ...mix }
  const value = clampGain(gain)
  if (value === 1) delete next[channel]
  else next[channel] = value
  return next
}

/** A stored mix; anything broken is dropped. */
export function parseMix(value: unknown): SongMix {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const mix: Record<number, number> = {}
  for (const [key, gain] of Object.entries(value)) {
    const channel = Number(key)
    if (Number.isInteger(channel) && channel >= 0 && channel < 16 && typeof gain === 'number' && Number.isFinite(gain)) {
      const value = clampGain(gain)
      if (value !== 1) mix[channel] = value
    }
  }
  return mix
}
