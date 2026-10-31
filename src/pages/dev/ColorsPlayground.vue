<script setup lang="ts">
import ColorSheet from '@/pages/dev/ColorSheet.vue'

// Development only (/dev/colors): the light and the dark theme side by side, every colour and the components that
// use them, whichever theme the app itself is in.
</script>

<template>
  <main class="colors">
    <ColorSheet class="theme-light" title="Светлая тема" />
    <ColorSheet class="dark" title="Тёмная тема" />
  </main>
</template>

<style scoped>
.colors {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  min-height: 100dvh;
}
</style>
