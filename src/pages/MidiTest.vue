<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import HeldNotesPanel from '@/components/HeldNotesPanel.vue'
import Mk4Inventory from '@/components/Mk4Inventory.vue'
import Mk4Panel from '@/components/Mk4Panel.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusLed from '@/components/StatusLed.vue'
import { useKeyboardWindow } from '@/composables/useKeyboardWindow'
import { useNoteSource } from '@/composables/useNoteSource'
import { padsPlayMusic } from '@/composables/usePadActions'
import { useProgress } from '@/composables/useProgress'
import { addMessage, clockTempo, inventoryJson, type Inventory } from '@/lib/midiInventory'
import { midiName } from '@/lib/theory'

type EventKind = 'noteOn' | 'noteOff' | 'cc' | 'pitchBend' | 'program' | 'aftertouch' | 'other'

interface LogEntry {
  id: number
  time: string
  input: string
  bytes: string
  kind: EventKind
  channel: number
  data1: number
  data2: number
}

const LOG_LIMIT = 200
// MK4 pads send notes on channel 10 by default.
const PAD_CHANNEL = 10

const { t } = useI18n()
const { connectMidi, padMap } = useNoteSource()
const keysStart = useKeyboardWindow()
const progress = useProgress()

/** «Журнал» of raw messages, «Элементы» found (plan step 25), the MK4 drawn with what each control does. */
const VIEWS = ['log', 'elements', 'panel'] as const
const view = ref<typeof VIEWS[number]>('log')
const inventory = shallowRef<Inventory>(new Map())
const clockTicks: number[] = []
const tempo = ref<number | null>(null)
const copied = ref(false)
async function copyInventory() {
  await navigator.clipboard.writeText(inventoryJson(inventory.value, deviceName.value, pads.value, progress.mk4Panel.value))
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}
const pads = computed(() => ({ channel: padMap.value.channel, notes: padMap.value.notes }))
const deviceName = computed(() => inputs.value.find((item) => item.connected)?.name ?? 'MIDI')
/** Ticks while the page is open, so a control just touched is lit for a moment. */
const now = ref(performance.now())
const ticker = setInterval(() => {
  now.value = performance.now()
}, 100)
onBeforeUnmount(() => clearInterval(ticker))

// Pads are being looked at here, not used: pads 5 and 6 must not switch to «Тренировка» or «Лаборатория» mid-check.
padsPlayMusic.value = true
onBeforeUnmount(() => {
  padsPlayMusic.value = false
})

const isSecure = window.isSecureContext
const hasWebMidi = 'requestMIDIAccess' in navigator

const access = shallowRef<MIDIAccess | null>(null)
const inputs = ref<{ id: string, name: string, manufacturer: string, connected: boolean, activity: number }[]>([])
const log = ref<LogEntry[]>([])
const error = ref('')
let nextId = 0

function describe(status: number, data2: number): EventKind {
  const type = status & 0xf0
  if (type === 0x90 && data2 > 0) return 'noteOn'
  if (type === 0x80 || type === 0x90) return 'noteOff'
  if (type === 0xb0) return 'cc'
  if (type === 0xe0) return 'pitchBend'
  if (type === 0xc0) return 'program'
  if (type === 0xd0 || type === 0xa0) return 'aftertouch'
  return 'other'
}

const isNote = (entry: LogEntry) => entry.kind === 'noteOn' || entry.kind === 'noteOff'

function onMessage(event: MIDIMessageEvent) {
  const data = event.data
  if (!data || data.length === 0) return
  const status = data[0] ?? 0
  // MIDI Clock: timed for the tempo it beats (the MK4's Tap Tempo), kept out of the log like active sensing.
  if (status === 0xf8) {
    clockTicks.push(performance.now())
    if (clockTicks.length > 100) clockTicks.shift()
    tempo.value = clockTempo(clockTicks)
    return
  }
  if (status === 0xfe) return
  inventory.value = addMessage(inventory.value, data, pads.value, performance.now())
  const data2 = data[2] ?? 0
  const input = event.target as MIDIInput | null
  const row = inputs.value.find((item) => item.id === input?.id)
  if (row) row.activity++
  log.value.unshift({
    id: nextId++,
    time: new Date().toLocaleTimeString(),
    input: input?.name ?? '?',
    bytes: Array.from(data, (b) => b.toString(16).padStart(2, '0')).join(' '),
    kind: describe(status, data2),
    channel: (status & 0x0f) + 1,
    data1: data[1] ?? 0,
    data2,
  })
  if (log.value.length > LOG_LIMIT) log.value.length = LOG_LIMIT
}

function refreshInputs() {
  if (!access.value) return
  inputs.value = []
  access.value.inputs.forEach((input) => {
    input.onmidimessage = onMessage
    inputs.value.push({
      id: input.id,
      name: input.name ?? '?',
      manufacturer: input.manufacturer ?? '',
      connected: input.state === 'connected',
      activity: 0,
    })
  })
}

async function connect() {
  error.value = ''
  try {
    // SysEx too: the MK4's Octave buttons (and maybe more of its controls) speak it.
    access.value = await navigator.requestMIDIAccess({ sysex: true })
    access.value.onstatechange = refreshInputs
    refreshInputs()
    // Same permission, so the shared note source (held notes panel) connects without a second prompt.
    await connectMidi()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

onBeforeUnmount(() => {
  if (!access.value) return
  access.value.onstatechange = null
  access.value.inputs.forEach((input) => {
    input.onmidimessage = null
  })
})
</script>

<template>
  <main class="page">
    <PageHeader :title="t('midiTest.title')">
      <UButton to="/pads" icon="i-lucide-grid-2x2" color="neutral" variant="soft" size="lg" :label="t('midiTest.pads')" />
    </PageHeader>

    <div class="layout">
      <section class="flex flex-col gap-7">
        <div class="flex flex-col gap-3.5">
          <StatusLed :on="isSecure" :label="t('midiTest.secureContext')" :state="isSecure ? t('midiTest.yes') : t('midiTest.no')" />
          <StatusLed :on="hasWebMidi" :label="t('midiTest.webMidi')" :state="hasWebMidi ? t('midiTest.yes') : t('midiTest.no')" />
        </div>

        <template v-if="!access">
          <UButton
            :disabled="!hasWebMidi"
            icon="i-lucide-plug"
            size="xl"
            class="self-start"
            :label="t('midiTest.connect')"
            @click="connect"
          />
          <UAlert
            color="neutral"
            variant="soft"
            icon="i-lucide-usb"
            :description="t('midiTest.hint')"
            :ui="{ description: 'text-base text-toned' }"
          />
        </template>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-x"
          :title="t('midiTest.denied')"
          :description="error"
        />

        <div v-if="access">
          <h2 class="subtitle text-highlighted mb-3.5">{{ t('midiTest.inputs') }}</h2>
          <p v-if="inputs.length === 0" class="text-muted leading-relaxed">{{ t('midiTest.noInputs') }}</p>
          <ul v-else class="flex flex-col gap-3.5">
            <li v-for="input in inputs" :key="input.id">
              <StatusLed :on="input.connected" :label="input.name" :state="input.manufacturer" :activity="input.activity" />
            </li>
          </ul>
        </div>
      </section>

      <div class="flex flex-col gap-6 min-w-0">
      <div class="views" role="tablist" :aria-label="t('mk4.viewsLabel')">
        <button v-for="item in VIEWS" :key="item" type="button" role="tab" class="view" :class="{ 'view--on': view === item }" :aria-selected="view === item" @click="view = item">
          {{ t(`mk4.views.${item}`) }}
        </button>
        <!-- On every view: what was found, as JSON for mapping (plan step 25). -->
        <UButton class="ml-auto" icon="i-lucide-copy" :label="copied ? t('mk4.copied') : t('mk4.copy')" :disabled="inventory.size === 0" @click="copyInventory" />
      </div>
      <Mk4Inventory v-if="view === 'elements'" :inventory="inventory" :tempo="tempo" :device="deviceName" :pads="pads" :now="now" @clear="inventory = new Map()" />
      <Mk4Panel v-else-if="view === 'panel'" :inventory="inventory" :keys-start="keysStart" :pads="pads" :now="now" />
      <template v-else>
      <HeldNotesPanel />

      <UCard variant="subtle" :ui="{ header: 'flex items-center justify-between min-h-16 py-3', body: 'p-0 sm:p-0' }">
        <template #header>
          <h2 class="subtitle text-highlighted">{{ t('midiTest.log') }}</h2>
          <UButton
            v-if="log.length > 0"
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            :label="t('midiTest.clear')"
            @click="log = []"
          />
        </template>

        <UEmpty
          v-if="log.length === 0"
          variant="naked"
          size="lg"
          :icon="access ? 'i-lucide-piano' : 'i-lucide-plug-zap'"
          :description="access ? t('midiTest.emptyLog') : t('midiTest.notConnected')"
          class="py-16"
          :ui="{ description: 'text-base text-muted max-w-xs' }"
        />
        <ol v-else class="log" :aria-label="t('midiTest.log')">
          <li v-for="entry in log" :key="entry.id" class="event" :class="{ 'event--off': entry.kind === 'noteOff' }">
            <span class="event__main text-highlighted">
              <template v-if="isNote(entry) && entry.channel !== PAD_CHANNEL">{{ midiName(entry.data1) }}</template>
              <template v-else>{{ entry.data1 }}</template>
            </span>
            <span class="event__kind flex items-center gap-2">
              {{ t(`midiTest.kind.${entry.kind}`) }}
              <UBadge v-if="isNote(entry) && entry.channel === PAD_CHANNEL" :label="t('midiTest.pad')" color="warning" variant="solid" size="md" />
            </span>
            <span class="event__meta text-muted tabular-nums">
              {{ t(entry.kind === 'cc' ? 'midiTest.detailsCc' : 'midiTest.details', { channel: entry.channel, value: entry.data2 }) }}
            </span>
            <span class="event__bytes text-dimmed tabular-nums">{{ entry.bytes }}</span>
          </li>
        </ol>
      </UCard>
      </template>
      </div>
    </div>
  </main>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(0, 20rem) minmax(0, 1fr);
  gap: clamp(1.5rem, 4vw, 3.5rem);
  margin-top: 2rem;
  align-items: start;
}

.subtitle {
  font-family: var(--font-display);
  font-size: 1.125rem;
  font-weight: 600;
}

.log {
  max-height: 40dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.event {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr) auto;
  grid-template-areas:
    "main kind meta"
    "main bytes bytes";
  column-gap: 1rem;
  align-items: baseline;
  padding: 0.625rem 1.5rem;
  border-bottom: 1px solid var(--ui-border-muted);
  /* New row flashes once, then settles: shows where the event landed */
  transition: background-color 700ms ease;
}

@starting-style {
  .event {
    background-color: color-mix(in oklab, var(--color-pad-sky) 18%, transparent);
  }
}

.event--off {
  opacity: 0.55;
}

.event__main {
  grid-area: main;
  font-family: var(--font-display);
  font-size: 1.375rem;
  font-weight: 700;
}

.event__kind {
  grid-area: kind;
}

.event__meta {
  grid-area: meta;
}

.event__bytes {
  grid-area: bytes;
  font-size: 0.8125rem;
}

@media (max-width: 760px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
.views {
  display: flex;
  gap: 0.375rem;
}

.view {
  min-height: 2.5rem;
  padding: 0 0.875rem;
  border-radius: 0.625rem;
  font-weight: 600;
  color: var(--ui-text-toned);
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
}

.view--on {
  color: #fff;
  background: var(--color-pad-sky);
  box-shadow: none;
}
</style>
