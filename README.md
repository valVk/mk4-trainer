# Академия клавиш (Keys Academy, repo mk4-trainer)

A personal piano academy for a beginner student, played on an **Akai MPK Mini IV** (MK4: 25 keys and 8 pads) connected to a
tablet. It teaches chords, a music theory course, songs and rhythm, works offline as a PWA,
and saves progress on the device for each player. The interface is in Russian.

Live: https://valvk.github.io/mk4-trainer/

## What is inside

| Screen | What the student does |
|---|---|
| **Тренировка** (`/train`) | 8 levels: find a note, major and minor triads on white keys, then from any note, build by the 4 + 3 / 3 + 4 formula, inversions, dim/aug/sus, seventh chords, progressions. Stars per level (5, 10, 20 correct answers); hints fade after 3 right answers in a row. The app reopens on the level the student was on. |
| **Лаборатория** (`/lab`) | Free play: the app names the chord, interval or note being held and shows the intervals between the keys. |
| **Песни** (`/songs`) | Import a MIDI file. The song map shows every part across the bars and its sections. Parts can be muted, and each has its own volume, saved with the song. Playback can start anywhere, with rewind, fast forward and section skip. |
| Song practice (`/songs/:id/:channel`) | Learn one part with the teacher's ladder: listen, play with the song waiting for you, then play in tempo at 60%, 80% and 100%. Phrases first, then sections, then the whole part. Melodic parts with up to 8 notes and drums can be played on the pads. |
| **Ритм** (`/rhythm`) | Metronome (40–160 BPM, 2/4, 3/4, 4/4, 6/8, three click sounds), plus a latency check for each input: the screen, the MK4, the computer keyboard. |
| **Прогресс** (`/progress`) | Players (profiles), stars per level, weak chords, sound bank choice, JSON backup and restore. |
| **Проверить MK4** (`/midi-test`, `/pads`) | Raw MIDI monitor and pad calibration. |

The app is built for landscape on the tablet; in portrait on a touch device it asks to turn the tablet.

### How it treats the student

Scoring and feedback follow how hands and ears actually work:
- Timing is judged against what the student hears (audio output delay plus the measured delay of each input).
- Warnings wait until the fingers have settled on a chord.
- A neighbour key brushed together with the right one is not a mistake.
- One press counts once, and pressing every key does not pass.
- Ladders only go up.

The full checklist is in `.claude/skills/ui-reaction-rules/SKILL.md`.

### Playing without the MK4

The on-screen keyboard works by touch. On a computer, the keyboard acts as a virtual MK4:

| Keys | Plays |
|---|---|
| `A W S E D F T G Y H U J K O L P ;` | Notes from C upwards (white and black keys like a piano) |
| `Z` / `X` | Octave down / up |
| `1`–`8` | Pads: next, listen, hint, skip, Тренировка, Лаборатория, level down, level up |

The MK4 itself needs Chrome (Web MIDI); the screen keys and the computer keyboard work in any browser.

### Other MIDI keyboards

Everything the app knows about the keyboard sits behind one interface, `ControllerProfile` in
`src/lib/controller.ts`: its number of keys, home octave, pad notes, panel drawing, the messages its controls send
out of the box, what they do in the app, and how to read its own octave message. The MK4 (`src/lib/controllers/mk4.ts`)
is the only profile. Supporting another keyboard means writing its profile, adding it to `CONTROLLERS`, and choosing
it in `activeController()` (for example by its MIDI input name); the screens do not change.

## Tech

Vue 3 (`<script setup>`, TypeScript), Nuxt UI 4, Vue Router, vue-i18n, Dexie (IndexedDB), Web MIDI,
`spessasynth_lib` (SoundFont synth and MIDI sequencer in an AudioWorklet), VexFlow 5 (music notation, with the Bravura
font built in so it works offline), vite-plugin-pwa.

```
src/
  lib/          pure logic, no Vue: music theory, levels, songs and phrases, ladder and scoring,
                metronome and latency, song mix, 25-key window
  composables/  app state: synth, song player, metronome, note input (MK4 + virtual), progress
  db/           Dexie schema, songs, progress, backup
  components/   UI parts (keyboard, pads, falling notes, page header, ...)
  pages/        one file per screen
  i18n/         Russian texts
tests/          unit tests (Vitest)
e2e/            browser tests (Playwright)
```

Pages never touch the database directly; everything goes through `composables/useProgress.ts`.

## Development

Requires Node 22.18+ or 24.12+.

```sh
npm install
npm run soundfont   # downloads the two SoundFonts into public/soundfonts (not in git)
npm run dev         # https://localhost:5173
```

### On the tablet

Web MIDI needs a secure context, so the dev server and `npm run preview` use HTTPS with a self-signed
certificate (`@vitejs/plugin-basic-ssl`, cached in `node_modules/.vite/basic-ssl`).

1. Run `npm run dev -- --host 0.0.0.0` and open the `Network` URL (`https://<laptop IP>:5173`) on the tablet.
2. Chrome warns about the certificate: tap "Advanced" and "Proceed". Web MIDI works after that.

The service worker does not register on an untrusted certificate, so PWA install and offline mode are
tested on GitHub Pages, not on the dev server.

### Checks

```sh
npm run type-check   # vue-tsc
npm run lint:check   # oxlint + eslint (npm run lint fixes)
npm test             # unit tests, Vitest
npm run test:e2e     # browser tests, Playwright, at tablet landscape sizes (1400x800, 1152x650)
npm run build        # type-check + production build
```

`npm run test:e2e` starts its own dev server on port 5175. The first run on a new machine needs
`npx playwright install chromium`.

`components.d.ts` and `auto-imports.d.ts` are generated by Nuxt UI and committed on purpose: CI
type-checks before Vite runs. Commit them again whenever they change (for example, after adding a component).

## Releases and GitHub Pages

- `npm run release:patch` (or `release:minor`, `release:major`) bumps the version in `package.json`,
  commits `chore(release): vX.Y.Z`, tags `vX.Y.Z` and pushes. Run it on `master` with a clean working tree.
- The tag starts `.github/workflows/release.yml`. It runs type-check, lint and unit tests (`ci.yml`), creates a GitHub
  release with generated notes, then `pages.yml` builds with the repository base path and deploys to Pages.
- `pages.yml` can also be run by hand from the Actions tab to redeploy without a new version.
- CI downloads the SoundFonts during the build (cached between runs); they are never committed.

## Sound

Two SoundFonts, chosen on the Прогресс page:
- `MuseScore_General.sf3`: the default, MIT, 40 MB.
- `A320U.sf2`: GNU GPL v2 or later, 10 MB, from the Denemo project.

Sound turns on after a tap (browsers require it). The bank is downloaded once, kept in the Cache Storage,
and works offline after that. A limiter on the output keeps loud songs from clipping.

## Licenses

See `NOTICE` and the in-app page «Лицензии» (`/licenses`).

- App code: written from scratch; ideas inspired by Chord Nebula (Behnam Khanbeigi).
- `spessasynth_lib`, `spessasynth_core`: Apache-2.0.
- `MuseScore_General.sf3`: MIT. By S. Christian Collins, based on FluidR3Mono and FluidR3
  (`public/soundfonts/MuseScore_General_License.md`).
- `A320U.sf2`: GNU GPL v2 or later (per the file's metadata), by Milton Paredes
  (`public/soundfonts/A320U-license.txt`; full text in `public/soundfonts/GPL-2.0.txt`).
- MIDI files are not part of the repository; each user imports their own.
