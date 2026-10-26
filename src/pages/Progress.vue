<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables'

import { useNoteNames } from '@/composables/useNoteNames'
import { useProgress } from '@/composables/useProgress'
import { BANKS, useSynth, type BankId } from '@/composables/useSynth'
import { BackupParseError, parseBackup } from '@/db/backup'
import type { TaskStats } from '@/db/progress'
import { LEVELS, STAR_THRESHOLDS } from '@/lib/levels'
import { noteName } from '@/lib/theory'

const { t } = useI18n()
const toast = useToast()
const { localName, withLocal } = useNoteNames()
const progress = useProgress()
const version = __APP_VERSION__
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
    <header class="flex items-center gap-3 -ml-3">
      <UButton to="/" icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="xl" :aria-label="t('nav.home')" />
      <h1 class="title text-highlighted">{{ t('progress.title') }}</h1>
    </header>

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
      <section class="flex flex-col gap-6">
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
              <UButton type="submit" size="lg" :label="t('progress.save')" />
              <UButton color="neutral" variant="ghost" size="lg" :label="t('pads.cancel')" @click="renaming = false" />
            </form>
            <form class="flex flex-wrap items-center gap-3" @submit.prevent="addProfile">
              <UInput v-model="newName" size="lg" :placeholder="t('progress.newPlayer')" :aria-label="t('progress.newPlayer')" />
              <UButton type="submit" icon="i-lucide-user-plus" color="neutral" variant="soft" size="lg" :disabled="!newName.trim()" :label="t('progress.add')" />
            </form>
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
          <p v-if="weak.length === 0" class="text-muted">{{ t('progress.weakEmpty') }}</p>
          <ul v-else class="flex flex-col gap-3">
            <li v-for="item in weak" :key="item.task" class="flex flex-wrap items-baseline justify-between gap-x-4">
              <span class="font-medium text-highlighted">{{ describeTask(item.task) }}</span>
              <span class="text-muted text-sm tabular-nums">
                {{ t('progress.weakStats', { misses: item.misses, tries: item.tries, seconds: (item.avgMs / 1000).toFixed(1) }) }}
              </span>
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
              <UButton icon="i-lucide-download" size="lg" :disabled="!available" :label="t('progress.export')" @click="exportFile" />
              <UButton icon="i-lucide-upload" color="neutral" variant="soft" size="lg" :disabled="!available" :label="t('progress.import')" @click="fileInput?.click()" />
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
            <div class="flex items-center gap-1 shrink-0" :aria-label="t('train.stars', { n: levels[item.id]?.stars ?? 0 })">
              <UIcon
                v-for="i in STAR_THRESHOLDS.length"
                :key="i"
                name="i-lucide-star"
                class="size-6 star"
                :class="{ 'star--on': i <= (levels[item.id]?.stars ?? 0) }"
              />
            </div>
            <p class="level__stats text-muted tabular-nums">
              {{ t('progress.levelStats', { correct: levels[item.id]?.correct ?? 0, streak: levels[item.id]?.bestStreak ?? 0 }) }}
            </p>
          </li>
        </ol>
        <p class="mt-6 text-dimmed text-sm flex gap-4">
          {{ t('progress.version', { version }) }}
          <ULink to="/licenses" class="underline underline-offset-2">{{ t('home.licenses') }}</ULink>
        </p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.page {
  max-width: 76rem;
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

.star {
  color: var(--star-off);
}

.star--on {
  color: var(--color-pad-sun);
}

.star--on :deep(path) {
  fill: currentColor;
}

@media (max-width: 860px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
