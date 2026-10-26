import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'
import ui from '@nuxt/ui/vite'
import { VitePWA } from 'vite-plugin-pwa'
import vueDevTools from 'vite-plugin-vue-devtools'

import pkg from './package.json' with { type: 'json' }
import ru from './src/i18n/locales/ru.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; the Pages workflow sets BASE_PATH. Local dev stays at /.
  base: process.env.BASE_PATH || '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    vue(),
    // Self-signed HTTPS for dev and preview: Web MIDI needs a secure context on the tablet.
    basicSsl({
      name: 'chord-trainer',
      certDir: './node_modules/.vite/basic-ssl',
    }),
    ui({
      ui: {
        colors: {
          primary: 'blue',
          success: 'teal',
          warning: 'amber',
          error: 'red',
          neutral: 'slate',
        },
        // Every button gets press feedback; kids tap, so it must feel heard.
        button: {
          slots: {
            base: 'transition-[color,background-color,box-shadow,transform] duration-150 ease-(--ease-out) active:scale-[0.97] motion-reduce:active:scale-100',
          },
        },
        card: {
          slots: {
            root: 'rounded-2xl',
          },
        },
      },
      // Bundle used icons so the app works offline (no Iconify API requests).
      icon: {
        clientBundle: {
          scan: true,
        },
      },
    }),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: ru.app.name,
        short_name: ru.app.shortName,
        description: ru.app.description,
        lang: 'ru',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        theme_color: '#18181b',
        background_color: '#18181b',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Russian and English need only the latin and cyrillic font files.
        globIgnores: ['**/*-{vietnamese,latin-ext,cyrillic-ext}-*.woff2'],
        // SoundFont is large: keep it out of precache, cache on first fetch.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/soundfonts/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'soundfonts',
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
})
