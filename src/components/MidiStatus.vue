<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import StatusLed from '@/components/StatusLed.vue'
import { useNoteSource } from '@/composables/useNoteSource'

// MK4 state, as it really is: a lit LED when a keyboard is found, a calm «не найдена» when MIDI works but nothing
// is plugged in, the connect button otherwise, how to unblock MIDI when Chrome blocked it, and that the MK4 needs
// Chrome in a browser without Web MIDI.
const { t } = useI18n()
const { midiStatus, midiFound, connectMidi } = useNoteSource()
</script>

<template>
  <StatusLed v-if="midiStatus === 'connected' && midiFound" on :label="t('lab.mk4Connected')" />
  <StatusLed v-else-if="midiStatus === 'connected'" :on="false" :label="t('midi.notFound')" />
  <UPopover v-else-if="midiStatus === 'denied'" :content="{ side: 'bottom', align: 'end' }">
    <UButton icon="i-lucide-shield-alert" color="warning" variant="soft" size="lg" :label="t('midi.blocked')" />
    <template #content>
      <div class="blocked">
        <p class="font-semibold text-highlighted">{{ t('midi.blockedTitle') }}</p>
        <ol class="blocked__steps text-toned">
          <li>{{ t('midi.step1') }}</li>
          <li>{{ t('midi.step2') }}</li>
          <li>{{ t('midi.step3') }}</li>
        </ol>
        <p class="text-muted text-sm">{{ t('midi.blockedAfter') }}</p>
      </div>
    </template>
  </UPopover>
  <!-- No Web MIDI (Safari, Firefox): the app works with the screen keys and the computer keyboard; only the MK4
       needs Chrome. Said calmly, on a tap, never as an alarm (plan step 30). -->
  <UPopover v-else-if="midiStatus === 'unsupported'" :content="{ side: 'bottom', align: 'end' }">
    <UButton icon="i-lucide-info" color="neutral" variant="ghost" size="lg" :label="t('midi.needsChrome')" />
    <template #content>
      <p class="needs-chrome text-toned">{{ t('midi.needsChromeHint') }}</p>
    </template>
  </UPopover>
  <UButton
    v-else
    icon="i-lucide-plug"
    color="neutral"
    variant="soft"
    size="lg"
    :loading="midiStatus === 'connecting'"
    :label="t('midiTest.connect')"
    @click="connectMidi"
  />
</template>

<style scoped>
.needs-chrome {
  width: min(22rem, 90vw);
  padding: 0.875rem 1rem;
  line-height: 1.4;
}

.blocked {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  width: min(24rem, 90vw);
  padding: 1rem 1.125rem;
}

.blocked__steps {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding-left: 1.25rem;
  list-style: decimal;
  line-height: 1.4;
}
</style>
