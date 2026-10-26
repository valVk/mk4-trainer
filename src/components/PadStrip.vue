<script setup lang="ts">
// The 8 MK4 pads under the falling notes when a part is played on pads: numbered like on the MK4,
// with the sound each one plays. Lit pads are the ones to hit now; they can also be tapped.
// Two rows like the MK4 (5-8 on top, 1-4 below) laid out as a chessboard: pads sit on alternate squares and
// meet only at the corners, so every pad has its own column from left to right (1 5 2 6 3 7 4 8) and its own
// lane in NoteFall above.
import { computed } from 'vue'

const props = defineProps<{
  labels: readonly (string | null)[]
  /** 1-based pad numbers to hit now. */
  lit: readonly number[]
  /** 1-based pad numbers being hit. */
  hit: readonly number[]
}>()

const emit = defineEmits<{ press: [pad: number] }>()

const ROW = 4
/** Bottom pads in columns 1 3 5 7, top pads in columns 2 4 6 8 (same lanes as NoteFall). */
const cells = computed(() =>
  props.labels.map((label, index) => {
    const top = index >= ROW
    return { pad: index + 1, label, top, style: { gridColumn: (index % ROW) * 2 + (top ? 2 : 1), gridRow: top ? 1 : 2 } }
  }),
)
</script>

<template>
  <div class="strip" role="group">
    <button
      v-for="cell in cells"
      :key="cell.pad"
      type="button"
      class="pad"
      :class="{ 'pad--lit': lit.includes(cell.pad), 'pad--hit': hit.includes(cell.pad), 'pad--empty': !cell.label}"
      :style="cell.style"
      :disabled="!cell.label"
      @pointerdown.prevent="emit('press', cell.pad)"
    >
      <span class="pad__number">{{ cell.pad }}</span>
      <span class="pad__label">{{ cell.label ?? '' }}</span>
    </button>
  </div>
</template>

<style scoped>
.strip {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  padding-top: 0.5rem;
  touch-action: none;
}

.pad {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  aspect-ratio: 1;
  container-type: inline-size;
  overflow: hidden;
  padding: 0.5rem 0.25rem;
  border-radius: 0.875rem;
  color: var(--ui-text-toned);
  background: var(--rubber);
  box-shadow: 0 0 0 1px var(--rubber-edge) inset, 0 4px 0 var(--rubber-edge);
  transition: transform 60ms ease-out, background-color 100ms ease;
}

.pad--lit {
  color: #fff;
  background: var(--color-pad-aqua);
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--color-pad-aqua) 70%, #000) inset, 0 4px 0 color-mix(in oklab, var(--color-pad-aqua) 55%, #000);
}

.pad--hit {
  transform: translateY(3px);
  background: var(--color-pad-sky);
  color: #fff;
}

.pad--empty {
  opacity: 0.4;
}

.pad__number {
  font-family: var(--font-display);
  font-size: 1.375rem;
  font-weight: 700;
}

.pad__label {
  font-size: 0.75rem;
  line-height: 1.15;
  text-align: center;
}

/* Small pads (phones): only the number; the sound is in the prompt above. */
@container (max-width: 4.5rem) {
  .pad__label {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pad--hit {
    transform: none;
  }
}
</style>
