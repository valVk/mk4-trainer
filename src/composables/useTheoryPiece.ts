import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * A piece that ends a theory level, played inside «Теория» (`?piece=<song>-<part>`): the level row stays, with the
 * piece's chip chosen, and only the content below it becomes the practice. Back returns to the level.
 */
export function useTheoryPiece() {
  const route = useRoute()
  const router = useRouter()

  const piece = computed(() => {
    const value = String(route.query.piece ?? '')
    const match = /^(\d+)-(\d+)$/.exec(value)
    return match ? { key: value, songId: Number(match[1]), channel: Number(match[2]) } : null
  })

  function closePiece() {
    if (!piece.value) return
    const query = { ...route.query }
    delete query.piece
    // Opened from the level: going back closes it and keeps the history clean; opened by «Продолжить»: replace.
    const back = (window.history.state as { back?: string } | null)?.back
    const previous = back ? router.resolve(back) : null
    if (previous && previous.path === route.path && previous.query.piece === undefined) router.back()
    else void router.replace({ query })
  }

  return { piece, closePiece }
}
