<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

import PianoKeyboard from '@/components/PianoKeyboard.vue'

// Development only: one theme's colours (dev colour sheet, /dev/colors), every token with its value and the
// components that use them, so the owner can judge a theme as a whole. The page puts two of these side by side.
defineProps<{ title: string }>()

const GROUPS: { name: string, tokens: string[] }[] = [
  { name: 'Фон', tokens: ['--ui-bg', '--ui-bg-muted', '--ui-bg-elevated', '--ui-bg-accented', '--ui-bg-inverted'] },
  { name: 'Текст', tokens: ['--ui-text-highlighted', '--ui-text', '--ui-text-toned', '--ui-text-muted', '--ui-text-dimmed', '--ui-text-inverted'] },
  { name: 'Рамки', tokens: ['--ui-border', '--ui-border-muted', '--ui-border-accented'] },
  { name: 'Nuxt UI', tokens: ['--ui-primary', '--ui-success', '--ui-warning', '--ui-error'] },
  { name: 'Смыслы', tokens: ['--color-active', '--color-active-deep', '--color-correct', '--color-attention', '--color-wrong', '--color-beat', '--color-focus'] },
  { name: 'На заливке', tokens: ['--color-on-fill', '--color-on-attention', '--color-on-focus'] },
  { name: 'Пэды', tokens: ['--color-pad-tomato', '--color-pad-sun', '--color-pad-aqua', '--color-pad-sky'] },
  { name: 'Клавиши и MK4', tokens: ['--key-white', '--key-black', '--key-label', '--key-label-dim', '--key-label-outside', '--rubber', '--rubber-edge', '--star-off', '--mk4-display', '--mk4-display-text'] },
]

const root = ref<HTMLElement | null>(null)
const values = ref<Record<string, string>>({})

/** The colour as #rrggbb (or #rrggbbaa), whatever form it is written in (var, oklch, color-mix). */
function hexOf(color: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d')!
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
  const hex = [r, g, b].map((part) => part!.toString(16).padStart(2, '0')).join('')
  return a === 255 ? `#${hex}` : `#${hex}${a!.toString(16).padStart(2, '0')}`
}

onMounted(async () => {
  await nextTick()
  const out: Record<string, string> = {}
  for (const swatch of root.value?.querySelectorAll<HTMLElement>('[data-token]') ?? []) {
    out[swatch.dataset.token!] = hexOf(getComputedStyle(swatch).backgroundColor)
  }
  values.value = out
})

const on = ref(true)
const off = ref(false)
</script>

<template>
  <div ref="root" class="sheet">
    <h2 class="sheet__title">{{ title }}</h2>

    <section v-for="group in GROUPS" :key="group.name" class="group">
      <p class="group__name">{{ group.name }}</p>
      <div class="swatches">
        <div v-for="token in group.tokens" :key="token" class="swatch">
          <span class="swatch__colour" :data-token="token" :style="{ background: `var(${token})` }" />
          <span class="swatch__name">{{ token.replace('--', '') }}</span>
          <span class="swatch__value">{{ values[token] }}</span>
        </div>
      </div>
    </section>

    <section class="group">
      <p class="group__name">Кнопки</p>
      <div class="row">
        <UButton label="Играть" icon="i-lucide-play" />
        <UButton label="Послушать" icon="i-lucide-ear" color="neutral" variant="soft" />
        <UButton label="Звук выключен" color="neutral" variant="outline" />
        <UButton label="Пропустить" color="neutral" variant="ghost" />
        <UButton label="Дальше" color="success" />
        <UButton label="Сбросить" color="error" variant="soft" />
      </div>
      <div class="row">
        <USwitch v-model="on" label="С подсказкой" />
        <USwitch v-model="off" label="Любая октава" />
        <span class="chip chip--on">Р3</span>
        <span class="chip chip--done">Р2</span>
        <span class="chip">Р4</span>
        <span class="exam">Экзамен</span>
        <span class="stars">★★<span class="stars__off">★</span></span>
      </div>
      <div class="row">
        <span class="focus-ring">Под ручкой</span>
        <span class="focus-fill">Выбранное под ручкой</span>
        <span class="pill pill--right">Верно!</span>
        <span class="pill pill--warn">Лишняя нота</span>
      </div>
    </section>

    <section class="group">
      <p class="group__name">Клавиши</p>
      <PianoKeyboard :start="60" :held="[60, 64]" :hint="[67]" show-names context-names show-intervals />
    </section>
  </div>
</template>

<style scoped>
.sheet {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-height: 100%;
  padding: 1.5rem;
  color: var(--ui-text);
  background: var(--ui-bg);
}

.sheet__title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--ui-text-highlighted);
}

.group {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.group__name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ui-text-muted);
}

.swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  gap: 0.5rem;
}

.swatch {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr);
  grid-template-rows: auto auto;
  column-gap: 0.5rem;
  align-items: center;
}

.swatch__colour {
  grid-row: 1 / 3;
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  box-shadow: 0 0 0 1px var(--ui-border-accented) inset;
}

.swatch__name {
  overflow: hidden;
  font-size: 0.75rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}

.swatch__value {
  font-family: ui-monospace, monospace;
  font-size: 0.6875rem;
  color: var(--ui-text-muted);
  user-select: text;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.chip {
  display: inline-grid;
  place-items: center;
  min-width: 2.75rem;
  height: 2.5rem;
  padding: 0 0.75rem;
  border-radius: 0.75rem;
  font-weight: 700;
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
}

.chip--on {
  color: var(--color-on-fill);
  background: var(--color-active);
  box-shadow: none;
}

.chip--done {
  box-shadow: 0 0 0 var(--ring-width) var(--color-correct) inset;
}

.stars {
  font-size: 1.5rem;
  color: var(--color-attention);
}

.stars__off {
  color: var(--star-off);
}

.focus-ring,
.focus-fill,
.pill {
  padding: 0.5rem 0.875rem;
  border-radius: 0.5rem;
  font-weight: 600;
}

.focus-ring {
  color: var(--color-focus);
  background: var(--ui-bg-elevated);
  box-shadow: inset 0 0 0 var(--ring-width) var(--color-focus);
}

.focus-fill {
  color: var(--color-on-focus);
  background: var(--color-focus);
}

.pill--right {
  color: var(--color-on-fill);
  background: var(--color-correct);
}

.pill--warn {
  color: var(--color-on-fill);
  background: color-mix(in oklab, var(--color-wrong) 88%, var(--color-shade));
}
</style>
