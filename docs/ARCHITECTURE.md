# Architecture

## Why two processes with one direction

The app is a Tauri shell, so the interesting engineering problem is the seam between
the webview and Rust. Wolf draws that seam once and then keeps the dependency graph
one-directional in both halves.

```
React components/pages  ->  Zustand stores  ->  service layer  ->  Tauri IPC
                                                                      |
                                                                      v
Rust commands  ->  database + models        assistant/  ->  database
```

Nothing below a layer imports from above it. Two consequences that are worth the
discipline:

- The service layer is the only place that knows command names. Rename a Rust command
  and TypeScript fails to compile instead of failing at runtime.
- Stores hold no rendering concerns and no I/O concerns, so they can be driven in tests
  with a fake service.

## The IPC boundary

`src/services/ipc.ts` is where almost every `invoke` call lives. It detects
the Tauri runtime via `__TAURI_INTERNALS__`, because `withGlobalTauri` is `false` — the
global `__TAURI__` namespace does not exist in this configuration, so detecting it would
have made the app think it was running in a browser while sitting in a real webview.

The one other caller is `src/services/ollama.ts`, which calls `invoke` directly
for the five Ollama commands. It has to: the streaming path needs a `Channel` object that
`ipc.ts` does not model, and keeping the assistant behind an `OllamaTransport`
interface is what lets `OllamaClient.test.ts` run against a fake. The trade-off is that
those command names are written in two places, so `ipcContract.test.ts` checks them
against the Rust `invoke_handler` list. That test reads the live block only: a
commented-out line in `generate_handler!` is not a registration, so disabling a
command fails the suite instead of quietly passing it.

When the shell is absent, `ipc.ts` rejects with an explanatory error. That is what makes
`npm run dev:web` degrade into a labelled "desktop unavailable" view instead of a blank
screen. The fallback is a deliberate development affordance, not a supported mode.

## Frontend layout

`src/` is grouped by responsibility rather than by kind, so a feature's files sit
together:

- `src/app/` — the shell: routing, stores that are not per-feature, the two entry
  points, and the desktop-event and reminder hooks.
- `src/features/<domain>/` — one directory per domain. A page, a store, and the
  logic and dialogs it needs, with `*.test.ts` beside the logic.
- `src/services/` — the IPC layer, the only place that names a command.
- `src/lib/` — dependency-free helpers with no React and no Tauri.
- `src/components/` — the shared UI primitives in `ui.tsx`.
- `src/types/index.ts` — the IPC and domain types, mirroring `src-tauri/src/models/`.
- `src/styles/` and `src/assets/` — CSS and the sprite data.

A dependency points one way: `app` → `features` → `services` → `lib`. `lib` imports
nothing from the other three.

## State ownership

State lives in exactly one place per domain, and always the same one:

| Domain                                | Source of truth                          | Why                                              |
| ------------------------------------- | ---------------------------------------- | ------------------------------------------------ |
| Tasks, habits, events, focus sessions | SQLite                                   | Must survive restarts and be the backup format   |
| Settings                              | SQLite, mirrored into Rust managed state | Shared with the companion window and tray        |
| Timer phase                           | In-memory, seeded from settings          | Must keep ticking with no DB round-trip per tick |
| Wolf pose                             | In-memory, derived from the above        | Pure UI reaction, nothing to persist             |
| Chat transcript                       | In-memory                                | Deliberately not persisted                       |

The timer is the interesting case. `src/features/focus/timerLogic.ts` is a pure function of
`(snapshot, action, now)`. React only supplies `now` on a 250 ms interval, and the store
writes a focus session row exactly once, when a phase reaches `COMPLETED`. Because
remaining time is recomputed from `accumulatedMs` plus the wall clock rather than
decremented, the timer cannot drift, and it survives a component remount inside the
same window. It does not survive closing the app: a phase in progress is lost, which is
a deliberate trade for keeping the tick path off the database.

## Settings patching

The main window and the companion window both write settings, and they own different
fields. Naive full-object writes meant a companion drag could clobber the assistant
preferences written a moment earlier. `SettingsPatch` plus `Settings::apply_patch`
makes every write partial at the Rust boundary, so the loser of a race loses only its
own fields.

## Two windows

`index.html` and `companion.html` are separate Vite inputs with separate entrypoints,
sharing the same bundle output and the same Rust process. The companion is a
`transparent`, `decorations: false`, `skipTaskbar: true`, initially hidden window.

Because it is a different document, it has its own React tree and its own store
instances — Zustand singletons are per-JavaScript-context. The two contexts
communicate only through IPC and Tauri events. That is the reason the shared code is
factored as services rather than shared singletons: the same logic runs in both windows
without assuming a single store exists.

## Sprite pipeline

The wolf is a 28x28 character matrix with a named palette, not a set of PNGs:

1. `wolf-pixels.json` holds the base matrix, the palette, and the per-state overlays.
2. `sprites.ts` validates the data (unknown pixel characters are an error), then
   flattens matrices into SVG run strings grouped by fill colour, so a frame is a
   handful of `<rect>` elements instead of 784 nodes.
3. `WolfSprite.tsx` renders those runs.
4. `scripts/generate-icons.mjs` rasterises the same matrix into the app and tray PNGs, so
   the window icon and the in-app wolf cannot drift apart.

Transparency is `"."`, not a space. An early version used spaces, which silently
composited the frame background into the sprite.

## AI context

`assistant/mod.rs` classifies the question into a small intent enum, then assembles only the
sections that intent needs. Asking about overdue tasks does not load the calendar, and
neither loads the full task table — `tasks_section` filters in SQL.

The assembled block is capped before it is concatenated, and the Ollama client
separately caps the streamed prompt. The privacy property is structural rather than a
promise: the only network client in the codebase rejects any URL whose host is not
localhost.

## Migrations

`database/migrator.rs` embeds the `src-tauri/migrations/*.sql` files with
`include_str!` and
applies them in the order they appear in its `MIGRATIONS` array — not sorted at
runtime. Each one runs inside a transaction and is recorded in
`schema_migrations`. Startup is therefore idempotent, and a new version is a new
numbered file plus a new entry at the end of that array. There is no down
migration: a corrupt or unreadable database is reported as an error rather than
silently destroyed, because the file is the user's backup.

## Testing strategy

- Rust: pure functions and repositories against in-memory SQLite. `cargo test` runs in
  under a second, so there is no excuse for slow tests.
- Frontend: Vitest for the pure logic that carries the real risk — date handling, the
  timer state machine, task helpers, sprite transforms, and the Ollama client against a
  stubbed `fetch`.
- No component-rendering tests. The value would not justify the tooling weight for a
  single-window-per-domain app, and the logic worth testing is already extracted.
- The contract test guards the seam both type systems cannot: `ipcContract.test.ts`
  reads every `invoke` call in `src/` and every entry in `generate_handler!`, so a
  rename on either side is a test failure rather than a runtime error.

Counts today: 114 frontend tests, 81 Rust tests, neither needing a display or a
daemon.
