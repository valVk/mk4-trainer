<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

// The header of every screen: one small row (menu, back, the screen's name) so the content keeps the height, and a
// drawer behind the menu icon that slides in from the left and pushes the whole page aside, as in Material UI. In the
// drawer: Home, the theme, the screen's places (theory sections), its settings (the default slot, or a part inside
// the screen through #page-actions) and the quiet states the screens teleport into #drawer-status (MK4). The drawer
// lives on <body> and stays mounted, so those teleports always find their place; closed, it is inert.
const { t } = useI18n()
const route = useRoute()

const props = withDefaults(defineProps<{
  title: string
  /** Where the back button goes. */
  back?: string
  backLabel?: string
  /** Back stays on this screen (a part shown inside another, like a piece inside «Теория»): the listener decides. */
  onBack?: () => void
  /** A small line above the title: where this is («Теория» above a piece). */
  eyebrow?: string
  /** Title of the places group (the `nav` slot), like «Разделы». */
  navLabel?: string
}>(), { back: '/', backLabel: undefined, onBack: undefined, eyebrow: undefined, navLabel: undefined })

const open = ref(false)

function close() {
  open.value = false
}

function goBack() {
  close()
  props.onBack?.()
}

// The page slides aside with the drawer (App.vue's shell, styled in main.css).
watch(open, (value) => document.documentElement.classList.toggle('drawer-open', value))

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

watch(open, (value) => {
  if (value) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
})
// A new screen or a new place on it: the drawer has done its job.
watch(() => route.fullPath, close)
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.documentElement.classList.remove('drawer-open')
})
</script>

<template>
  <header class="page-header">
    <UButton icon="i-lucide-menu" color="neutral" variant="ghost" size="md" :aria-label="t('nav.menu', { name: title })" :aria-expanded="open" @click="open = true" />
    <UButton v-if="props.onBack" icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="md" :aria-label="backLabel ?? t('nav.home')" @click="goBack" />
    <UButton v-else :to="back" icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="md" :aria-label="backLabel ?? t('nav.home')" />
    <p class="bar-title text-highlighted">
      <span v-if="eyebrow" class="text-muted">{{ eyebrow }} · </span>{{ title }}
    </p>
  </header>

  <Teleport to="body">
    <div v-if="open" class="scrim" aria-hidden="true" @click="close" />
    <aside class="drawer" :class="{ 'drawer--open': open }" :role="open ? 'dialog' : undefined" :aria-label="title" :inert="!open">
      <nav class="drawer__nav">
        <UButton to="/" icon="i-lucide-house" color="neutral" variant="soft" size="lg" :label="t('nav.home')" />
        <span class="ml-auto" />
        <UColorModeButton color="neutral" variant="ghost" size="lg" />
        <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="lg" :aria-label="t('nav.close')" @click="close" />
      </nav>

      <div class="drawer__heading">
        <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
        <h1 class="title text-highlighted">{{ title }}</h1>
        <slot name="subtitle" />
      </div>

      <section v-if="$slots.nav" class="group">
        <p class="group__label">{{ navLabel }}</p>
        <div class="group__rows group__rows--places">
          <slot name="nav" />
        </div>
      </section>

      <!-- Rows like a settings list: what it is on the left, its switch or state on the right. -->
      <section class="group">
        <p class="group__label">{{ t('nav.settings') }}</p>
        <div id="page-actions" class="group__rows">
          <slot />
        </div>
      </section>

      <section class="group">
        <p class="group__label">{{ t('nav.state') }}</p>
        <div id="drawer-status" class="group__rows" />
      </section>
    </aside>
  </Teleport>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  min-height: 2.25rem;
  margin: -0.25rem 0 0.5rem -0.5rem;
}

.bar-title {
  min-width: 0;
  margin-left: 0.375rem;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Over the pushed page: a tap there closes the drawer. */
.scrim {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: color-mix(in oklab, var(--color-shade) 25%, transparent);
  animation: scrim-in 260ms var(--ease-out);
}

@keyframes scrim-in {
  from { opacity: 0; }
}

.drawer {
  position: fixed;
  z-index: 51;
  top: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  width: var(--drawer-width);
  padding: calc(env(safe-area-inset-top) + 1rem) 1.25rem 1.25rem;
  overflow-y: auto;
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border), 0 24px 48px -12px var(--shadow-strong);
  transform: translateX(-105%);
  transition: transform 260ms var(--ease-out);
}

.drawer--open {
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .drawer {
    transition: none;
  }
}

.drawer__nav {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.drawer__heading {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.eyebrow {
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.title {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* A group with nothing in it (a screen without settings) is not shown. */
.group:has(.group__rows:empty) {
  display: none;
}

.group__label {
  padding-inline: 0.25rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ui-text-muted);
}

.group__rows {
  display: flex;
  flex-direction: column;
  border-radius: 0.875rem;
  background: var(--ui-bg);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
  overflow: hidden;
}

/* Every item a screen puts here is one row of the same height, divided by a hairline. */
.group__rows > :deep(*) {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.75rem;
  width: 100%;
  min-height: 3.25rem;
  padding: 0.5rem 1rem;
}

.group__rows > :deep(* + *) {
  border-top: 1px solid var(--ui-border);
}

/* A switch: its label on the left, the switch on the right. */
.group__rows > :deep([data-slot="root"]) {
  flex-direction: row-reverse;
  justify-content: space-between;
}

.group__rows > :deep([data-slot="root"]) [data-slot="container"] {
  height: auto;
}

.group__rows :deep([data-slot="label"]) {
  font-size: 1rem;
  font-weight: 500;
  color: var(--ui-text);
}

/* A place (a section): the current one marked in the active colour with a check. */
.group__rows > :deep([aria-current="page"]) {
  font-weight: 700;
  color: var(--color-active);
}

.group__rows--places > :deep(button) {
  justify-content: space-between !important;
}

.group__rows > :deep(button:disabled) {
  opacity: 0.5;
}

/* A button as a row (tips, sound): plain, the whole row is the button. */
.group__rows > :deep(button),
.group__rows > :deep(div > button:only-child) {
  justify-content: flex-start;
  border-radius: 0;
  font-size: 1rem;
  font-weight: 500;
  color: var(--ui-text);
  background: transparent;
  box-shadow: none;
}

.group__rows > :deep(div > button:only-child) {
  width: calc(100% + 2rem);
  min-height: 3.25rem;
  margin: -0.5rem -1rem;
  padding: 0.5rem 1rem;
}
</style>
