<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import StatusLed from '@/components/StatusLed.vue'
import { useNoteSource } from '@/composables/useNoteSource'

// MK4 state in a header: a lit LED when connected, otherwise the button that connects it.
const { t } = useI18n()
const { midiStatus, connectMidi } = useNoteSource()
</script>

<template>
  <StatusLed v-if="midiStatus === 'connected'" on :label="t('lab.mk4Connected')" />
  <UButton
    v-else-if="midiStatus !== 'unsupported'"
    icon="i-lucide-plug"
    color="neutral"
    variant="soft"
    size="lg"
    :loading="midiStatus === 'connecting'"
    :label="t('midiTest.connect')"
    @click="connectMidi"
  />
</template>
