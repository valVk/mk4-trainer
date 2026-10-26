import { describe, expect, it } from 'vitest'

import {
  DEFAULT_INSTRUMENT,
  GM_GROUPS,
  GROUP_ORDER,
  buildCatalog,
  findName,
  groupOf,
  parseInstrument,
  resolveInstrument,
  type PresetInfo,
} from '@/lib/instruments'

const preset = (bank: number, program: number, name: string, isDrum = false): PresetInfo => ({ bank, program, name, isDrum })

// A small bank shaped like the real ones: GM set, variants, an MT-32 set, a drum kit.
const presets: PresetInfo[] = [
  preset(0, 0, 'Grand Piano '),
  preset(0, 1, 'Bright Piano'),
  preset(8, 0, 'Mellow Grand Piano'),
  preset(0, 25, 'Steel String Guitar'),
  preset(16, 25, 'Mandolin'),
  preset(8, 25, '12-String Guitar'),
  preset(0, 33, 'Finger Bass'),
  preset(127, 0, 'Acou Piano 1'),
  preset(127, 25, 'Syn Brass 2 MT'),
  preset(128, 0, 'Standard', true),
  preset(5, 99, 'Orphan variant'),
  preset(17, 25, 'Steel Guitar Expr.'),
]

describe('GM groups', () => {
  it('maps programs to the 16 families', () => {
    expect(groupOf(0)).toBe('piano')
    expect(groupOf(25)).toBe('guitar')
    expect(groupOf(33)).toBe('bass')
    expect(groupOf(127)).toBe('soundEffects')
  })
})

describe('buildCatalog', () => {
  const catalog = buildCatalog(presets)

  it('lists only groups the bank has, most used first, with the extra set last', () => {
    expect(catalog.map((group) => group.id)).toEqual(['piano', 'guitar', 'bass', 'mt32'])
    const organ = buildCatalog([preset(0, 16, 'Organ'), preset(0, 9, 'Glockenspiel'), preset(0, 0, 'Piano')])
    expect(organ.map((group) => group.id)).toEqual(['piano', 'organ', 'chromatic'])
  })

  it('orders every GM group exactly once', () => {
    expect([...GROUP_ORDER].sort()).toEqual([...GM_GROUPS].sort())
  })

  it('lists variants as plain entries right after their GM instrument, sorted by bank', () => {
    const guitar = catalog.find((group) => group.id === 'guitar')!.entries
    expect(guitar.map((entry) => [entry.bank, entry.name])).toEqual([[0, 'Steel String Guitar'], [8, '12-String Guitar'], [16, 'Mandolin']])
  })

  it('trims names and keeps the MT-32 set apart, not as variants', () => {
    const piano = catalog.find((group) => group.id === 'piano')!.entries
    expect(piano.map((entry) => entry.name)).toEqual(['Grand Piano', 'Mellow Grand Piano', 'Bright Piano'])
    expect(catalog.find((group) => group.id === 'mt32')!.entries.map((entry) => entry.name)).toEqual(['Acou Piano 1', 'Syn Brass 2 MT'])
  })

  it('leaves out drum kits and variants without a GM instrument', () => {
    const names = catalog.flatMap((group) => group.entries.map((entry) => entry.name))
    expect(names).not.toContain('Standard')
    expect(names).not.toContain('Orphan variant')
    expect(names).not.toContain('Steel Guitar Expr.')
  })
})

describe('resolveInstrument', () => {
  it('keeps an instrument the bank has', () => {
    expect(resolveInstrument({ bank: 16, program: 25 }, presets)).toEqual({ bank: 16, program: 25 })
  })

  it('falls back to the same GM program when a variant is missing or silent without CC2', () => {
    expect(resolveInstrument({ bank: 18, program: 25 }, presets)).toEqual({ bank: 0, program: 25 })
    // Saved before "Expr." presets were hidden: bank 17 program 25 exists but needs a breath controller.
    expect(resolveInstrument({ bank: 17, program: 25 }, presets)).toEqual({ bank: 0, program: 25 })
  })

  it('falls back to the piano for a missing MT-32 preset or program', () => {
    expect(resolveInstrument({ bank: 127, program: 33 }, presets)).toEqual(DEFAULT_INSTRUMENT)
    expect(resolveInstrument({ bank: 0, program: 60 }, presets)).toEqual(DEFAULT_INSTRUMENT)
  })

  it('finds the bank name of an instrument', () => {
    expect(findName({ bank: 8, program: 25 }, presets)).toBe('12-String Guitar')
    expect(findName({ bank: 0, program: 60 }, presets)).toBeNull()
  })
})

describe('parseInstrument', () => {
  it('converts the old short list', () => {
    expect(parseInstrument('organ')).toEqual({ bank: 0, program: 19 })
    expect(parseInstrument('bass')).toEqual({ bank: 0, program: 33 })
  })

  it('accepts saved instruments and rejects anything else', () => {
    expect(parseInstrument({ bank: 8, program: 25 })).toEqual({ bank: 8, program: 25 })
    expect(parseInstrument({ bank: 300, program: 1 })).toEqual(DEFAULT_INSTRUMENT)
    expect(parseInstrument('violin')).toEqual(DEFAULT_INSTRUMENT)
    expect(parseInstrument(null)).toEqual(DEFAULT_INSTRUMENT)
  })
})
