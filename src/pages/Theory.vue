<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import DrawerStatus from '@/components/DrawerStatus.vue'
import PageHeader from '@/components/PageHeader.vue'
import TheoryNotes from '@/pages/theory/TheoryNotes.vue'
import TheoryRhythm from '@/pages/theory/TheoryRhythm.vue'
import { useKeyboardWindow } from '@/composables/useKeyboardWindow'
import { useLastPlace } from '@/composables/useLastPlace'
import { useProgress } from '@/composables/useProgress'
import { useTheoryPiece } from '@/composables/useTheoryPiece'
import { NOTE_SECTIONS, type NoteSectionId } from '@/lib/noteLevels'

// «Теория» (plan steps 17-24): the course from the video, section by section, fitted to the 25 keys of the
// MK4. This page is the frame: the sections are their own components. The open section is in the address
// (?section=notes), so coming back from a piece lands in the same place.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const windowStart = useKeyboardWindow()
const progress = useProgress()

const SECTIONS = ['rhythm', 'notes', 'accidentals', 'intervals', 'scales', 'functions', 'sevenths'] as const
type Section = typeof SECTIONS[number]
/** Sections built so far; the others wait for their plan step. */
const READY: readonly Section[] = ['rhythm', 'notes', 'accidentals', 'intervals', 'scales', 'functions', 'sevenths']

const section = computed<Section>(() => {
  const asked = route.query.section
  return READY.find((item) => item === asked) ?? 'rhythm'
})

// A piece that ends a level is played inside its section (useTheoryPiece): the drawer names it and back closes it.
const { piece, closePiece } = useTheoryPiece()
const pieceName = computed(() => (piece.value ? progress.songs.value.find((song) => song.id === piece.value?.songId)?.name ?? null : null))

// The practice inside names its own place («Ода к радости · Фортепиано»).
useLastPlace(() => (piece.value ? null : t('home.place.theory', { section: t(`theory.sections.${section.value}`) })))

/** Sections run by the note-finding screen; «Ритм» has its own. */
const noteSection = computed<NoteSectionId | null>(() => (section.value in NOTE_SECTIONS ? section.value as NoteSectionId : null))

/** A section from the drawer: a piece open in the old one closes with it. */
function openSection(next: Section) {
  void router.replace({ query: next === 'rhythm' ? {} : { section: next } })
}
</script>

<template>
  <main class="page page--fill">
    <PageHeader
      :title="pieceName ?? t('theory.title')"
      :eyebrow="pieceName ? `${t('theory.title')} · ${t(`theory.sections.${section}`)}` : undefined"
      back="/train"
      :nav-label="t('theory.sectionsLabel')"
      :back-label="piece ? t('theory.backToLevel') : t('train.title')"
      :on-back="piece ? closePiece : undefined"
    >
      <!-- The sections are places, not settings: their own group in the drawer, the screen keeps the level row. -->
      <template #nav>
        <button
          v-for="item in SECTIONS"
          :key="item"
          type="button"
          class="drawer-section"
          :aria-current="item === section ? 'page' : undefined"
          :disabled="!READY.includes(item)"
          @click="openSection(item)"
        >
          {{ t(`theory.sections.${item}`) }}
          <UIcon v-if="item === section" name="i-lucide-check" class="size-5" />
          <UIcon v-else-if="!READY.includes(item)" name="i-lucide-lock" class="size-4" />
        </button>
      </template>
    </PageHeader>
    <!-- Sound and MK4 state live in the drawer, the map in the footer: the content gets the height. -->
    <!-- In «Ритм» any key counts and the window moves as the student taps: the map opens there only on a tap. A
         piece inside brings its own sound control (its instrument). -->
    <DrawerStatus :window-start="windowStart" :show-on-shift="section !== 'rhythm'" :sound="!piece" />

    <TheoryRhythm v-if="section === 'rhythm'" />
    <!-- One screen for every note-finding section; a new key, so switching sections starts it fresh. -->
    <TheoryNotes v-else-if="noteSection" :key="noteSection" :section="noteSection" />
  </main>
</template>

<style scoped src="./theory/theory.css"></style>
