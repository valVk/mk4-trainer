import { describe, expect, it } from 'vitest'

import { CONTROLLERS, activeController } from '@/lib/controller'
import { MK4 } from '@/lib/controllers/mk4'
import { KEYBOARD_KEYS } from '@/lib/keyboard'
import { controlFor } from '@/lib/mk4Layout'
import { resolveAction } from '@/lib/mk4Control'

describe('controller profiles', () => {
  it('knows the MK4 only, and works with it', () => {
    expect(CONTROLLERS).toEqual([MK4])
    expect(activeController()).toBe(MK4)
  })

  it('finds the MK4 by its MIDI input name', () => {
    expect(MK4.matches('MPK mini IV MIDI')).toBe(true)
    expect(MK4.matches('MPK Mini 4 DAW')).toBe(true)
    expect(MK4.matches('Launchkey Mini MK3')).toBe(false)
  })

  it('describes the MK4 as the app knows it', () => {
    // The app's exercises fit the keyboard's window.
    expect(MK4.keys).toBe(KEYBOARD_KEYS)
    expect(MK4.homeBase).toBe(48)
    expect(MK4.octaveBase([0xf0, 0x47, 0x00, 0x5d, 0x3b, 0x00, 0x01, 0x04, 0xf7])).toBe(48)
    expect(MK4.octaveBase([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7])).toBeNull()
  })

  it('lets another keyboard name its controls its own way', () => {
    const other = { ...MK4, factory: { playStop: 'cc:2:115' }, displayTurn: null, actions: { playStop: 'playStop' as const }, keys: 49 }
    expect(controlFor('cc:2:115', {}, 36, MK4.pads, other)).toBe('playStop')
    expect(controlFor('cc:1:76', {}, 36, MK4.pads, other)).toBeNull()
    expect(controlFor('note:1:84', {}, 36, MK4.pads, other)).toBe('key48')
    expect(resolveAction('playStop', 'cc:2:115', 127, false, {}, other)).toEqual({ action: 'playStop' })
  })
})
