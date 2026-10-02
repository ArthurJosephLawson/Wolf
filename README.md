# Wolf

**A pixel-art productivity companion for your Linux desktop.** Tasks, habits, a calendar, a focus timer and a local AI assistant, with a wolf that reacts to what you're doing.

![Version](https://img.shields.io/badge/version-0.1.0-blue) ![Platform](https://img.shields.io/badge/platform-Linux-lightgrey) ![Licence](https://img.shields.io/badge/licence-MIT-green)

<!-- Add a screenshot or GIF here: docs/images/wolf-demo.gif -->

Everything is stored in a SQLite database on your own machine. The only thing that ever leaves the app is a question you ask the assistant, and that goes to an [Ollama](https://ollama.com) daemon you run yourself on localhost.

> **Status:** v0.1.0, Linux only, in active development. There is no prebuilt download yet. Build from source (below).

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Setting up the assistant](#setting-up-the-assistant)
- [Privacy](#privacy)
- [Look and feel](#look-and-feel)
- [Development](#development)
- [Architecture](#architecture)
- [About this project](#about-this-project)
- [Licence](#licence)

## Features

- **Tasks.** Capture, prioritise, and filter by day, project or status. Tasks without a due date aren't lost; they sort last.
- **Habits.** Daily, weekday or weekly frequencies, with current and longest streaks and a 28-day completion grid. Undoing a day recalculates the streak correctly.
- **Calendar.** Events with month and day views. Reminders arrive through your desktop's notification service, at a lead time you set per event.
- **Focus.** A Pomodoro-style timer with configurable block and break lengths. Completed sessions are recorded, and a sparkline shows the last seven days. Days follow *your local midnight*, not UTC, so a session ending just after midnight lands on the right day.
- **Assistant (optional).** Ask a question in plain language. Wolf classifies the intent, gathers the relevant tasks, habits, events and focus history, and sends them with your question to a local Ollama model, so the answer is about *your* week rather than generic advice.
- **The wolf.** Nine poses and 31 frames, all generated from a single 28x28 character matrix. It lives in its own transparent window that floats over whatever you're doing, and you can scale, move and pin it. It blinks while you listen, talks while it thinks, and looks sad when Ollama is down.

## Quick start

### Requirements

- Linux
- Node 20 or newer
- Rust 1.82 or newer
- On Debian/Ubuntu, Tauri's system libraries:

```bash
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl \
    wget file libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev \
    patchelf
```

  Other distributions and the full dependency list are in [CONTRIBUTING.md](CONTRIBUTING.md).

### Run from source

```bash
git clone https://github.com/ArthurJosephLawson/Wolf.git
cd Wolf
npm install
npm run dev
```

### Build installers

```bash
npm run build
```

This produces a `.deb` and an AppImage in `src-tauri/target/release/bundle/`.

## Setting up the assistant

Wolf works fully without the assistant. If the daemon isn't running, the assistant screen says so plainly.

1. Install [Ollama](https://ollama.com).
2. Start it: `ollama serve`
3. Pull a small model. Wolf suggests `qwen2.5-coder`, but any model Ollama has will do:

```bash
   ollama pull qwen2.5-coder
```

4. Open **Settings** and check the daemon status. If it says *ready*, you're done.

## Privacy

Wolf has no account, no sync and no telemetry. Its only network traffic is to the Ollama daemon you configure.

- **Local storage.** Your data lives in a SQLite file in your platform's user data directory.
- **Loopback only.** When you save the Ollama base URL, Wolf accepts only `http://localhost` and `http://127.0.0.1`. Any other address is rejected, not stored. This is the core of the privacy model, not a port-safety measure: every assistant question embeds your tasks, habits, calendar and focus history, so a remote URL would mean silently sending that data off your machine.
- **What the assistant sees.** If you use the assistant, that data is included in the prompt sent to your local model. That's the feature working as intended. It stays on your machine, but the prompt does contain it.

## Look and feel

The interface uses a single dark palette taken from the wolf's own eight colours: the sprite's fur is the interface's outline, its cream is the text, and its pink cheek is the accent. There is no green or amber. Blue reads as fine, cream as attention, and pink as a problem.

## Development

```bash
npm run verify       # typecheck, lint, vitest, cargo check, cargo test
npm run dev:web      # frontend only, in a browser, against a stubbed bridge
npm run test         # 114 frontend tests
npm run rust:test    # 81 Rust tests
```

Neither test suite needs a display, a running Ollama daemon or a database file. The Rust tests run the real migrations against in-memory SQLite.

One test parses the frontend's `invoke` calls and the Rust command list, and fails if they disagree on a command name or argument key. Tauri resolves both at runtime, so without this check a renamed command would only fail in production.

Before opening a pull request, read [CONTRIBUTING.md](CONTRIBUTING.md).

## Architecture

A React and TypeScript frontend over a Rust backend, with SQLite in between. The frontend never calls Tauri directly; it goes through a service layer, which is what makes the IPC contract testable.

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): how the pieces fit together
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md): where new code should go

## About this project

Wolf was built with moderately heavy assistance from AI coding tools (OpenCode). Design, testing and direction are maintained by the project owner.

## Licence

MIT. See [LICENSE](LICENSE).
