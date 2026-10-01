# Wolf

Version 0.1.0. Linux only, and still in development.

A pixel-art productivity companion that lives on your desktop. Tasks, habits,
calendar, a focus timer, and a local AI assistant — with a wolf that reacts to
what you are doing.

Everything is stored in a SQLite database on your own machine. The only thing
that ever leaves it is a question you ask the assistant, and that goes to an
Ollama daemon you run yourself on localhost.

## What it does

**Tasks** — capture, prioritise, and filter by day, project or status. Tasks
without a due date are not lost, they just sort last.

**Habits** — daily, weekday, or weekly frequencies, with current and longest
streaks and a 28-day completion grid. Undoing a day recalculates the streak
correctly rather than pretending it never happened.

**Calendar** — events with reminders, and month and day views. The reminder is
delivered through your desktop's notification service at a lead time you set per
event.

**Focus** — a Pomodoro-style timer with configurable block and break lengths.
Each completed session is recorded, and the sparkline shows the last seven days
of minutes. Days are grouped by _your local midnight_, not by UTC, so a session
that ends just after midnight lands on the right day.

**Assistant** — ask a question in plain language. Wolf classifies the intent and
assembles a block of your own tasks, habits, events, and focus history, then
sends that with your question to a local Ollama model. It answers about your
week rather than in general.

**The wolf** — nine poses, 31 frames, all generated from a single 28x28
character matrix. It sits in its own transparent window, so it floats over
whatever you are doing, and you can scale, reposition and pin it. It blinks
while you listen, talks while it thinks, and looks sad when Ollama is down.

## Look and feel

The interface is a single dark palette, because the palette and the shape
language are both taken from the wolf's own eight colours: the sprite's fur is
the interface's outline, its cream is the interface's text, and its pink cheek
is the interface's accent. There is no green or amber, so blue reads as fine,
cream as attention, and pink as problem.

## Install

Linux, for now. The app is a Tauri build, so it is native rather than a web page
in a wrapper.

```bash
git clone https://github.com/ArthurJosephLawson/Wolf.git
cd Wolf
npm install
npm run dev
```

To build installers (`.deb` and AppImage):

```bash
npm run build
```

These land in `src-tauri/target/release/bundle/`. There is no download yet for
v0.1.0 — the tag marks the release, and building from source is the current way
to install it.

### Requirements

- Node 20 or newer
- A Rust toolchain from 1.82
- On Debian or Ubuntu, Tauri's system libraries:

  ```bash
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl \
    wget file libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev \
    patchelf
  ```

The Tauri dependencies are listed in full in [CONTRIBUTING.md](CONTRIBUTING.md).

## The assistant

The assistant is optional. Wolf works fully without it, and the assistant screen
tells you plainly when the daemon is not running.

To enable it:

1. Install [Ollama](https://ollama.com).
2. Start it with `ollama serve`.
3. Pull a small model — `qwen2.5-coder` is what Wolf suggests, but any model
   Ollama has will do:

   ```bash
   ollama pull qwen2.5-coder
   ```

4. Open **Settings**, and check the daemon status. If it says ready, you are done.

### Why Wolf refuses other addresses

Wolf's base URL is validated when you save it, and only `http://localhost` and
`http://127.0.0.1` are accepted. This is not caution about ports; it is the whole
privacy model. A remote URL would receive your tasks, habits, calendar and focus
history, embedded in every question. Wolf would be silently doing the one thing
it promises it will not do.

If you point it at a remote host, the setting is rejected rather than stored.

## Privacy

- Your data is in a SQLite file in your platform's user data directory. Wolf has
  no account, no sync, and no telemetry, and it makes no network requests other
  than to the Ollama daemon you configure.
- That daemon must be on loopback. A non-loopback address is refused on save.
- If you do use the assistant, your tasks, habits, events and focus history are
  included in the prompt sent to your local model. That is the feature working.
  It stays on your machine, but it is worth knowing that the prompt contains it.

## Development

```bash
npm run verify       # typecheck, lint, vitest, cargo check, cargo test
npm run dev:web      # frontend only, in a browser, against a stubbed bridge
npm run test         # 114 frontend tests
npm run rust:test    # 81 Rust tests
```

Neither suite needs a display, a running Ollama daemon, or a database file. The
Rust tests run the real migrations against in-memory SQLite.

There is a test that parses the frontend's `invoke` calls and the Rust
command list and fails if the two disagree on a command name or an argument key.
Tauri resolves both at runtime, so without it a renamed command is a
production-only failure.

Before opening a pull request, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Architecture

A React and TypeScript frontend over a Rust backend, with SQLite in between. The
frontend never calls Tauri directly; it goes through a service layer, which is
what makes the IPC contract testable.

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the pieces fit together.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — where new code should go.

## About

Wolf was built with moderately heavy assistance from AI coding tools (OpenCode). The design, testing, and direction are maintained by the project owner.

## Licence

MIT. See [LICENSE](LICENSE).
