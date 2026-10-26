<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/** Files published next to the app, under the same base path. */
const file = (path: string) => `${import.meta.env.BASE_URL}${path}`

const DENEMO_COMMIT = '276d17350e3a625dd4df19ecb7ff7421c070290d'

// Sound banks are shipped as separate files and loaded at runtime; each keeps its own license.
const banks = [
  {
    name: 'MuseScore_General.sf3',
    license: 'MIT',
    author: 'S. Christian Collins; FluidR3Mono: Michael Cowgill; FluidR3: Frank Wen',
    links: [
      { label: 'licenseText', href: file('soundfonts/MuseScore_General_License.md') },
      { label: 'source', href: 'https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/' },
    ],
  },
  {
    name: 'A320U.sf2',
    // The file's own metadata (ICMT) grants "version 2 ... or (at your option) any later version".
    license: 'GNU GPL v2+',
    author: 'Copyright 2005 by Milton Paredes. Made for Musix GNU+Linux, an update of Airfont 320.',
    note: 'a320uNote',
    links: [
      { label: 'notice', href: file('soundfonts/A320U-license.txt') },
      { label: 'licenseText', href: file('soundfonts/GPL-2.0.txt') },
      { label: 'source', href: `https://github.com/denemo/denemo/tree/${DENEMO_COMMIT}/soundfonts` },
    ],
  },
]

const software = [
  { name: 'spessasynth_lib, spessasynth_core', license: 'Apache-2.0', href: 'https://github.com/spessasus/spessasynth_lib' },
  { name: 'Vue, Vue Router, Vue I18n', license: 'MIT', href: 'https://github.com/vuejs/core' },
  { name: 'Nuxt UI', license: 'MIT', href: 'https://github.com/nuxt/ui' },
  { name: 'Tailwind CSS', license: 'MIT', href: 'https://github.com/tailwindlabs/tailwindcss' },
  { name: 'Dexie.js', license: 'Apache-2.0', href: 'https://github.com/dexie/Dexie.js' },
  { name: 'Workbox', license: 'MIT', href: 'https://github.com/GoogleChrome/workbox' },
  { name: 'Lucide icons', license: 'ISC', href: 'https://github.com/lucide-icons/lucide' },
  { name: 'Unbounded, Golos Text', license: 'SIL Open Font License 1.1', href: 'https://fontsource.org' },
]
</script>

<template>
  <main class="page">
    <header class="flex items-center gap-3 -ml-3">
      <UButton to="/" icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="xl" :aria-label="t('nav.home')" />
      <h1 class="title text-highlighted">{{ t('licenses.title') }}</h1>
    </header>

    <p class="lead text-muted">{{ t('licenses.lead') }}</p>

    <section class="mt-8">
      <h2 class="subtitle text-highlighted">{{ t('licenses.banks') }}</h2>
      <p class="text-muted mt-1 max-w-[60ch]">{{ t('licenses.banksHint') }}</p>
      <ul class="flex flex-col gap-4 mt-4">
        <li v-for="item in banks" :key="item.name" class="entry">
          <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span class="font-semibold text-highlighted">{{ item.name }}</span>
            <UBadge :label="item.license" color="neutral" variant="soft" size="md" />
          </div>
          <p class="text-toned mt-1">{{ item.author }}</p>
          <p v-if="item.note" class="text-muted text-sm mt-1 max-w-[60ch]">{{ t(`licenses.${item.note}`) }}</p>
          <p class="flex flex-wrap gap-x-5 gap-y-1 mt-2">
            <!-- Plain links: these are files and other sites, not app routes -->
            <a v-for="link in item.links" :key="link.href" :href="link.href" target="_blank" rel="noopener" class="link">
              {{ t(`licenses.${link.label}`) }}
            </a>
          </p>
        </li>
      </ul>
    </section>

    <section class="mt-10">
      <h2 class="subtitle text-highlighted">{{ t('licenses.software') }}</h2>
      <ul class="flex flex-col mt-4">
        <li v-for="item in software" :key="item.name" class="row">
          <a :href="item.href" target="_blank" rel="noopener" class="link">{{ item.name }}</a>
          <span class="text-muted">{{ item.license }}</span>
        </li>
      </ul>
    </section>

    <section class="mt-10">
      <h2 class="subtitle text-highlighted">{{ t('licenses.app') }}</h2>
      <p class="text-muted mt-2 max-w-[60ch] leading-relaxed">{{ t('licenses.appText') }}</p>
    </section>
  </main>
</template>

<style scoped>
.page {
  max-width: 56rem;
  margin: 0 auto;
  padding: clamp(1rem, 3vw, 2.5rem);
}

.title {
  font-family: var(--font-display);
  font-size: clamp(1.75rem, 3vw, 2.25rem);
  font-weight: 700;
}

.lead {
  max-width: 60ch;
  margin-top: 1rem;
  font-size: 1.125rem;
  line-height: 1.45;
}

.subtitle {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
}

.entry {
  padding: 1rem 1.25rem;
  border-radius: 1rem;
  background: var(--ui-bg-elevated);
  box-shadow: 0 0 0 1px var(--ui-border) inset;
}

.row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.25rem 1rem;
  padding-block: 0.625rem;
  border-bottom: 1px solid var(--ui-border-muted);
}

.link {
  color: var(--ui-primary);
  text-decoration: underline;
  text-underline-offset: 0.2em;
}
</style>
