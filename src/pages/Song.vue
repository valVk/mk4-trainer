<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import PageHeader from '@/components/PageHeader.vue'
import SongClock from '@/components/SongClock.vue'
import SoundControl from '@/components/SoundControl.vue'
import { useProgress } from '@/composables/useProgress'
import { useSongPlayer } from '@/composables/useSongPlayer'
import { useSynth } from '@/composables/useSynth'
import type { SongProgress } from '@/db/schema'
import { findName, groupOf } from '@/lib/instruments'
import { buildUnits } from '@/lib/ladder'
import { MIX_MAX, MIX_MIN, MIX_STEP, gainOf, parseMix, withGain, type SongMix } from '@/lib/mix'
import { nextSectionStart, partPhrases, partRole, previousSectionStart, songSections, suggestOrder, type PartRole, type Section } from '@/lib/phrases'
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
const sections = shallowRef<Section[]>([])
/** Ladder progress of this player: channel -> unit id -> progress. */
const partProgress = shallowRef<Record<number, Record<string, SongProgress>>>({})
/** Channels switched off on the map. */
const muted = reactive(new Set<number>())
/** Volume per part, saved with the song. */
const mix = shallowRef<SongMix>({})

async function open() {
  const id = Number(route.params.id)
  await progress.init()
  const found = Number.isInteger(id) ? await progress.loadSong(id) : undefined
  if (!found) {
    notFound.value = true
    return
  }
  record.value = found
  mix.value = parseMix(found.mix)
  player.setMix(mix.value)
  song.value = parseSong(found.data, found.fileName)
  sections.value = songSections(song.value)
  partProgress.value = await progress.loadSongProgress(id)
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

/** Moving a level is heard at once; it is saved when the finger lets go. */
function setLevel(channel: number, percent: number | undefined) {
  if (percent === undefined) return
  mix.value = withGain(mix.value, channel, percent / 100)
  player.setMix(mix.value)
}

function saveMix() {
  void progress.saveSongMix(Number(route.params.id), { ...mix.value })
}

function resetLevel(channel: number) {
  setLevel(channel, 100)
  saveMix()
}

const percentOf = (channel: number) => Math.round(gainOf(mix.value, channel) * 100)

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
  role: PartRole
  /** Place in the suggested learning order (1-based), 0 for drums. */
  order: number
  unitsDone: number
  unitsTotal: number
  stars: number
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

const order = computed(() => (song.value ? suggestOrder(song.value.parts) : []))

const rows = computed<Row[]>(() => {
  const current = song.value
  if (!current) return []
  return current.parts.map((part) => {
    const units = part.isDrum ? [] : buildUnits(partPhrases(part, current.bars), sections.value)
    const saved = partProgress.value[part.channel] ?? {}
    return {
      part,
      label: part.isDrum
        ? t('songs.drums')
        : findName({ bank: 0, program: part.program }, synth.presets.value) ?? t(`sound.groups.${groupOf(part.program)}`),
      runs: runsOf(barActivity(part, current.bars)),
      role: partRole(part),
      order: order.value.findIndex((item) => item.channel === part.channel) + 1,
      unitsDone: units.filter((unit) => (saved[unit.id]?.passed ?? 0) >= unit.rungs.length).length,
      unitsTotal: units.length,
      stars: saved.all?.stars ?? 0,
    }
  })
})

/** The suggested next part: the first in the learning order that is not finished yet. */
const nextChannel = computed(() => order.value.find((item) => {
  const row = rows.value.find((r) => r.part.channel === item.channel)
  return row && row.unitsDone < row.unitsTotal
})?.channel ?? null)

const sectionBlocks = computed(() => sections.value.map((section) => ({
  ...section,
  left: (section.startBar / barCount.value) * 100,
  width: ((section.endBar - section.startBar) / barCount.value) * 100,
})))

/** Works before the sound is on too: playback then starts from there. */
function seekTo(seconds: number) {
  player.seek(seconds)
}

/** Rewind and fast forward by a few seconds. */
const SKIP_S = 10

function skip(seconds: number) {
  const duration = song.value?.duration ?? 0
  seekTo(Math.min(duration, Math.max(0, player.time.value + seconds)))
}

function previousSection() {
  seekTo(previousSectionStart(sections.value, player.time.value))
}

function nextSection() {
  const start = nextSectionStart(sections.value, player.time.value)
  if (start !== null) seekTo(start)
}

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
// The playhead moves every frame: set it as a CSS variable on the page instead of re-rendering every row.
const page = ref<HTMLElement | null>(null)
watch(() => player.time.value, (time) => {
  const duration = song.value?.duration
  page.value?.style.setProperty('--playhead', `${duration ? (time / duration) * 100 : 0}%`)
})

function seekFromEvent(event: MouseEvent) {
  const current = song.value
  if (!current) return
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  seekTo(((event.clientX - box.left) / box.width) * current.duration)
}

/** The first tap also turns the sound on, then plays once the song is loaded. */
async function togglePlay() {
  if (player.playing.value) player.pause()
  else if (await player.ensureLoaded()) player.play()
}
</script>

<template>
  <main ref="page" class="page">
    <PageHeader :title="record?.name ?? t('songs.title')" back="/songs" :back-label="t('songs.title')">
      <SoundControl />
    </PageHeader>

    <UAlert v-if="notFound" class="mt-6" color="warning" variant="subtle" icon="i-lucide-circle-help" :title="t('songs.notFound')" />

    <template v-if="song">
      <p class="meta text-muted">
        {{ t('songs.details', { bpm: Math.round(song.bpm), meter: `${song.timeSignature.numerator}/${song.timeSignature.denominator}`, length: formatTime(song.duration), parts: song.parts.length }) }}
      </p>

      <div class="transport">
        <div class="seek" role="group" :aria-label="t('songs.seekGroup')">
          <UButton icon="i-lucide-skip-back" color="neutral" variant="soft" size="lg" :aria-label="t('songs.previousSection')" @click="previousSection" />
          <UButton icon="i-lucide-rewind" color="neutral" variant="soft" size="lg" :aria-label="t('songs.rewind', { n: SKIP_S })" @click="skip(-SKIP_S)" />
          <UButton icon="i-lucide-fast-forward" color="neutral" variant="soft" size="lg" :aria-label="t('songs.forward', { n: SKIP_S })" @click="skip(SKIP_S)" />
          <UButton icon="i-lucide-skip-forward" color="neutral" variant="soft" size="lg" :aria-label="t('songs.nextSection')" @click="nextSection" />
        </div>
        <!-- The main action last, after the seek buttons (owner's rule). -->
        <UButton
          :icon="player.playing.value ? 'i-lucide-pause' : 'i-lucide-play'"
          size="xl"
          :loading="synth.status.value === 'loading'"
          :label="player.playing.value ? t('songs.pause') : t('songs.play')"
          @click="togglePlay"
        />
        <SongClock class="time text-highlighted" :duration="song.duration" />
        <div class="ml-auto flex gap-2">
          <UButton color="neutral" variant="soft" size="lg" icon="i-lucide-volume-2" :label="t('songs.allOn')" @click="setAll(true)" />
          <UButton color="neutral" variant="ghost" size="lg" icon="i-lucide-volume-x" :label="t('songs.allOff')" @click="setAll(false)" />
        </div>
      </div>

      <p class="hint text-muted">{{ t('songs.layersHint') }}</p>

      <div class="sections-row">
        <span class="sections-row__label text-muted">{{ t('songs.sections') }}</span>
        <div class="sections" :aria-label="t('songs.sections')">
          <button
            v-for="block in sectionBlocks"
            :key="block.index"
            type="button"
            class="section"
            :style="{ left: `${block.left}%`, width: `${block.width}%` }"
            :aria-label="t('songs.sectionLabel', { n: block.index + 1, time: formatTime(block.start) })"
            @click="seekTo(block.start)"
          >
            {{ block.index + 1 }}
          </button>
          <span class="playhead" aria-hidden="true" />
        </div>
      </div>

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
              <span class="row__name text-highlighted">
                {{ row.label }}
                <UBadge v-if="row.part.channel === nextChannel" :label="t('songs.nextPart')" color="success" variant="solid" size="sm" class="ml-1" />
              </span>
              <span class="row__role">
                <template v-if="row.order">{{ row.order }}. </template>{{ t(`songs.role.${row.role}`) }}<template v-if="row.unitsTotal">, {{ t('songs.unitsDone', { done: row.unitsDone, total: row.unitsTotal }) }}</template>
                <span v-if="row.stars" class="row__stars" :aria-label="t('train.stars', { n: row.stars })">{{ '★'.repeat(row.stars) }}</span>
              </span>
              <span class="row__meta text-muted">
                {{ t('songs.channel', { n: row.part.channel + 1 }) }}<template v-if="!row.part.isDrum">, {{ midiName(row.part.range.low) }}–{{ midiName(row.part.range.high) }}, {{ t('songs.polyphony', { n: row.part.maxPolyphony }, row.part.maxPolyphony) }}</template>
              </span>
            </span>
          </button>
          <div class="row__level">
            <USlider
              :model-value="percentOf(row.part.channel)"
              :min="MIX_MIN * 100"
              :max="MIX_MAX * 100"
              :step="MIX_STEP * 100"
              size="md"
              :aria-label="t('songs.levelLabel', { name: row.label })"
              @update:model-value="setLevel(row.part.channel, $event)"
              @change="saveMix"
            />
            <!-- The number shows the level; a tap puts the part back to the file's own level. -->
            <button
              type="button"
              class="row__percent tabular-nums"
              :class="{ 'row__percent--changed': percentOf(row.part.channel) !== 100 }"
              :aria-label="t('songs.levelReset', { name: row.label })"
              @click="resetLevel(row.part.channel)"
            >
              {{ percentOf(row.part.channel) }}%
            </button>
          </div>
          <UButton
            :to="`/songs/${route.params.id}/${row.part.channel}`"
            icon="i-lucide-graduation-cap"
            color="neutral"
            variant="soft"
            size="lg"
            class="row__practice"
            :label="t('songs.practice')"
            :aria-label="t('songs.practiceLabel', { name: row.label })"
          />
          <button type="button" class="row__lane" :aria-label="t('songs.seekLabel', { name: row.label })" @click="seekFromEvent">
            <!-- Blocks in percent with CSS corners: a stretched SVG would stretch the corners into ellipses. -->
            <span class="lane" aria-hidden="true">
              <span
                v-for="run in row.runs"
                :key="run.start"
                class="lane__block"
                :class="{ 'lane__block--drum': row.part.isDrum }"
                :style="{ left: `${(run.start / barCount) * 100}%`, width: `${(run.length / barCount) * 100}%` }"
              />
            </span>
            <span class="playhead" aria-hidden="true" />
          </button>
        </li>
      </ol>
    </template>
  </main>
</template>

<style scoped>
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

.seek {
  display: flex;
  gap: 0.375rem;
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
  /* Same columns as .sections-row, so the section band lines up with the lanes */
  grid-template-columns: minmax(0, 15rem) 9rem 8rem minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
}

.row__level {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.row__percent {
  flex: none;
  width: 2.75rem;
  min-height: 2.75rem;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  color: var(--ui-text-muted);
}

.row__percent--changed {
  font-weight: 600;
  color: var(--color-pad-sky);
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
  width: 100%;
}

.row__role {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ui-text-toned);
}

.row__stars {
  margin-left: 0.25rem;
  color: var(--color-pad-sun);
}

.sections-row {
  display: grid;
  grid-template-columns: minmax(0, 15rem) 9rem 8rem minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
  margin-top: 1rem;
}

.sections-row__label {
  grid-column: 1 / 4;
  font-size: 0.875rem;
}

.sections {
  position: relative;
  height: 2rem;
}

.section {
  position: absolute;
  top: 0;
  bottom: 0;
  padding: 0;
  border-right: 2px solid var(--ui-bg);
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ui-text-toned);
  background: var(--ui-bg-accented);
  overflow: hidden;
}

.row__lane {
  position: relative;
  display: block;
  width: 100%;
  height: 2.25rem;
  border-radius: 0.5rem;
  background: var(--ui-bg-muted);
  cursor: pointer;
  overflow: hidden;
}

.lane {
  position: absolute;
  inset: 15% 0;
  display: block;
}

.lane__block {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 0.3125rem;
  background: var(--color-pad-sky);
  transition: background-color 150ms ease;
}

.lane__block--drum {
  background: var(--color-pad-sun);
}

.row--off .lane__block {
  background: var(--rubber-edge);
}

.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--playhead, 0%);
  width: 2px;
  margin-left: -1px;
  background: var(--color-pad-tomato);
  pointer-events: none;
}

@media (max-width: 720px) {
  .row,
  .sections-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.25rem;
  }

  .sections-row__label {
    grid-column: auto;
  }
}
</style>
