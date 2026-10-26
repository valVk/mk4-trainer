# chord-trainer

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Sound

Notes play through `spessasynth_lib` (Apache-2.0) with the `MuseScore_General.sf3` SoundFont (MIT).
The SoundFont is not stored in git; download it once with `npm run soundfont`. It loads when the
user taps "Включить звук" and is cached by the service worker for offline use.

## Licenses

- App code: written from scratch; ideas inspired by Chord Nebula (Behnam Khanbeigi).
- `spessasynth_lib`: Apache-2.0.
- `MuseScore_General.sf3`: MIT, S. Christian Collins, based on FluidR3Mono and FluidR3. See `NOTICE`
  and `public/soundfonts/MuseScore_General_License.md`.

## Releases and GitHub Pages

The app is published to https://valvk.github.io/mk4-trainer/.

- `npm run release:patch` (or `release:minor`, `release:major`) bumps the version in `package.json`,
  commits `chore(release): vX.Y.Z`, tags `vX.Y.Z` and pushes. Run it on the default branch (`master`) with a clean working tree.
- The tag starts `.github/workflows/release.yml`: type check, lint and tests (`ci.yml`), a GitHub release
  with generated notes, then `pages.yml` builds with the repository base path and deploys to Pages.
- `pages.yml` can also be run by hand from the Actions tab to redeploy without a new version.
- CI downloads the SoundFont during the build (cached between runs); it is never committed.

## Local HTTPS

Web MIDI only works in a secure context, so `npm run dev` and `npm run preview` serve over HTTPS
with a self-signed certificate from `@vitejs/plugin-basic-ssl`. The certificate is generated on first
start and cached in `node_modules/.vite/basic-ssl`.

1. Run `npm run dev` and open the `Network` URL (`https://<laptop IP>:5173`) on the tablet.
2. Chrome warns about the certificate: tap "Advanced" and "Proceed". Web MIDI works after that.

The service worker does not register on an untrusted certificate, so PWA install and offline mode
are tested on the permanent HTTPS host, not on the dev server.

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
npm run test:unit
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
