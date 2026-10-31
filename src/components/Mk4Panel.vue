<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useProgress } from '@/composables/useProgress'
import type { Inventory, PadNotes } from '@/lib/midiInventory'
import { MK4_FACTORY, MK4_PANEL, MK4_SILENT, PANEL_ACTIONS, TURN_ACTIONS, controlFor, type PanelAction, type PanelControl } from '@/lib/mk4Layout'

// «Проверка MK4» → «Панель MK4» (plan step 25): the MK4 drawn as on its box. A control lights up when its message
// comes. Keys and pads are known by their notes; every other control is taught: tap it here, press it on the MK4.
// Then choose what it does in the app (done in plan step 26). Controls nothing was learnt for stay grey.

const props = defineProps<{
  inventory: Inventory
  keysStart: number
  pads: PadNotes
  now: number
}>()

const { t } = useI18n()
const progress = useProgress()

const selected = ref<PanelControl | null>(null)
/** Waiting for the selected control to be pressed on the MK4, since this moment. */
const learningSince = ref<number | null>(null)

const learnt = computed(() => progress.mk4Panel.value.learnt)
const actions = computed(() => progress.mk4Panel.value.actions)

/** When each control last sent something. */
const lastAt = computed(() => {
  const at = new Map<string, number>()
  for (const item of props.inventory.values()) {
    const control = controlFor(item.id, learnt.value, props.keysStart, props.pads)
    if (control) at.set(control, Math.max(at.get(control) ?? 0, item.at))
  }
  return at
})

/** Taught by the owner, else what the MK4 sends out of the box. */
const messageOf = (control: PanelControl) => learnt.value[control.id] ?? MK4_FACTORY[control.id]
const learnable = (control: PanelControl) => control.key === undefined && control.pad === undefined && control.shape !== 'display' && !MK4_SILENT.includes(control.id)
const lit = (control: PanelControl) => props.now - (lastAt.value.get(control.id) ?? -Infinity) < 350
const silent = (control: PanelControl) => MK4_SILENT.includes(control.id) || (learnable(control) && !messageOf(control))

function choose(control: PanelControl) {
  selected.value = control
  learningSince.value = learnable(control) ? props.now : null
}

// The first control message after the tap is the selected control's (keys and pads are not: they are known).
watch(() => props.inventory, (inventory) => {
  const control = selected.value
  const since = learningSince.value
  if (!control || since === null) return
  const fresh = [...inventory.values()].filter((item) => item.at > since && item.kind !== 'key' && item.kind !== 'pad').sort((a, b) => b.at - a.at)[0]
  if (!fresh) return
  learningSince.value = null
  void progress.setMk4Control(control.id, fresh.id)
})

const actionItems = computed(() => {
  const control = selected.value
  if (!control) return []
  const turns = control.shape === 'knob' || control.shape === 'wheel'
  return (turns ? TURN_ACTIONS : PANEL_ACTIONS.filter((action) => !['tempo', 'volume'].includes(action))).map((action) => ({ label: t(`mk4.actions.${action}`), value: action }))
})

function setAction(action: PanelAction) {
  const control = selected.value
  const message = control ? messageOf(control) : undefined
  if (control && message) void progress.setMk4Control(control.id, message, action)
}

function forget() {
  if (selected.value) void progress.setMk4Control(selected.value.id, null)
}
</script>

<template>
  <div class="panel">
    <svg viewBox="0 0 1000 420" class="panel__drawing" role="group" :aria-label="t('mk4.panelLabel')">
      <rect x="0" y="0" width="1000" height="260" rx="14" class="body" />
      <g
        v-for="control in MK4_PANEL"
        :key="control.id"
        class="control"
        :class="[`control--${control.shape}`, { 'control--lit': lit(control), 'control--silent': silent(control), 'control--chosen': selected?.id === control.id }]"
        role="button"
        :aria-label="control.label || control.id"
        @click="choose(control)"
      >
        <ellipse v-if="control.shape === 'knob'" :cx="control.x + control.w / 2" :cy="control.y + control.h / 2" :rx="control.w / 2" :ry="control.h / 2" />
        <rect v-else :x="control.x" :y="control.y" :width="control.w" :height="control.h" :rx="control.shape === 'pad' ? 8 : 5" />
        <text v-if="control.label" :x="control.x + control.w / 2" :y="control.shape === 'knob' ? control.y + control.h + 14 : control.y + control.h / 2 + 4" text-anchor="middle">{{ control.label }}</text>
      </g>
    </svg>

    <div class="panel__side">
      <template v-if="selected">
        <p class="font-semibold text-highlighted">{{ selected.label || t('mk4.keyOrPad') }}</p>
        <template v-if="learnable(selected)">
          <p v-if="learningSince !== null" class="learning">{{ t('mk4.pressIt') }}</p>
          <p v-else-if="messageOf(selected)" class="font-mono text-sm text-toned">{{ messageOf(selected) }}</p>
          <p v-else class="text-muted">{{ t('mk4.silent') }}</p>
          <USelect
            v-if="messageOf(selected)"
            :model-value="actions[selected.id] ?? 'none'"
            :items="actionItems"
            :aria-label="t('mk4.actionLabel')"
            @update:model-value="setAction($event as PanelAction)"
          />
          <div class="flex gap-2">
            <UButton v-if="learnt[selected.id]" color="neutral" variant="ghost" :label="t('mk4.forget')" @click="forget" />
            <UButton color="neutral" variant="soft" icon="i-lucide-radio" :label="t('mk4.learnAgain')" @click="choose(selected)" />
          </div>
        </template>
        <p v-else-if="MK4_SILENT.includes(selected.id)" class="text-muted">{{ t('mk4.noMidi') }}</p>
        <p v-else class="text-muted">{{ t('mk4.known') }}</p>
      </template>
      <p v-else class="text-muted">{{ t('mk4.tapControl') }}</p>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 16rem;
  gap: 1.25rem;
  align-items: start;
}

.panel__drawing {
  width: 100%;
  height: auto;
  display: block;
}

.body {
  fill: var(--ui-bg-elevated);
  stroke: var(--ui-border-accented);
}

.control {
  cursor: pointer;
}

.control rect,
.control ellipse {
  fill: var(--ui-bg-muted);
  stroke: var(--ui-text-muted);
  stroke-width: 1.5;
  transition: fill 120ms ease;
}

.control text {
  font-size: 12px;
  font-weight: 600;
  fill: var(--ui-text-toned);
  pointer-events: none;
}

.control--key rect {
  fill: #f8f9fc;
}

.control--blackKey rect {
  fill: #232741;
}

.control--pad rect {
  fill: color-mix(in oklab, var(--ui-text-muted) 22%, var(--ui-bg-muted));
}

.control--display rect {
  fill: #1c2135;
}

.control--display text {
  fill: #9fb5ff;
}

/* Taught nothing yet: dashed, quiet. */
.control--silent rect,
.control--silent ellipse {
  stroke-dasharray: 4 3;
  opacity: 0.6;
}

.control--lit rect,
.control--lit ellipse {
  fill: var(--color-pad-sky);
}

.control--chosen rect,
.control--chosen ellipse {
  stroke: var(--color-pad-sky);
  stroke-width: 3;
}

.panel__side {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.learning {
  font-weight: 600;
  color: var(--color-pad-sky);
}
</style>
