<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSynth } from '@/composables/useSynth'
import { buildCatalog, findName, groupOf, resolveInstrument, sameInstrument, type GroupId, type Instrument } from '@/lib/instruments'

// Instrument choice like a GM synth: families on the left, instruments and their variants on the right.
const { t } = useI18n()
const { presets, instrument, setInstrument, previewInstrument } = useSynth()

const open = ref(false)
const catalog = computed(() => buildCatalog(presets.value))
// What actually plays: a variant the bank lacks falls back to the GM program.
const playing = computed(() => resolveInstrument(instrument.value, presets.value))
const currentName = computed(() => findName(playing.value, presets.value) ?? t('sound.instrumentLabel'))

const groupFor = (item: Instrument): GroupId => (item.bank === 127 ? 'mt32' : groupOf(item.program))
const activeGroup = ref<GroupId>(groupFor(playing.value))
watch(open, (isOpen) => {
  if (isOpen) activeGroup.value = groupFor(playing.value)
})

const entries = computed(() => catalog.value.find((group) => group.id === activeGroup.value)?.entries ?? [])

function choose(item: Instrument) {
  setInstrument(item)
  previewInstrument()
}

const isCurrent = (item: Instrument) => sameInstrument(item, playing.value)
</script>

<template>
  <UModal v-model:open="open" :title="t('sound.pickerTitle')" :ui="{ content: 'max-w-3xl' }">
    <UButton
      icon="i-lucide-music"
      color="neutral"
      variant="soft"
      size="lg"
      trailing-icon="i-lucide-chevron-down"
      :label="currentName"
      :aria-label="t('sound.instrumentLabel')"
      class="max-w-60"
    />

    <template #body>
      <div class="picker">
        <nav class="groups" :aria-label="t('sound.groupsLabel')">
          <button
            v-for="group in catalog"
            :key="group.id"
            type="button"
            class="group"
            :class="{ 'group--active': group.id === activeGroup }"
            :aria-current="group.id === activeGroup"
            @click="activeGroup = group.id"
          >
            {{ t(`sound.groups.${group.id}`) }}
          </button>
        </nav>

        <ul class="entries">
          <li v-for="entry in entries" :key="`${entry.bank}-${entry.program}`">
            <button type="button" class="entry" :class="{ 'entry--current': isCurrent(entry) }" @click="choose(entry)">
              <span>{{ entry.name }}</span>
              <UIcon v-if="isCurrent(entry)" name="i-lucide-check" class="size-5 shrink-0" />
            </button>
          </li>
        </ul>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <span class="text-muted text-sm">{{ t('sound.pickerHint') }}</span>
        <UButton size="lg" :label="t('sound.done')" @click="open = false" />
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.picker {
  display: grid;
  grid-template-columns: minmax(0, 16rem) minmax(0, 1fr);
  gap: 1rem;
  height: min(60dvh, 30rem);
}

.groups,
.entries {
  overflow-y: auto;
  overscroll-behavior: contain;
}

.groups,
.entries {
  /* Thin themed scrollbar; the bottom fade shows there is more to scroll */
  scrollbar-width: thin;
  scrollbar-color: var(--ui-border-accented) transparent;
  mask-image: linear-gradient(to bottom, #000 calc(100% - 2rem), transparent);
  padding-bottom: 2rem;
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-right: 0.75rem;
  border-right: 1px solid var(--ui-border-muted);
}

.group,
.entry {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 2.75rem;
  padding: 0.625rem 0.875rem;
  border-radius: 0.625rem;
  line-height: 1.25;
  text-align: left;
  color: var(--ui-text);
  transition: background-color 120ms ease;
}

.group {
  flex: none;
}

@media (hover: hover) and (pointer: fine) {
  .group:hover,
  .entry:hover {
    background: var(--ui-bg-accented);
  }
}

.group--active {
  font-weight: 600;
  color: #fff;
  background: var(--color-pad-sky);
}

@media (hover: hover) and (pointer: fine) {
  .group--active:hover {
    background: var(--color-pad-sky);
  }
}

.entry span:first-child {
  flex: 1;
}

.entry--current {
  font-weight: 600;
  color: var(--ui-text-highlighted);
  background: var(--ui-bg-accented);
}

@media (max-width: 640px) {
  .picker {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  .groups {
    flex-direction: row;
    overflow-x: auto;
    padding: 0 0 0.5rem;
    border-right: 0;
    border-bottom: 1px solid var(--ui-border-muted);
  }

  .group {
    width: auto;
    white-space: nowrap;
  }
}
</style>
