<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import MidiStatus from '@/components/MidiStatus.vue'
import OctaveMapButton from '@/components/OctaveMapButton.vue'
import PageHeader from '@/components/PageHeader.vue'
import SoundControl from '@/components/SoundControl.vue'
import TheoryNotes from '@/pages/theory/TheoryNotes.vue'
import TheoryRhythm from '@/pages/theory/TheoryRhythm.vue'
import { useKeyboardWindow } from '@/composables/useKeyboardWindow'
import { NOTE_SECTIONS, type NoteSectionId } from '@/lib/noteLevels'

// «Теория» (plan steps 17-24): the course from the video, section by section, fitted to the 25 keys of the
// MK4. This page is the frame: the sections are their own components. The open section is in the address
// (?section=notes), so coming back from a piece lands in the same place.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const windowStart = useKeyboardWindow()

const SECTIONS = ['rhythm', 'notes', 'accidentals', 'intervals', 'scales', 'functions', 'sevenths'] as const
type Section = typeof SECTIONS[number]
/** Sections built so far; the others wait for their plan step. */
const READY: readonly Section[] = ['rhythm', 'notes', 'accidentals', 'intervals', 'scales', 'functions', 'sevenths']

const section = computed<Section>(() => {
  const asked = route.query.section
  return READY.find((item) => item === asked) ?? 'rhythm'
})

/** Sections run by the note-finding screen; «Ритм» has its own. */
const noteSection = computed<NoteSectionId | null>(() => (section.value in NOTE_SECTIONS ? section.value as NoteSectionId : null))

function openSection(next: Section) {
  void router.replace({ query: next === 'rhythm' ? {} : { section: next } })
}
</script>

<template>
  <main class="page page--fill">
    <PageHeader :title="t('theory.title')" back="/train" :back-label="t('train.title')">
      <!-- In «Ритм» any key counts and the window moves as the child taps: the map opens there only on a tap. -->
      <OctaveMapButton :window-start="windowStart" :show-on-shift="section !== 'rhythm'" />
      <SoundControl />
      <MidiStatus />
    </PageHeader>

    <div class="sections" role="tablist" :aria-label="t('theory.sectionsLabel')">
      <button
        v-for="item in SECTIONS"
        :key="item"
        type="button"
        role="tab"
        class="section"
        :class="{ 'section--on': item === section }"
        :aria-selected="item === section"
        :disabled="!READY.includes(item)"
        @click="openSection(item)"
      >
        <UIcon v-if="!READY.includes(item)" name="i-lucide-lock" class="size-3.5" />
        {{ t(`theory.sections.${item}`) }}
      </button>
    </div>

    <TheoryRhythm v-if="section === 'rhythm'" />
    <!-- One screen for every note-finding section; a new key, so switching sections starts it fresh. -->
    <TheoryNotes v-else-if="noteSection" :key="noteSection" :section="noteSection" />
  </main>
</template>

<style scoped src="./theory/theory.css"></style>
