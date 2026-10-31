<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

export type PadColor = 'tomato' | 'sun' | 'aqua' | 'sky'

defineProps<{
  label: string
  color: PadColor
  icon: string
  /** Lit pads navigate; without `to` the pad is unlit and shows `note`. */
  to?: RouteLocationRaw
  note?: string
}>()
</script>

<template>
  <RouterLink v-if="to" :to="to" class="pad" :class="`pad--${color}`">
    <UIcon :name="icon" class="pad__icon" />
    <span class="pad__label">{{ label }}</span>
  </RouterLink>
  <!-- Unlit pads still press: a dead tap feels broken to a child. -->
  <button v-else type="button" class="pad pad--unlit" :class="`pad--${color}`" aria-disabled="true">
    <UIcon :name="icon" class="pad__icon" />
    <span class="pad__label">{{ label }}</span>
    <UBadge v-if="note" :label="note" color="neutral" variant="soft" size="md" class="pad__note" />
  </button>
</template>

<style scoped>
.pad {
  --hue: var(--color-pad-sky);
  --depth: 6px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  min-height: 10rem;
  padding: var(--pad-padding, 1.25rem);
  border-radius: 1.25rem;
  text-align: left;
  color: var(--color-on-fill);
  background: radial-gradient(120% 90% at 30% 20%, color-mix(in oklab, var(--hue) 70%, var(--color-shine)) 0%, var(--hue) 60%);
  box-shadow:
    0 0 0 1px color-mix(in oklab, var(--hue) 70%, var(--color-shade)) inset,
    0 var(--depth) 0 color-mix(in oklab, var(--hue) 55%, var(--color-shade)),
    0 10px 28px -8px color-mix(in oklab, var(--hue) 70%, transparent);
  /* Release: settles back with a soft ease-out */
  transition: transform 180ms var(--ease-out), box-shadow 180ms var(--ease-out);
  user-select: none;
  touch-action: manipulation;
  cursor: pointer;
}

/* Press: fast, so the pad follows the finger */
.pad:active {
  --depth: 1px;
  transform: translateY(5px);
  transition-duration: 60ms;
}

@media (hover: hover) and (pointer: fine) {
  .pad:not(.pad--unlit):hover {
    filter: brightness(1.05);
  }
}

.pad--tomato { --hue: var(--color-pad-tomato); }
.pad--sun { --hue: var(--color-pad-sun); color: var(--color-on-attention); }
.pad--aqua { --hue: var(--color-pad-aqua); }
.pad--sky { --hue: var(--color-pad-sky); }

/* Unlit pad: plain rubber, the hue only tints the icon */
.pad--unlit {
  color: var(--ui-text-muted);
  background: var(--rubber);
  box-shadow:
    0 0 0 1px var(--rubber-edge) inset,
    0 var(--depth) 0 var(--rubber-edge);
  cursor: default;
}

.pad--unlit:active {
  transform: translateY(2px);
  --depth: 4px;
}

.pad--unlit .pad__icon {
  color: var(--hue);
}

.pad__icon {
  /* The page sets these when pads grow with the screen, so every pad keeps the same proportions. */
  width: var(--pad-icon, 2.25rem);
  height: var(--pad-icon, 2.25rem);
  margin-bottom: auto;
}

.pad__label {
  max-width: 100%;
  font-family: var(--font-display);
  font-size: var(--pad-label, clamp(1rem, 2.4vw, 1.25rem));
  hyphens: auto;
  overflow-wrap: anywhere;
  font-weight: 600;
  line-height: 1.15;
}

.pad__note {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
}

@media (prefers-reduced-motion: reduce) {
  .pad,
  .pad:active {
    transform: none;
    transition: box-shadow 120ms ease;
  }
}
</style>
