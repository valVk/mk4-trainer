// How strictly playing is judged (the owner's request, 31.10.2026): a beginner gets a wide «on time» and may let a
// note go at half its length; an expert has to be close to the beat and hold almost the whole note. One choice per
// profile, used by «Теория», songs and the waterfall alike. Pure code, no Vue.

export const SKILLS = ['beginner', 'advanced', 'expert'] as const
export type Skill = typeof SKILLS[number]

export interface Tolerance {
  /** «On time» (green): at most this far from the beat, seconds. */
  onTimeS: number
  /** …and never narrower than this, even for the shortest notes. */
  onTimeMinS: number
  /** A note counts as held when the key stays down this share of its length. */
  holdShare: number
  /** Songs at tempo: a press this close to its step (real time) is a hit. */
  songWindowS: number
}

/**
 * Children of 7-8 tap about 60-100 ms off the beat on average, trained adults 20-30 ms; casual rhythm games accept
 * ±100-130 ms as good. «Новичок» sits there, «Продвинутый» is the previous rule, «Эксперт» is a trained ear.
 */
export const TOLERANCES: Record<Skill, Tolerance> = {
  beginner: { onTimeS: 0.12, onTimeMinS: 0.07, holdShare: 0.5, songWindowS: 0.25 },
  advanced: { onTimeS: 0.08, onTimeMinS: 0.05, holdShare: 0.6, songWindowS: 0.2 },
  expert: { onTimeS: 0.05, onTimeMinS: 0.035, holdShare: 0.75, songWindowS: 0.12 },
}

/** A new profile starts as a beginner. */
export const DEFAULT_SKILL: Skill = 'beginner'

export function parseSkill(value: unknown): Skill {
  return SKILLS.includes(value as Skill) ? value as Skill : DEFAULT_SKILL
}
