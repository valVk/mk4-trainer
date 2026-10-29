<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useToast } from '@nuxt/ui/composables'

import PageHeader from '@/components/PageHeader.vue'
import { useProgress } from '@/composables/useProgress'

const { t } = useI18n()
const toast = useToast()
const router = useRouter()
const { songs, available, importSong, removeSong } = useProgress()

const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const importError = ref('')
const confirmDelete = ref<number | null>(null)

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  importError.value = ''
  importing.value = true
  try {
    const song = await importSong(file)
    toast.add({ title: t('songs.imported', { name: song.name }), icon: 'i-lucide-circle-check', color: 'success' })
    await router.push(`/songs/${song.id}`)
  } catch (error) {
    importError.value = error instanceof Error && error.message === 'storage' ? t('songs.errorStorage') : t('songs.errorNotMidi', { file: file.name })
  } finally {
    importing.value = false
  }
}

async function remove(id: number) {
  await removeSong(id)
  confirmDelete.value = null
}

const formatDate = (time: number) => new Date(time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
const formatSize = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} КБ`
</script>

<template>
  <main class="page">
    <PageHeader :title="t('songs.title')">
      <UButton
        icon="i-lucide-file-music"
        size="lg"
        :loading="importing"
        :disabled="!available"
        :label="t('songs.import')"
        @click="fileInput?.click()"
      />
      <input ref="fileInput" type="file" accept=".mid,.midi,audio/midi,audio/x-midi" hidden @change="onFile">
    </PageHeader>

    <p class="lead text-muted">{{ t('songs.lead') }}</p>
    <p v-if="importError" class="text-error mt-4">{{ importError }}</p>

    <UEmpty
      v-if="songs.length === 0"
      variant="naked"
      size="lg"
      icon="i-lucide-music"
      :title="t('songs.emptyTitle')"
      :description="t('songs.emptyHint')"
      class="py-16"
      :ui="{ description: 'text-base text-muted max-w-sm' }"
    />

    <ul v-else class="list">
      <li v-for="song in songs" :key="song.id" class="item">
        <RouterLink :to="`/songs/${song.id}`" class="item__link">
          <UIcon name="i-lucide-music" class="size-6 shrink-0 text-muted" />
          <span class="min-w-0">
            <span class="item__name text-highlighted">{{ song.name }}</span>
            <span class="item__meta text-muted">{{ t('songs.meta', { date: formatDate(song.importedAt), size: formatSize(song.size) }) }}</span>
          </span>
        </RouterLink>
        <div v-if="confirmDelete === song.id" class="flex items-center gap-2">
          <UButton color="error" variant="soft" size="lg" :label="t('songs.deleteYes')" @click="remove(song.id)" />
          <UButton color="neutral" variant="ghost" size="lg" :label="t('pads.cancel')" @click="confirmDelete = null" />
        </div>
        <UButton
          v-else
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          size="lg"
          :aria-label="t('songs.delete', { name: song.name })"
          @click="confirmDelete = song.id"
        />
      </li>
    </ul>

    <p class="note text-dimmed">{{ t('songs.privacy') }}</p>
  </main>
</template>

<style scoped>
.lead {
  max-width: 60ch;
  margin-top: 1rem;
  font-size: 1.125rem;
  line-height: 1.45;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 2rem;
}

.item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem 0.5rem 0.5rem;
  border-radius: 1rem;
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
}

.item__link {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.625rem 0.75rem;
  border-radius: 0.75rem;
}

.item__link:focus-visible {
  outline: 2px solid var(--ui-primary);
}

.item__name {
  display: block;
  font-family: var(--font-display);
  font-size: 1.125rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item__meta {
  display: block;
  font-size: 0.875rem;
}

.note {
  margin-top: 2rem;
  font-size: 0.875rem;
  max-width: 60ch;
}
</style>
