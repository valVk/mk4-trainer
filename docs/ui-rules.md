# UI rules

General rules for every screen of «Академия клавиш». A new screen or a change follows them without being asked. When a
screen needs something these rules do not cover, reuse what another screen already has before inventing anything, and
add the new rule here.

## Screen structure

From top to bottom, always in this order, with nothing between:

1. **Page header** (`PageHeader`): ☰ drawer, back, small title. Settings and states go to the drawer
   (`#page-actions`, `#drawer-status`), never onto the screen.
2. **Toolbar** (`.toolbar`): the screen's buttons in one row, left-aligned.
3. **Level row** (`LevelRow`, or the chords' tabs that look the same): «Уровень», the segmented track, stars and the
   screen's states on the right.
4. **Task**: a title (`.prompt`), one line of what to do (`.how`), then the content.
5. **Keys** (`PianoKeyboard`), when the screen is played on keys.

The footer stays as it is: version, «Проверить обновление», and tools via `#footer-tools`.

Tool screens (the metronome «Ритм», a song's map, «Лаборатория», «Прогресс», the MK4 pages) are not tasks: they
have no level row, and their controls sit with what they control (a card, a panel, the player). The toolbar, button
size, word and badge rules below still apply to them.

## Drawer

- Everything that is a setting, not an action, lives in the drawer as one row each: help (`HelpSwitch`), accuracy
  (`SkillPicker`), sound, octave and MK4 state (`DrawerStatus`). A screen adds rows through `#page-actions`, states
  through `#drawer-status`; nothing of this goes on the screen.
- A setting chosen per student (help, accuracy, sound bank) is the same on every screen and on «Прогресс».

## Toolbar

- One row right under the page header, left-aligned. Secondary buttons first, **the main action last**
  (`.toolbar__main`, colour `primary`, the others `neutral` + `soft`).
- **The same buttons in the same places in every phase** (intro, ready, playing, result, level done). A button that
  cannot act now is `disabled`, not hidden. Hiding is only for a mode the student switches (help on/off, sound off).
- **Labels do not change length** between phases. The main button has one fixed width (`.toolbar__main`), whatever it
  says («Играть», «Стоп», «Дальше», «Понятно», «Следующий уровень»).
- Size `lg` for every toolbar button. `md` inside cards, `xl` nowhere new.
- No badges, numbers or key hints on buttons. The MK4 drives screens through the transport (▶/■ plays or stops,
  Loop plays again) and the knob, which reaches every button. Pads work without labels and mean the same on every
  screen: 1 the main button, 2 listen, 3 hint or metronome, 4 skip or another task, 7/8 level down/up.

## Level row

- «Уровень», then plain numbers in one segmented track (`LevelRow`); closed levels dimmed, no lock icons; a finished
  level gets a small green dot; the piece that ends a group of levels is a small chip inside the track.
- On the right: stars (`StarRating`), `ExamBadge` in an exam, then the screen's own state (tempo, «Подряд», what is
  under the hands). The track scrolls sideways on a narrow screen; the row never wraps on a phone.
- Stars: as many green (on time) notes as yellow (early, late) is one star, more green two, all green three; a red
  note (missed, let go too soon) fails. A level keeps its best attempt; one star opens the next level.

## Results and what they open

- A result is a card (`.result`) at the top right of the task. It holds the verdict, the stars of that attempt and
  one or two hints.
- Whatever a result opens (the next level, a piece) is a `md` button **inside the card**, never added to the toolbar.
- When the level is done, the toolbar's main button becomes «Следующий уровень» (or «Ещё здесь» when there is none).

## Layout stability

- Task content is **top-aligned** (`justify-content: flex-start`), so the title never moves when the content under
  it changes.
- Nothing appears, disappears or changes width in the toolbar or the level row during a task. Feedback lines and pills
  keep their room, or float over the content.
- Every screen fits **without scrolling** on the Tab S10+ (1280×800), the Tab S10 FE (1232×650) and a phone in
  landscape (844×390), on every level and every phase, not only the first one. Big type is bounded by the height too
  (`min(…vw, …vh)`), and the keys give room first on short screens.
- **The keys take the room the task leaves** (`PianoKeyboard fill`): the task is as tall as its content, the keys
  grow to the footer between `--keys-height` (how low they may get) and `--keys-max`. Never a fixed small keyboard
  under empty space.
- Landscape only; check light and dark theme.

## Colour and states

- Only tokens from `main.css`, never a hex in a component: `--color-active` (chosen, playing), `--color-correct`
  (right, held), `--color-attention` (close: early, late, a hint to fix), `--color-wrong` (missed, cut short),
  `--color-on-fill` for text on a fill, `--ui-*` for neutral text, surfaces and borders. Dark and light (the MK4's
  own colours) are two sets of the same tokens.
- The same meaning has the same colour everywhere: staff marks, the waterfall, press-and-hold bars, results.
- Chosen is a filled background, never an outline. Borders are thin (`--ring-width`).
- The knob cursor shows only while the knob or Tab moves focus (`html.knob-nav`); a tap or click never leaves a
  cursor behind.
- A hint on the keys or pads is an outline or ring; a fill always means «pressed».

## Playing

- Every attempt starts with room: a 3-2-1 countdown in plain seconds (`CountIn`), over the notes, never over the keys;
  in the waterfall the first note is still falling when it ends.
- What is judged is shown while playing: a held note turns green, a missed or cut-short one red, early or late
  yellow after the attempt. How strict is the student's accuracy setting (lib/skill), never a constant in a screen.
- With help on, the time is drawn, not only told: counts under the notes and press-and-hold bars (`BeatRuler`).
- «Послушай и повтори»: «Играть» plays the model first, then the student's turn with its own countdown.
- Every key press sounds: the piano when the sound is on, a soft tick otherwise. A screen that plays sound has
  `meta: { sound: true }` (the sound window asks once), and its play buttons turn the sound on themselves.

## Keys and staffs

- One keyboard component (`PianoKeyboard`), 25 keys as on the MK4, with `fill` on task screens. The pressed note's
  key lights; on a staff to read, the pressed note turns green and stays found.
- Staffs (`RhythmStaff`, `NoteStaff`, `SongStaff`) redraw once the music font has loaded; a staff never shows stems
  apart from their notes.

## Typography and words

- Task title: `.prompt` (display font). The thing to find or play may be one big word (`.big-name`) under it.
  Chords' prompt is the task itself, so it is bigger, but bounded by the height.
- One line of instructions under the title (`.how`), in plain words for the student («ученик»).
- The same action has the same word everywhere: «Послушать», «Играть», «Стоп», «Ещё раз», «Дальше», «Пропустить»,
  «Понятно», «Следующий уровень».
- Levels are plain numbers after «Уровень», with no section letters.

## Help and exams

- One help switch for the whole app (`HelpSwitch`, in the drawer); an exam turns it off and says so (`ExamBadge`).
- Help shows on the content (counts, press-and-hold bars, interval numbers, lit keys), never as extra buttons.

## Before calling a UI change done

1. Click through **every screen of the section** in every phase, at the three sizes above, in both themes.
2. Compare with a screen that already follows these rules (song practice, «Ритм» in «Теория»). Anything that
   looks different is either a fix or a new rule here.
3. Run `npm run lint`, `npm run type-check`, `npx vitest run` and `npx playwright test`.
