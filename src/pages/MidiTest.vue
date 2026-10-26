<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import HeldNotesPanel from '@/components/HeldNotesPanel.vue'
import StatusLed from '@/components/StatusLed.vue'
import { useNoteSource } from '@/composables/useNoteSource'
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
const { connectMidi } = useNoteSource()

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
  // Skip clock and active sensing, they flood the log.
  if (status === 0xf8 || status === 0xfe) return
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
    access.value = await navigator.requestMIDIAccess({ sysex: false })
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
    <header class="flex flex-wrap items-center gap-3 -ml-3">
      <UButton to="/" icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="xl" :aria-label="t('nav.home')" />
      <h1 class="title text-highlighted">{{ t('midiTest.title') }}</h1>
      <UButton to="/pads" icon="i-lucide-grid-2x2" color="neutral" variant="soft" size="lg" class="ml-auto" :label="t('midiTest.pads')" />
    </header>

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
      </div>
    </div>
  </main>
</template>

<style scoped>
.page {
  max-width: 72rem;
  margin: 0 auto;
  padding: clamp(1rem, 3vw, 2.5rem);
}

.title {
  font-family: var(--font-display);
  font-size: clamp(1.75rem, 3vw, 2.25rem);
  font-weight: 700;
}

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
</style>
