<script setup lang="ts">
import { useSongPlayer } from '@/composables/useSongPlayer'

// The playback clock on its own: it changes every frame, so only this tiny component redraws.
defineProps<{ duration: number }>()
const { time } = useSongPlayer()

const format = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
</script>

<template>
  <span class="tabular-nums">{{ format(time) }} / {{ format(duration) }}</span>
</template>
