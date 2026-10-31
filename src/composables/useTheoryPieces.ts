import { useProgress } from '@/composables/useProgress'
import { PIECES, builtinId, type TheorySection } from '@/lib/pieces'

export interface TheoryPiece {
  id: string
  /** Short name for the chip and the button. */
  title: string
  /** «Теория» showing the piece's practice; null until the built-in pieces are stored. */
  to: string | null
  /** `<song>-<part>`, as in the address, to tell the open piece. */
  key: string | null
}

/** The pieces that end level groups of a «Теория» section (plan step 18-19), with links to their practice. */
export function useTheoryPieces(section: TheorySection) {
  const progress = useProgress()

  function piecesAfter(level: number): TheoryPiece[] {
    return PIECES.filter((piece) => piece.after?.section === section && piece.after.level === level).map((piece) => {
      const song = progress.songs.value.find((item) => builtinId(item.fileName) === piece.id)
      // Played inside «Теория», not on the song pages: back returns to the level (the owner's request, 31.10.2026).
      const query = section === 'rhythm' ? '' : `section=${section}&`
      const key = song ? `${song.id}-${piece.learner}` : null
      return { id: piece.id, title: piece.short ?? piece.title, to: key ? `/train/theory?${query}piece=${key}` : null, key }
    })
  }

  return { piecesAfter }
}
