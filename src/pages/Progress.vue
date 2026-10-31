<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables'

import PageHeader from '@/components/PageHeader.vue'
import SkillPicker from '@/components/SkillPicker.vue'
import StarRating from '@/components/StarRating.vue'
import { useNoteNames } from '@/composables/useNoteNames'
import { useProgress } from '@/composables/useProgress'
import { BANKS, useSynth, type BankId } from '@/composables/useSynth'
import { BackupParseError, parseBackup } from '@/db/backup'
import type { TaskStats } from '@/db/progress'
import { LEVELS, STAR_THRESHOLDS } from '@/lib/levels'
import { weakKinds } from '@/lib/rhythmLevels'
import { noteName } from '@/lib/theory'

const { t } = useI18n()
const toast = useToast()
const { localName, withLocal } = useNoteNames()
const progress = useProgress()
const { profile, profiles, levels, available, persisted } = progress

// --- Sound bank -----------------------------------------------------------

const synth = useSynth()
const bankItems = computed(() => BANKS.map((item) => ({
  value: item.id,
  label: t(`sound.banks.${item.id}.name`),
  description: t(`sound.banks.${item.id}.description`),
})))
const selectedBank = computed({
  get: () => synth.bank.value,
  set: (id: BankId) => synth.setBank(id),
})

// --- Profiles -------------------------------------------------------------

const profileItems = computed(() => profiles.value.map((item) => ({ label: item.name, value: item.id })))
const selectedProfile = computed({
  get: () => profile.value?.id,
  set: (id) => {
    if (id !== undefined) void progress.switchProfile(id)
  },
})

const newName = ref('')
const renaming = ref(false)
const renameValue = ref('')

async function addProfile() {
  const name = newName.value.trim()
  if (!name) return
  await progress.addProfile(name)
  newName.value = ''
  toast.add({ title: t('progress.profileAdded', { name }), icon: 'i-lucide-user-plus' })
}

function startRename() {
  renameValue.value = profile.value?.name ?? ''
  renaming.value = true
}

async function saveRename() {
  const name = renameValue.value.trim()
  if (name) await progress.renameProfile(name)
  renaming.value = false
}

// --- Weak spots -----------------------------------------------------------

const weak = ref<TaskStats[]>([])
/** Rhythm kinds of «Теория» missed most. */
const weakRhythm = computed(() => weakKinds(progress.rhythmWeak.value))
async function loadWeak() {
  weak.value = await progress.weakTasks(5)
}
onMounted(loadWeak)
watch(profile, loadWeak)

/** Task ids from the attempt log ("C#:min:inv1", "G:pop") in words. */
function describeTask(id: string): string {
  const [rootText, kind, inversion] = id.split(':')
  const pc = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(rootText ?? '')
  const root = pc === -1 ? (rootText ?? '') : withLocal(noteName(pc), localName(pc))
  if (kind === 'note') return t('progress.taskNote', { note: root })
  if (kind && kind in { pop: 1, rock: 1, jazz: 1, popMinor: 1 }) {
    return t('progress.taskProgression', { genre: t(`train.genre.${kind}`), key: root })
  }
  const chord = t(`lab.type.${kind}`, { root })
  return inversion ? `${chord}, ${t(`train.inversion.${inversion.replace('inv', '')}`)}` : chord
}

// --- Backup ---------------------------------------------------------------

const fileInput = ref<HTMLInputElement | null>(null)
const pendingImport = ref<{ name: string, text: string } | null>(null)
const importError = ref('')

async function exportFile() {
  const backup = await progress.exportData()
  if (!backup) return
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `chord-trainer-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
  toast.add({ title: t('progress.exported'), icon: 'i-lucide-download' })
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  importError.value = ''
  pendingImport.value = null
  if (!file) return
  const text = await file.text()
  // Check the file before asking: a wrong file never reaches "replace everything?".
  try {
    parseBackup(text)
    pendingImport.value = { name: file.name, text }
  } catch (error) {
    importError.value = t(`progress.importError.${error instanceof BackupParseError ? error.code : 'failed'}`)
  }
}

async function confirmImport() {
  const pending = pendingImport.value
  if (!pending) return
  try {
    await progress.importData(pending.text)
    pendingImport.value = null
    await loadWeak()
    toast.add({ title: t('progress.imported'), icon: 'i-lucide-circle-check', color: 'success' })
  } catch (error) {
    pendingImport.value = null
    importError.value = t(`progress.importError.${error instanceof BackupParseError ? error.code : 'failed'}`)
  }
}
</script>

<template>
  <main class="page">
    <PageHeader :title="t('progress.title')">
      <ULink to="/licenses" class="text-dimmed text-sm underline underline-offset-2">{{ t('home.licenses') }}</ULink>
    </PageHeader>

    <UAlert
      v-if="!available"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      class="mt-6"
      :title="t('progress.notSaved')"
      :description="t('progress.notSavedHint')"
    />

    <div class="layout">
      <section class="cards flex flex-col gap-6">
        <UCard variant="subtle">
          <template #header>
            <h2 class="subtitle text-highlighted">{{ t('progress.player') }}</h2>
          </template>
          <div class="flex flex-col gap-4">
            <div v-if="!renaming" class="flex flex-wrap items-center gap-3">
              <USelect v-model="selectedProfile" :items="profileItems" size="xl" class="min-w-48" icon="i-lucide-user" :aria-label="t('progress.player')" />
              <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="lg" :label="t('progress.rename')" @click="startRename" />
            </div>
            <form v-else class="flex flex-wrap items-center gap-3" @submit.prevent="saveRename">
              <UInput v-model="renameValue" size="xl" autofocus :aria-label="t('progress.rename')" />
              <UButton color="neutral" variant="ghost" size="lg" :label="t('pads.cancel')" @click="renaming = false" />
              <UButton type="submit" size="lg" :label="t('progress.save')" />
            </form>
            <form class="flex flex-wrap items-center gap-3" @submit.prevent="addProfile">
              <UInput v-model="newName" size="lg" :placeholder="t('progress.newPlayer')" :aria-label="t('progress.newPlayer')" />
              <UButton type="submit" icon="i-lucide-user-plus" color="neutral" variant="soft" size="lg" :disabled="!newName.trim()" :label="t('progress.add')" />
            </form>
            <!-- How strictly this player's playing is judged; the same choice is in the drawer of every playing screen. -->
            <SkillPicker in-place />
          </div>
        </UCard>

        <UCard variant="subtle">
          <template #header>
            <h2 class="subtitle text-highlighted">{{ t('sound.bankTitle') }}</h2>
          </template>
          <div class="flex flex-col gap-4">
            <URadioGroup v-model="selectedBank" :items="bankItems" variant="card" size="lg" :aria-label="t('sound.bankTitle')" />
            <p class="text-muted text-sm leading-relaxed">
              {{ t('sound.bankHint') }}
              <ULink to="/licenses" class="underline underline-offset-2">{{ t('home.licenses') }}</ULink>
            </p>
          </div>
        </UCard>

        <UCard variant="subtle">
          <template #header>
            <h2 class="subtitle text-highlighted">{{ t('progress.weak') }}</h2>
          </template>
          <p v-if="weak.length === 0 && weakRhythm.length === 0" class="text-muted">{{ t('progress.weakEmpty') }}</p>
          <ul v-else class="flex flex-col gap-3">
            <li v-for="item in weak" :key="item.task" class="flex flex-wrap items-baseline justify-between gap-x-4">
              <span class="font-medium text-highlighted">{{ describeTask(item.task) }}</span>
              <span class="text-muted text-sm tabular-nums">
                {{ t('progress.weakStats', { misses: item.misses, tries: item.tries, seconds: (item.avgMs / 1000).toFixed(1) }) }}
              </span>
            </li>
          </ul>
          <!-- «Теория» → «Ритм»: the kinds of notes missed most, on one short line each. -->
          <ul v-if="weakRhythm.length" class="flex flex-col gap-2" :class="{ 'mt-4': weak.length }">
            <li v-for="item in weakRhythm" :key="item.kind" class="flex flex-wrap items-baseline justify-between gap-x-4">
              <span class="font-medium text-highlighted">{{ t('progress.weakRhythm') }}: {{ t(`progress.rhythmKinds.${item.kind}`) }}</span>
              <span class="text-muted text-sm tabular-nums">{{ t('progress.weakRhythmStats', { misses: item.misses, tries: item.tries }) }}</span>
            </li>
          </ul>
        </UCard>

        <UCard variant="subtle">
          <template #header>
            <h2 class="subtitle text-highlighted">{{ t('progress.backup') }}</h2>
          </template>
          <div class="flex flex-col gap-4">
            <p class="text-muted leading-relaxed">{{ t('progress.backupHint') }}</p>
            <div class="flex flex-wrap gap-3">
              <UButton icon="i-lucide-upload" color="neutral" variant="soft" size="lg" :disabled="!available" :label="t('progress.import')" @click="fileInput?.click()" />
              <UButton icon="i-lucide-download" size="lg" :disabled="!available" :label="t('progress.export')" @click="exportFile" />
              <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onFile">
            </div>
            <UAlert
              v-if="pendingImport"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              :title="t('progress.importConfirm', { file: pendingImport.name })"
              :description="t('progress.importConfirmHint')"
              :actions="[
                { label: t('progress.importYes'), color: 'warning', size: 'lg', onClick: confirmImport },
                { label: t('pads.cancel'), color: 'neutral', variant: 'soft', size: 'lg', onClick: () => { pendingImport = null } },
              ]"
            />
            <p v-if="importError" class="text-error">{{ importError }}</p>
            <p class="text-muted text-sm flex items-center gap-2">
              <UIcon :name="persisted ? 'i-lucide-shield-check' : 'i-lucide-shield-alert'" class="size-4 shrink-0" />
              {{ persisted ? t('progress.persisted') : t('progress.notPersisted') }}
            </p>
          </div>
        </UCard>
      </section>

      <section>
        <h2 class="subtitle text-highlighted mb-4">{{ t('progress.levels') }}</h2>
        <ol class="levels">
          <li v-for="item in LEVELS" :key="item.id" class="level">
            <div class="min-w-0">
              <p class="level__name text-highlighted">{{ t('train.level', { n: item.id }) }}</p>
              <p class="text-muted text-sm">{{ t(`progress.levelInfo.${item.id}`) }}</p>
            </div>
            <StarRating :value="levels[item.id]?.stars ?? 0" :of="STAR_THRESHOLDS.length" size="lg" />
            <p class="level__stats text-muted tabular-nums">
              <span class="stats-long">{{ t('progress.levelStats', { correct: levels[item.id]?.correct ?? 0, streak: levels[item.id]?.bestStreak ?? 0 }) }}</span>
              <span class="stats-short">{{ t('progress.levelStatsShort', { correct: levels[item.id]?.correct ?? 0, streak: levels[item.id]?.bestStreak ?? 0 }) }}</span>
            </p>
          </li>
        </ol>
      </section>
    </div>
  </main>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: clamp(1.5rem, 4vw, 3rem);
  margin-top: 2rem;
  align-items: start;
}

.subtitle {
  font-family: var(--font-display);
  font-size: 1.125rem;
  font-weight: 600;
}

.levels {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.level {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.25rem 1rem;
  align-items: center;
  padding: 0.875rem 1.125rem;
  border-radius: 1rem;
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
}

.level__name {
  font-family: var(--font-display);
  font-weight: 600;
}

.level__stats {
  grid-column: 1 / -1;
  font-size: 0.875rem;
}

.stats-short {
  display: none;
}

/* Tablet landscape (Galaxy Tab S10+ is 1400 x ~800 CSS px): cards in two balanced columns, levels as a 2 x 4 grid, no scroll. */
@media (min-width: 1100px) and (orientation: landscape) {
  .layout {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1.2fr);
    margin-top: 1rem;
  }

  .cards {
    display: block;
    columns: 2;
    column-gap: 1.5rem;
  }

  .cards > * {
    break-inside: avoid;
    margin-bottom: 1.25rem;
  }

  .cards :deep([data-slot="header"]),
  .cards :deep([data-slot="body"]) {
    padding: 0.875rem 1.25rem;
  }

  .levels {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.625rem;
  }

  .level {
    align-content: start;
    padding: 0.75rem 0.875rem;
  }

  .level :deep(svg) {
    width: 1.125rem;
    height: 1.125rem;
  }

  .stats-long {
    display: none;
  }

  .stats-short {
    display: inline;
  }
}

@media (max-width: 860px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
