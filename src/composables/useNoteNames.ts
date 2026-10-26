import { useI18n } from 'vue-i18n'

import { pitchClass, type PitchClass } from '@/lib/theory'

/**
 * Local (solfège) note names next to the international ones: "C(до)".
 * Names come from the locale file, so a language without them just shows "C".
 */
export function useNoteNames() {
  const { t, te } = useI18n()

  function localName(pc: PitchClass, short = false): string {
    const key = `noteNames.${short ? 'short' : 'full'}.${pitchClass(pc)}`
    return te(key) ? t(key) : ''
  }

  function withLocal(name: string, local: string): string {
    return local ? t('common.withLocal', { name, local }) : name
  }

  return { localName, withLocal }
}
