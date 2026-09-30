# Wolf

A local-first productivity companion for the Linux desktop. Tasks, habits, calendar, a
focus timer, and a small pixel wolf who reacts to what you are doing. All data stays in a
local SQLite file. The optional assistant runs against `ollama` on your own machine.

Tauri 2 + React + TypeScript in the shell, Rust and SQLite underneath, no cloud, no
accounts, no telemetry, no network calls except to localhost.




## Features

- **Tasks**  inbox/doing/done columns, priorities 1-4, due dates, descriptions,
  keyboard-first quick add.
- **Habits**  daily/weekly/monthly targets, completion history, current and best
  streaks.
- **Calendar**  month grid plus day detail, timed events, optional per-event reminders.
- **Focus**  Pomodoro state machine with focus/short/long phases, pause, skip, and
  session history with daily totals.
- **Assistant**  streams answers from a local Ollama model, with the relevant parts of
  your own data injected as context so you can ask "what's overdue?" or "how are my
  habits?" without leaving the app.
- **Companion**  a transparent, always-on-top, draggable pixel window whose pose
  reflects what the app is doing. Built from a hand-authored 24x26 sprite matrix.
- **Desktop integration**  system tray with real actions, close-to-tray, notifications
  for task reminders and finished focus sessions, keyboard shortcuts `1`-`7` to switch
  screens.





## Requirements

- Arch Linux (or a derivative) — `bash scripts/setup-arch.sh` installs everything
- Node.js 20+ and Rust (via `rustup`)
- WebKitGTK 4.1, GTK 3, OpenSSL, libsoup 3
- Optionally `ollama` for the assistant; without it every other feature still works

Verify your system without installing anything:

```bash
bash scripts/check-dependencies.sh
```

## Getting started

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite dev server and launches the Tauri shell. You want that
one — plain `npm run dev:web` opens in your browser where the native layer is absent and
the UI shows a "desktop unavailable" notice.

First launch, if you do not have a model: `ollama pull llama3.2`. The Assistant page
lists the models it can see and lets you pick the default.

## Commands

| Command               | What it does                                                                  |
| --------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`         | Dev server + Tauri window (the normal way to work on Wolf)                    |
| `npm run dev:web`     | Vite only, in a browser. No tray, no companion, no SQLite                     |
| `npm run build`       | Production bundle: `.deb` and AppImage into `src-tauri/target/release/bundle` |
| `npm run build:web`   | Typecheck and bundle the frontend only, no Rust                               |
| `npm run typecheck`   | `tsc --noEmit`                                                                |
| `npm run lint`        | ESLint, zero warnings tolerated                                               |
| `npm run test`        | Vitest unit tests                                                             |
| `npm run rust:check`  | `cargo check`                                                                 |
| `npm run rust:test`   | `cargo test`                                                                  |
| `npm run rust:clippy` | `cargo clippy --all-targets -- -D warnings`                                   |
| `npm run verify`      | Typecheck, lint, unit tests, cargo check, cargo test                          |
| `npm run check:deps`  | Report missing system packages                                                |

## Where your data lives

```
$XDG_CONFIG_HOME/wolf/wolf.db     # or ~/.config/wolf/wolf.db
```

Plain SQLite. Back it up by copying that one file while Wolf is closed. Schema
migrations are embedded in the binary and applied in order on startup, so there is no
separate migration step.

## Privacy

Wolf has no network code paths except the Ollama client, which refuses to talk to
anything but `http://localhost:11434` or `http://127.0.0.1:11434`. The CSP in
`src-tauri/tauri.conf.json` blocks remote script, style, and connection targets. There
are no analytics, no crash reporting, and no update check. Uninstalling is deleting the
app; your data stays in that file until you remove it.

## Architecture

```
src/                 React frontend
  pages/             one module per screen
  stores/            Zustand stores, one per domain, singletons
  services/          the only code that talks to Tauri or Ollama
  components/        shared UI, grouped by feature
  assets/wolf/       sprite matrix + transforms (no image files)
src-tauri/src/
  commands/          thin Tauri command adapters, no business logic
  models/            domain types and validation
  database/          migrations and the SQLite repositories
  ai/                intent classification and context building
  ollama/            localhost streaming client
  tray/, windows/    desktop shell integration
  state.rs           managed state, settings patch application
```

The dependency direction is one-way: `components/pages -> stores -> services -> Tauri`.
Rust mirrors that with `commands -> database/models`, and `ai` depends only on
`database`, never on commands. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for why.

## Development notes

- The wolf sprite is generated from a typed pixel matrix in `src/assets/wolf/wolf-pixels.json`
  and transformed at runtime into SVG runs, so recolouring is a data change rather than
  an image edit. `node scripts/generate-icons.mjs` regenerates the PNG app and tray icons
  from that same matrix.
- Timer behaviour lives in `src/utils/timerLogic.ts` as a pure function so it can be
  tested without React or a clock. The same rule applies to task and date helpers.
- Two windows means two entrypoints, `src/main.tsx` and `src/companion.tsx`, built from
  `index.html` and `companion.html`.

## Troubleshooting

**The tray icon is missing.** The tray needs a StatusNotifier host, which GNOME does not
provide by default and Wayland sessions do not always have. Use the X11 session, or
install `libappindicator-gtk3`, or just launch from the app window.

**Build fails on `webkit2gtk-4.1`.** That package name is the Tauri v2 requirement. If
you only have `webkit2gtk-4.0`, remove it and install `webkit2gtk-4.1`.

**The assistant says Ollama is offline.** Check `curl http://localhost:11434/api/tags`.
If that fails, start `ollama serve`. The app intentionally does not start a daemon for
you.

**The companion window disappeared.** Tray → Show companion. Its position is saved when
you drag it.

## License

MIT. See [LICENSE](LICENSE).
