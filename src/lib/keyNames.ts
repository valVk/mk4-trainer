// Black keys have two names (C♯ = D♭); which one a key is called depends on where you come from (plan step 28).
// So on the keyboard a black key is named only next to a pressed white key: G pressed names the key above it G♯
// and the one below G♭; C pressed names only C♯ (below C is B, a white key). A pressed black key shows both its
// names. Nothing pressed, nothing named. Pure code, no UI text.

const LETTERS: readonly (string | null)[] = ['C', null, 'D', null, 'E', 'F', null, 'G', null, 'A', null, 'B']

export function isBlackKey(note: number): boolean {
  return LETTERS[((note % 12) + 12) % 12] === null
}

function letter(note: number): string {
  return LETTERS[((note % 12) + 12) % 12] ?? ''
}

/** The names of the black keys around the held keys: key → its names, the sharp one first. */
export function blackKeyNames(held: readonly number[]): Map<number, string[]> {
  const names = new Map<number, string[]>()
  const add = (note: number, name: string) => {
    const list = names.get(note) ?? []
    if (!list.includes(name)) list.push(name)
    names.set(note, list)
  }
  for (const note of [...new Set(held)].sort((a, b) => a - b)) {
    if (isBlackKey(note)) {
      add(note, `${letter(note - 1)}♯`)
      add(note, `${letter(note + 1)}♭`)
      continue
    }
    if (isBlackKey(note + 1)) add(note + 1, `${letter(note)}♯`)
    if (isBlackKey(note - 1)) add(note - 1, `${letter(note)}♭`)
  }
  // Sharps before flats, whatever order the keys came in.
  for (const [note, list] of names) names.set(note, list.sort((a, b) => Number(a.endsWith('♭')) - Number(b.endsWith('♭'))))
  return names
}
