<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import SoundControl from '@/components/SoundControl.vue'
import { useProgress } from '@/composables/useProgress'
import { useSongPlayer } from '@/composables/useSongPlayer'
import { useSynth } from '@/composables/useSynth'
import { findName, groupOf } from '@/lib/instruments'
import { barActivity, parseSong, type Part, type Song } from '@/lib/song'
import { midiName } from '@/lib/theory'

// The song map: every part as a row across the bars, like an arranger. Parts can be switched
// on and off to hear how the song is built, layer by layer.
const { t } = useI18n()
const route = useRoute()
const progress = useProgress()
const synth = useSynth()
const player = useSongPlayer()

const record = shallowRef<{ name: string, data: ArrayBuffer, fileName: string } | null>(null)
const song = shallowRef<Song | null>(null)
const notFound = shallowRef(false)
/** Channels switched off on the map. */
const muted = reactive(new Set<number>())

async function open() {
  const id = Number(route.params.id)
  await progress.init()
  const found = Number.isInteger(id) ? await progress.loadSong(id) : undefined
  if (!found) {
    notFound.value = true
    return
  }
  record.value = found
  song.value = parseSong(found.data, found.fileName)
}
void open()

// The player needs sound: load the song once both are ready, keep the switches applied.
watch([() => synth.status.value, song], async ([status, current]) => {
  if (status !== 'ready' || !current || !record.value || player.loaded.value) return
  await player.load(record.value.data, record.value.fileName)
  muted.forEach((channel) => player.setChannelMuted(channel, true))
}, { immediate: true })

onBeforeUnmount(() => player.unload())

function toggle(channel: number) {
  if (muted.has(channel)) muted.delete(channel)
  else muted.add(channel)
  if (player.loaded.value) player.setChannelMuted(channel, muted.has(channel))
}

function setAll(audible: boolean) {
  for (const part of song.value?.parts ?? []) {
    if (audible) muted.delete(part.channel)
    else muted.add(part.channel)
    if (player.loaded.value) player.setChannelMuted(part.channel, !audible)
  }
}

interface Row {
  part: Part
  label: string
  runs: { start: number, length: number }[]
}

/** Consecutive active bars as runs: a few rectangles per row instead of one per bar. */
function runsOf(active: boolean[]) {
  const runs: { start: number, length: number }[] = []
  active.forEach((on, bar) => {
    if (!on) return
    const last = runs[runs.length - 1]
    if (last && last.start + last.length === bar) last.length++
    else runs.push({ start: bar, length: 1 })
  })
  return runs
}

const barCount = computed(() => Math.max(1, (song.value?.bars.length ?? 1) - 1))

const rows = computed<Row[]>(() => {
  const current = song.value
  if (!current) return []
  return current.parts.map((part) => ({
    part,
    label: part.isDrum
      ? t('songs.drums')
      : findName({ bank: 0, program: part.program }, synth.presets.value) ?? t(`sound.groups.${groupOf(part.program)}`),
    runs: runsOf(barActivity(part, current.bars)),
  }))
})

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
const playheadPercent = computed(() => (song.value ? (player.time.value / song.value.duration) * 100 : 0))

function seekFromEvent(event: MouseEvent) {
  const current = song.value
  if (!current || !player.loaded.value) return
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  player.seek(((event.clientX - box.left) / box.width) * current.duration)
}

function togglePlay() {
  if (player.playing.value) player.pause()
  else player.play()
}
</script>

<template>
  <main class="page">
    <header class="flex flex-wrap items-center gap-3 -ml-3">
      <UButton to="/songs" icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="xl" :aria-label="t('songs.title')" />
      <h1 class="title text-highlighted">{{ record?.name ?? t('songs.title') }}</h1>
      <div class="ml-auto">
        <SoundControl />
      </div>
    </header>

    <UAlert v-if="notFound" class="mt-6" color="warning" variant="subtle" icon="i-lucide-circle-help" :title="t('songs.notFound')" />

    <template v-if="song">
      <p class="meta text-muted">
        {{ t('songs.details', { bpm: Math.round(song.bpm), meter: `${song.timeSignature.numerator}/${song.timeSignature.denominator}`, length: formatTime(song.duration), parts: song.parts.length }) }}
      </p>

      <div class="transport">
        <UButton
          :icon="player.playing.value ? 'i-lucide-pause' : 'i-lucide-play'"
          size="xl"
          :disabled="!player.loaded.value"
          :label="player.playing.value ? t('songs.pause') : t('songs.play')"
          @click="togglePlay"
        />
        <span class="time text-highlighted tabular-nums">{{ formatTime(player.time.value) }} / {{ formatTime(song.duration) }}</span>
        <span v-if="!player.loaded.value" class="text-muted text-sm">{{ t('songs.needSound') }}</span>
        <div class="ml-auto flex gap-2">
          <UButton color="neutral" variant="soft" size="lg" icon="i-lucide-volume-2" :label="t('songs.allOn')" @click="setAll(true)" />
          <UButton color="neutral" variant="ghost" size="lg" icon="i-lucide-volume-x" :label="t('songs.allOff')" @click="setAll(false)" />
        </div>
      </div>

      <p class="hint text-muted">{{ t('songs.layersHint') }}</p>

      <ol class="map" :aria-label="t('songs.mapLabel')">
        <li v-for="row in rows" :key="row.part.channel" class="row" :class="{ 'row--off': muted.has(row.part.channel) }">
          <button
            type="button"
            class="row__toggle"
            :aria-pressed="!muted.has(row.part.channel)"
            :aria-label="t(muted.has(row.part.channel) ? 'songs.turnOn' : 'songs.turnOff', { name: row.label })"
            @click="toggle(row.part.channel)"
          >
            <UIcon :name="muted.has(row.part.channel) ? 'i-lucide-volume-x' : 'i-lucide-volume-2'" class="size-5 shrink-0" />
            <span class="row__info">
              <span class="row__name text-highlighted">{{ row.label }}</span>
              <span class="row__meta text-muted">
                {{ t('songs.channel', { n: row.part.channel + 1 }) }}<template v-if="!row.part.isDrum">, {{ midiName(row.part.range.low) }}–{{ midiName(row.part.range.high) }}, {{ t('songs.polyphony', { n: row.part.maxPolyphony }, row.part.maxPolyphony) }}</template>
              </span>
            </span>
          </button>
          <UButton
            v-if="!row.part.isDrum"
            :to="`/songs/${route.params.id}/${row.part.channel}`"
            icon="i-lucide-graduation-cap"
            color="neutral"
            variant="soft"
            size="lg"
            class="row__practice"
            :label="t('songs.practice')"
            :aria-label="t('songs.practiceLabel', { name: row.label })"
          />
          <span v-else class="row__practice" />
          <div class="row__lane" @click="seekFromEvent">
            <svg :viewBox="`0 0 ${barCount} 1`" preserveAspectRatio="none" class="lane" aria-hidden="true">
              <rect v-for="run in row.runs" :key="run.start" :x="run.start" y="0.15" :width="run.length" height="0.7" rx="0.3" class="lane__block" :class="{ 'lane__block--drum': row.part.isDrum }" />
            </svg>
            <span class="playhead" :style="{ left: `${playheadPercent}%` }" aria-hidden="true" />
          </div>
        </li>
      </ol>
    </template>
  </main>
</template>

<style scoped>
.page {
  max-width: 80rem;
  margin: 0 auto;
  padding: clamp(1rem, 3vw, 2.5rem);
}

.title {
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 3vw, 2.25rem);
  font-weight: 700;
  min-width: 0;
  overflow-wrap: anywhere;
}

.meta {
  margin-top: 0.5rem;
  font-size: 1.0625rem;
}

.transport {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  margin-top: 1.5rem;
}

.time {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
}

.hint {
  margin-top: 1rem;
  max-width: 70ch;
}

.map {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 1rem;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 15rem) auto minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
}

.row__toggle {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 3rem;
  padding: 0.375rem 0.75rem;
  border-radius: 0.75rem;
  text-align: left;
  color: var(--ui-text);
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
  transition: opacity 150ms ease, background-color 150ms ease;
}

.row__toggle:active {
  transform: scale(0.98);
}

.row__info {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.row__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__meta {
  font-size: 0.8125rem;
}

.row--off .row__toggle {
  opacity: 0.55;
}

.row__practice {
  min-width: 7.5rem;
}

.row__lane {
  position: relative;
  height: 2.25rem;
  border-radius: 0.5rem;
  background: var(--ui-bg-muted);
  cursor: pointer;
  overflow: hidden;
}

.lane {
  width: 100%;
  height: 100%;
  display: block;
}

.lane__block {
  fill: var(--color-pad-sky);
  transition: fill 150ms ease;
}

.lane__block--drum {
  fill: var(--color-pad-sun);
}

.row--off .lane__block {
  fill: var(--rubber-edge);
}

.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--color-pad-tomato);
  pointer-events: none;
}

@media (max-width: 720px) {
  .row {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.25rem;
  }
}
</style>
