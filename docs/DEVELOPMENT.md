# Development guide

## Getting set up

```bash
bash scripts/check-dependencies.sh   # read-only, tells you what is missing
bash scripts/setup-arch.sh           # installs the missing system packages
npm install
npm run dev
```

`npm run dev` is the command you want. It starts Vite on `localhost:5273` and opens the
Tauri window against it.

## Day-to-day

- `npm run dev` — run the app
- `npm run verify` — the full gate: typecheck, lint, unit tests, cargo check, cargo test
- `npm run rust:clippy` — needs `rustup component add clippy` the first time
- `npm run format` — Prettier over TS, CSS, MD, and JSON
- `node scripts/generate-icons.mjs` — regenerate app/tray PNGs from the sprite matrix

Rust rebuilds on save; there is no separate build step. A full Rust rebuild from cold is
a few minutes, but incremental changes to the app are quick.

## Adding a feature, in order

1. **Model and validation** in `src-tauri/src/models/`. Every write path validates here.
2. **Repository method** in `src-tauri/src/database/`. Filtering belongs in SQL, not in
   Rust loops.
3. **Command** in `src-tauri/src/commands/`. A thin adapter: unpack args, call the
   repository, wrap the error. No branching logic.
4. **Service method** in `src/services/`. The only place the command name appears.
5. **Store action** in `src/features/<domain>/`. Holds no rendering concerns.
6. **Component or page**. Reads from the store, dispatches actions.

Steps 5 and 6 both land in `src/features/<domain>/`, beside the store they read. Keep a
page thin enough that each panel could be its own component; `SettingsPage.tsx` is the
example to follow, and the panels it holds are the ones to copy.

If a new field must be shared between windows, add it to `SettingsPatch` as well, or the
companion will clobber it.

## Where the tests belong

- Anything with a branch on user input: pure function, test it directly.
- Anything involving time: inject the timestamp. The existing `date.ts` and
  `timerLogic.ts` are testable precisely because they take `now` as an argument.
- Anything talking to the network: stub `fetch`. See `src/features/assistant/OllamaClient.test.ts`.
- Anything reading the database: `crate::database::test_support::test_db()` gives you an
  in-memory database with migrations applied.

Do not add component-rendering tests. The logic worth testing is already extracted from
the components; a rendering test that duplicates it is maintenance cost with no signal.

## Conventions

- No `any`. If a Tauri command returns something awkward, type it in
  `src/types/index.ts`.
- Errors carry a `kind` so the UI can decide between showing a message and logging it.
- No comments. If a line is hard to read, rename something or pull it into a function.
  The codebase currently has three, all on intentionally empty `catch` blocks, and the
  rule for adding a fourth is that the code must be surprising without it.
- The wolf palette is data. Add a colour to `wolf-pixels.json` and to `COLOR`, never by
  editing a PNG.
- Nothing but `src/services/` may call `invoke`. This is checked by review, not tooling,
  so watch for it in your own diffs.
- Use American spellings in identifiers and prose. One British holdout remains in a
  settings label and is worth fixing if you touch that file.

## Troubleshooting

**`cargo check` reports dozens of errors after a dependency bump.** Usually a
`tauri::` generic inference change. Check whether you need the explicit
`AppHandle<R>`/`Runtime` parameters, and re-run `cargo check` before reading the errors —
one root cause often produces many.

**The dev window is blank.** Check the terminal for a Vite error first, then the webview
devtools. A blank window with a clean console usually means the Rust `setup` hook
returned an error; that message is in the terminal, not the UI.

**`__TAURI_INTERNALS__ is not available` in the browser.** Expected when running
`npm run dev:web`. That is the browser fallback working.

**The tray icon is missing on Wayland.** Needs a StatusNotifier host. GNOME does not
provide one. Use the X11 session or install the AppIndicator fallback.

**Port 5273 is taken.** Change `devUrl` in `src-tauri/tauri.conf.json` and the Vite
`server.port` in `vite.config.ts` together.
