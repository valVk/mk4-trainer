<script setup lang="ts">
import { computed, ref } from 'vue'

// Development only (/dev/focus): the owner picks how the MK4 display knob's place (the focus) looks. A fill tone for
// a selected or main element, a style for any other; each pair has a code to send back. Not in the built app.

const TONES = [
  { id: 'F1', hex: '#ff9a2e', name: 'orange (now)' },
  { id: 'F2', hex: '#f2b36b', name: 'apricot' },
  { id: 'F3', hex: '#e8b15c', name: 'honey' },
  { id: 'F4', hex: '#f5c26b', name: 'light amber' },
  { id: 'F5', hex: '#e9a86f', name: 'peach' },
  { id: 'F6', hex: '#d9a066', name: 'muted tan' },
  { id: 'F7', hex: '#f0c987', name: 'sand' },
  { id: 'F8', hex: '#e6b980', name: 'soft caramel' },
] as const

const STYLES = [
  { id: 'I1', name: 'ring + text' },
  { id: 'I2', name: 'ring only' },
  { id: 'I3', name: 'text + lighter background' },
  { id: 'I4', name: 'underline + text' },
  { id: 'I5', name: 'thin ring + lighter background' },
  { id: 'I6', name: 'lighter background only' },
  { id: 'I7', name: 'ring + glow' },
  { id: 'I8', name: 'outer ring' },
] as const

const tone = ref<string>('F2')
const style = ref<string>('I1')
const custom = ref('#f2b36b')
const useCustom = ref(false)

const hex = computed(() => (useCustom.value ? custom.value : TONES.find((item) => item.id === tone.value)!.hex))
const code = computed(() => `${useCustom.value ? custom.value : tone.value} · ${style.value}`)

const SOUNDS = ['Щелчок', 'Коробочка', 'Ковбелл'] as const
</script>

<template>
  <main class="page playground" :style="{ '--pv': hex }">
    <h1 class="font-display text-2xl font-bold text-highlighted">Курсор ручки MK4</h1>

    <section class="block">
      <p class="label">Заливка: выбранный или главный элемент под ручкой</p>
      <div class="chips">
        <button v-for="item in TONES" :key="item.id" type="button" class="chip" :class="{ 'chip--on': !useCustom && tone === item.id }" @click="tone = item.id; useCustom = false">
          <span class="swatch" :style="{ background: item.hex }" />
          <span>{{ item.id }} {{ item.name }}</span>
          <span class="font-mono text-xs text-muted">{{ item.hex }}</span>
        </button>
        <label class="chip" :class="{ 'chip--on': useCustom }">
          <input v-model="custom" type="color" class="picker" @input="useCustom = true">
          <span>свой</span>
          <span class="font-mono text-xs text-muted">{{ custom }}</span>
        </label>
      </div>
    </section>

    <section class="block">
      <p class="label">Остальные элементы под ручкой</p>
      <div class="chips">
        <button v-for="item in STYLES" :key="item.id" type="button" class="chip" :class="{ 'chip--on': style === item.id }" @click="style = item.id">
          {{ item.id }} {{ item.name }}
        </button>
      </div>
    </section>

    <section class="block preview" :class="`pv-${style}`">
      <p class="label">Ручка на невыбранном</p>
      <div class="row">
        <UButton v-for="sound in SOUNDS" :key="sound" size="lg" :color="sound === 'Щелчок' ? 'primary' : 'neutral'" :variant="sound === 'Щелчок' ? 'solid' : 'soft'" :class="{ 'pv-focus': sound === 'Коробочка' }" :label="sound" />
        <span class="gap" />
        <UButton size="lg" color="neutral" variant="soft" icon="i-lucide-ear" label="Послушать" class="pv-focus" />
        <UButton size="lg" color="neutral" variant="soft" icon="i-lucide-rotate-ccw" label="Ещё раз" />
        <UButton size="lg" icon="i-lucide-play" label="Играть" />
      </div>
      <p class="label">Ручка на выбранном и главном</p>
      <div class="row">
        <UButton v-for="sound in SOUNDS" :key="sound" size="lg" :color="sound === 'Щелчок' ? 'primary' : 'neutral'" :variant="sound === 'Щелчок' ? 'solid' : 'soft'" :class="{ 'pv-active': sound === 'Щелчок' }" :label="sound" />
        <span class="gap" />
        <UButton size="lg" color="neutral" variant="soft" icon="i-lucide-ear" label="Послушать" />
        <UButton size="lg" color="neutral" variant="soft" icon="i-lucide-rotate-ccw" label="Ещё раз" />
        <UButton size="lg" icon="i-lucide-play" label="Играть" class="pv-active" />
      </div>
    </section>

    <section class="block">
      <p class="label">Код для отправки</p>
      <p class="code">{{ code }}</p>
    </section>
  </main>
</template>

<style scoped>
.playground {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  --pv-on: #2a1500;
  --pv-lift: color-mix(in oklab, var(--ui-text-highlighted) 10%, transparent);
}

.block {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.label {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
}

.chips,
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.gap {
  width: 1.5rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
  cursor: pointer;
}

.chip--on {
  box-shadow: 0 0 0 2px var(--ui-text-highlighted) inset;
}

.swatch {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
}

.picker {
  width: 1.5rem;
  height: 1.5rem;
  border: 0;
  padding: 0;
  background: none;
}

.preview {
  padding: 1.25rem;
  border-radius: 1rem;
  background: var(--ui-bg);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
}

.code {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 800;
  color: var(--ui-text-highlighted);
  user-select: text;
  -webkit-user-select: text;
}

/* Selected or main element under the knob: full fill. */
.pv-active {
  box-shadow: inset 0 0 0 100vmax var(--pv) !important;
  color: var(--pv-on) !important;
}

/* Any other element under the knob, by style. */
.pv-I1 .pv-focus { box-shadow: inset 0 0 0 2px var(--pv) !important; color: var(--pv) !important; }
.pv-I2 .pv-focus { box-shadow: inset 0 0 0 2px var(--pv) !important; }
.pv-I3 .pv-focus { box-shadow: inset 0 0 0 100vmax var(--pv-lift) !important; color: var(--pv) !important; }
.pv-I4 .pv-focus { box-shadow: inset 0 -3px 0 var(--pv), inset 0 0 0 100vmax var(--pv-lift) !important; color: var(--pv) !important; }
.pv-I5 .pv-focus { box-shadow: inset 0 0 0 1.5px var(--pv), inset 0 0 0 100vmax var(--pv-lift) !important; }
.pv-I6 .pv-focus { box-shadow: inset 0 0 0 100vmax color-mix(in oklab, var(--ui-text-highlighted) 16%, transparent) !important; }
.pv-I7 .pv-focus { box-shadow: inset 0 0 0 2px var(--pv), 0 0 14px -2px var(--pv) !important; color: var(--pv) !important; }
.pv-I8 .pv-focus { box-shadow: 0 0 0 2px var(--ui-bg), 0 0 0 4px var(--pv) !important; }
</style>
