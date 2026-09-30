# Contributing to Wolf

Thanks for looking at Wolf. This file covers what you need to get set up and what
a change is expected to look like before it is merged.

There is more detail in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) about where
code belongs, and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) about how the
pieces fit together.

## Getting set up

Wolf is a Tauri app: a React frontend with a Rust backend and a SQLite database
in your user data directory. It talks to a local [Ollama](https://ollama.com)
daemon for the assistant, and everything works without one.

You need Node 20 or newer, a Rust toolchain from 1.82, and the Tauri system
dependencies for your platform. On Debian or Ubuntu:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl \
  wget file libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev \
  patchelf
```

Then:

```bash
npm install
npm run dev
```

`npm run dev` starts the desktop app. `npm run dev:web` starts only the frontend
in a browser against a stubbed desktop bridge, which is quicker when you are
working on UI.

The first launch creates its database and runs its migrations. Nothing else is
required.

## Before you open a pull request

Run the same checks CI runs:

```bash
npm run verify
```

That covers the type check, the linter, the frontend tests, and the Rust build
and tests. It does **not** cover three things, so run these too if you touched
Rust, or if CI is already red:

```bash
npm run rust:fmt     # note: this rewrites files, it is not a check
npm run rust:clippy  # -D warnings
npm run build:web
```

If you changed the wolf artwork or the generated icons:

```bash
node scripts/check-sprite.mjs
node scripts/generate-icons.mjs
```

`generate-icons.mjs` rewrites the PNGs under `src-tauri/icons` and `public`.
Commit them with your change.

## How changes are reviewed

Keep one logical thing per commit, and keep the history readable. A commit that
fixes a bug and reformats a file in the same change is hard to review and hard
to revert.

Write commit messages that explain **why**. The diff already shows what changed.

## Things worth knowing before you change them

A few decisions in this codebase look odd until you know the reason. They are
written down at the site, and this is the short version.

**The frontend never calls `invoke` directly.** Everything goes through
`src/services/desktop/`. `ipcContract.test.ts` parses both sides of that boundary
and fails if the frontend calls a command Rust does not register, or passes an
argument key the Rust signature does not accept. Tauri resolves both at runtime,
so a typo there is otherwise a production-only failure.

**Settings are one JSON blob.** Adding a field means adding it in
`src-tauri/src/models/settings.rs` _and_ `src/types/index.ts` _and_
`src/stores/settingsStore.ts`. Nothing tests that the two default copies agree, so
if you add a setting, check both by hand. Old databases will still load: Serde
ignores fields it does not know.

**The wolf sprite is 28x28, not 24x26.** It is generated from
`src/assets/wolf/wolf-pixels.json` and mirrored about column 13.5. The dimensions
are asserted in `sprites.test.ts` and enforced by `scripts/check-sprite.mjs`, so
you will find out immediately if you break the shape.

**Migrations are applied in the order of the `MIGRATIONS` array** in
`src-tauri/src/database/migrator.rs`, not in filename order. They run once each
and never drop a table.

**The palette has no green or amber**, so status colours are borrowed from what
the sprite does have: blue reads as fine, cream as attention, pink as problem.
That is why `--danger` and `--accent` are the same pink.

**Ollama must be on loopback.** The base URL is validated when it is saved and a
non-loopback host is refused, because the app promises your data stays local.

**Pure functions where possible.** The timer, the date helpers, the task
filters, the intent classifier and the whole sprite pipeline take their inputs
as arguments and have no clock, no network and no filesystem. That is what lets
the whole suite run in seconds with no setup file. Please keep new logic in that
shape, and pass `now` in rather than reading the clock.

## Tests

Neither suite needs a display, a running Ollama daemon, or a database file. The
Rust tests run real migrations against in-memory SQLite, so if you touch
`migrations/`, the Rust tests are the place to prove it still applies.

Name a test after the invariant it protects, not the function it calls. A failing
test should tell you what broke without opening the file:

```ts
it("treats the due date as a calendar day, not a timestamp", () => { ... });
```

If you are fixing a bug, add the test that would have caught it, and say in the
commit message what the bug was.

## Reporting bugs

Open an issue and include your OS, your Wolf version, and the output of
`npm run verify`. If it involves the assistant, include which Ollama model you
are using and whether `ollama serve` is running.

Please do not open a public issue for a security problem. Use the private
reporting route GitHub offers on the Security tab.

## Licence

Wolf is MIT licensed. See [`LICENSE`](LICENSE). By contributing you agree that
your contribution is published under the same terms.
