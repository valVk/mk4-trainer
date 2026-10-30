import { useProgress } from '@/composables/useProgress'
import { PIECES, builtinId, type TheorySection } from '@/lib/pieces'

export interface TheoryPiece {
  id: string
  /** Short name for the chip and the button. */
  title: string
  /** Practice page of the stored piece; null until the built-in pieces are stored. */
  to: string | null
}

/** The pieces that end level groups of a «Теория» section (plan step 18-19), with links to their practice. */
export function useTheoryPieces(section: TheorySection) {
  const progress = useProgress()

  function piecesAfter(level: number): TheoryPiece[] {
    return PIECES.filter((piece) => piece.after?.section === section && piece.after.level === level).map((piece) => {
      const song = progress.songs.value.find((item) => builtinId(item.fileName) === piece.id)
      return { id: piece.id, title: piece.short ?? piece.title, to: song ? `/songs/${song.id}/${piece.learner}` : null }
    })
  }

  return { piecesAfter }
}
