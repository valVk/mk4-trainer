<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { TheoryPiece } from '@/composables/useTheoryPieces'

export interface LevelTab {
  id: number
  open: boolean
  stars: number
}

// The level row of every «Теория» section, built like the chords' one: «Уровень», the levels as one segmented track
// (closed ones dimmed), the piece that ends a group of levels as a small chip inside the track, and on the right
// whatever the section puts in the slot (stars, tempo, its own buttons).
const props = defineProps<{
  tabs: readonly LevelTab[]
  /** The level shown now; null while a piece is open. */
  current: number | null
  piecesAfter: (level: number) => TheoryPiece[]
  /** Key of the piece being played here, if any. */
  openPieceKey?: string | null
  label: string
}>()

const emit = defineEmits<{ select: [level: number] }>()
const { t } = useI18n()

const pieceOpen = (piece: TheoryPiece, tab: LevelTab) => piece.to !== null && tab.stars === 3
const isCurrent = (id: number) => props.current === id
</script>

<template>
  <div class="levels-row">
    <div class="levels">
      <span class="text-muted">{{ t('train.levelLabel') }}</span>
      <div class="levels__track" role="tablist" :aria-label="label">
        <template v-for="tab in tabs" :key="tab.id">
          <button
            type="button"
            role="tab"
            class="level tabular-nums"
            :class="{ 'level--on': isCurrent(tab.id), 'level--done': tab.stars === 3 }"
            :aria-selected="isCurrent(tab.id)"
            :disabled="!tab.open"
            @click="emit('select', tab.id)"
          >
            {{ tab.id }}
          </button>
          <!-- The piece that ends this group of levels: open once the level has all its stars (plan step 18). -->
          <template v-for="piece in piecesAfter(tab.id)" :key="piece.id">
            <RouterLink
              v-if="pieceOpen(piece, tab)"
              :to="piece.to!"
              class="level level--piece"
              :class="{ 'level--on': openPieceKey === piece.key }"
              :aria-current="openPieceKey === piece.key ? 'page' : undefined"
              :aria-label="t('theory.playPiece', { name: piece.title })"
            >
              <UIcon name="i-lucide-music" class="size-4" />
            </RouterLink>
            <span v-else class="level level--piece level--closed" role="img" :aria-label="t('theory.pieceLocked', { name: piece.title, n: tab.id })">
              <UIcon name="i-lucide-music" class="size-4" />
            </span>
          </template>
        </template>
      </div>
    </div>
    <div class="levels-row__end">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.levels-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  margin-top: 0.5rem;
}

.levels {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  max-width: 100%;
}

/* One track like the chords' tabs; on a narrow screen it scrolls instead of widening the page. */
.levels__track {
  display: flex;
  gap: 0.125rem;
  min-width: 0;
  padding: 0.25rem;
  border-radius: 0.75rem;
  background: var(--ui-bg-elevated);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.level {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  min-width: 2.75rem;
  min-height: 2.5rem;
  padding: 0 0.625rem;
  border-radius: 0.5rem;
  font-weight: 600;
  color: var(--ui-text-toned);
  transition: background-color 150ms ease, color 150ms ease;
}

.level:active:not(:disabled) {
  transform: scale(0.96);
}

.level:disabled,
.level--closed {
  color: var(--ui-text-dimmed);
}

.level--on {
  color: var(--color-on-fill);
  background: var(--color-active);
}

/* A level with all its stars: a small green dot under the number. */
.level--done {
  position: relative;
}

.level--done::after {
  content: '';
  position: absolute;
  bottom: 0.25rem;
  left: 50%;
  width: 0.3125rem;
  height: 0.3125rem;
  border-radius: 999px;
  background: var(--color-correct);
  transform: translateX(-50%);
}

.level--done.level--on::after {
  background: var(--color-on-fill);
}

.level--piece {
  min-width: 2.25rem;
  padding: 0 0.375rem;
  color: var(--color-active);
}

.level--piece.level--closed {
  color: var(--ui-text-dimmed);
}

.levels-row__end {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-left: auto;
}

/* Phones in landscape: one line; the track scrolls sideways. */
@media (orientation: landscape) and (max-height: 500px) {
  .levels-row {
    flex-wrap: nowrap;
    margin-top: 0.25rem;
  }

  .levels-row__end {
    flex: none;
    flex-wrap: nowrap;
  }
}
</style>
