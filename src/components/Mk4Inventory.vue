<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { inventorySummary, type Inventory, type PadNotes } from '@/lib/midiInventory'

// «Проверка MK4» → «Элементы» (plan step 25): one row per control that sent something, the one just touched lit,
// and how much of the MK4 has been found (the copy for mapping is in the page's row of views).

const props = defineProps<{
  inventory: Inventory
  /** Tempo the MIDI Clock beats, when it runs (the MK4's Tap Tempo). */
  tempo: number | null
  device: string
  pads: PadNotes
  /** Now, ms, ticking: a row touched in the last moment is lit. */
  now: number
}>()

const emit = defineEmits<{
  clear: []
}>()

const { t } = useI18n()

const rows = computed(() => [...props.inventory.values()].sort((a, b) => b.at - a.at))
const summary = computed(() => inventorySummary(props.inventory))

</script>

<template>
  <div class="inventory">
    <div class="inventory__head">
      <p class="font-semibold text-highlighted">{{ t('mk4.summary', summary) }}</p>
      <p v-if="tempo" class="text-toned">{{ t('mk4.clock', { bpm: tempo }) }}</p>
      <UButton class="ml-auto" color="neutral" variant="ghost" icon="i-lucide-trash-2" :label="t('mk4.clear')" @click="emit('clear')" />
    </div>
    <p v-if="inventory.size === 0" class="text-muted">{{ t('mk4.empty') }}</p>
    <div v-else class="inventory__table">
      <table>
        <thead>
          <tr>
            <th>{{ t('mk4.columns.kind') }}</th>
            <th>{{ t('mk4.columns.message') }}</th>
            <th>{{ t('mk4.columns.channel') }}</th>
            <th>{{ t('mk4.columns.number') }}</th>
            <th>{{ t('mk4.columns.range') }}</th>
            <th>{{ t('mk4.columns.last') }}</th>
            <th>{{ t('mk4.columns.count') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" :class="{ 'row--now': now - row.at < 400 }">
            <td>{{ t(`mk4.kinds.${row.kind}`) }}</td>
            <td class="font-mono text-xs">{{ row.id }}</td>
            <td>{{ row.channel || '—' }}</td>
            <td>{{ row.number ?? '—' }}</td>
            <td>{{ row.min }}–{{ row.max }}</td>
            <td>{{ row.last }}</td>
            <td>{{ row.count }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.inventory {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
}

.inventory__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
}

.inventory__table {
  overflow: auto;
  max-height: 55vh;
  border-radius: 0.75rem;
  box-shadow: 0 0 0 1px var(--ui-border) inset;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

th,
td {
  padding: 0.375rem 0.75rem;
  text-align: left;
  white-space: nowrap;
}

th {
  position: sticky;
  top: 0;
  background: var(--ui-bg-elevated);
  color: var(--ui-text-muted);
  font-weight: 600;
}

tbody tr {
  border-top: 1px solid var(--ui-border);
  transition: background-color 300ms ease;
}

.row--now {
  background: color-mix(in oklab, var(--color-pad-sky) 18%, transparent);
}
</style>
