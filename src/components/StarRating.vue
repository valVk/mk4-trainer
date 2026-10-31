<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// A level's or a phrase's stars, the same everywhere: earned ones in the attention colour, the rest dim (or left
// out with `earnedOnly`, in a short list line).
withDefaults(defineProps<{
  value: number
  of?: number
  size?: 'inline' | 'md' | 'lg' | 'xl'
  earnedOnly?: boolean
}>(), { of: 3, size: 'md', earnedOnly: false })

const { t } = useI18n()
</script>

<template>
  <span class="stars" :class="`stars--${size}`" :aria-label="t('train.stars', { n: value })">
    {{ '★'.repeat(value) }}<span v-if="!earnedOnly" class="stars__off">{{ '★'.repeat(Math.max(0, of - value)) }}</span>
  </span>
</template>

<style scoped>
.stars {
  flex-shrink: 0;
  letter-spacing: 0.08em;
  white-space: nowrap;
  color: var(--color-attention);
}

.stars--md {
  font-size: 1.125rem;
}

.stars--lg {
  font-size: 1.5rem;
}

.stars--xl {
  font-size: 1.75rem;
}

.stars__off {
  color: var(--star-off);
}
</style>
