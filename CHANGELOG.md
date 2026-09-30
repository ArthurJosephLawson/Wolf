# Changelog

All notable changes to Wolf are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.1.0] - 2026-09-30

First public release. Wolf is a local-first desktop companion for tasks, habits,
a calendar, focus sessions, and a local AI assistant. Everything is stored in a
SQLite database in your user data directory; nothing is sent anywhere except to
the Ollama daemon you configure, which must be on loopback.

### Added

- **Task, habit, calendar and focus tracking**, each with a dashboard, filters,
  and overview statistics.
- **Focus timer** with configurable block and break lengths, a Pomodoro-style
  session cycle, and a 7-day sparkline of completed minutes.
- **Local AI assistant** backed by Ollama. Questions are classified by intent and
  grounded with a block of your own tasks, habits, events and focus history before
  the model sees them, so the answers are about your day rather than in general.
  You choose the context the model receives by choosing the question.
- **Event reminders**, delivered through your desktop's notification service at a
  lead time you set per event.
- **Habit streaks and a 28-day completion grid**, with daily, weekday and weekly
  frequencies.
- **A pixel-art wolf companion** that reacts to what you are doing. The sprite is
  authored as a 28x28 character matrix and every one of its 32 frames is generated
  from that single source, so the artwork cannot drift between poses. It lives in
  its own transparent window and can be sized, renamed and positioned freely.
- **System tray integration**, with close-to-tray behaviour and a menu for
  toggling the companion.
- **A generated icon set** from the same sprite data, including tray bitmaps and
  favicons, produced by a script with no image library dependency.
- **IPC contract test.** `ipcContract.test.ts` parses the frontend's `invoke`
  calls and the Rust `generate_handler!` list and fails if the two disagree on a
  command name or an argument key, closing a gap neither the type system nor the
  compiler checks.

### Fixed

- **Focus statistics were bucketed by UTC date.** A session at 23:30 and one at
  00:30 the next morning could both be counted on the same day for most
  timezones. Sessions are now grouped into seven local-day windows, and the
  boundary case is covered by tests in two timezones.
- **Ollama base URLs were not checked.** The app claimed to refuse anything but
  `http://localhost` or `http://127.0.0.1`, but nothing enforced it, so a
  configured host would receive your prompts. The URL is now validated when it is
  saved and a non-loopback host is refused.
- **The assistant's context was never sent.** The grounding code existed and was
  unit tested, but the frontend never called it, so the model answered without
  any of your data. The screen now resolves the context it displays and sends
  exactly that.
- **Event reminders were never delivered.** The sweep existed in Rust and was
  exposed to the frontend, but nothing polled it. It now runs on startup and
  every 30 seconds, gated on your settings and guarded against overlapping runs.

### Changed

- Removed the `theme` setting. It was persisted and offered in the UI, but no
  value of it changed any colour, so it advertised a choice that did not exist.
  Existing databases keep their other settings.
- Removed the unused `assistant_suggestions` command, which had drifted away from
  the assistant screen's own copy of the same list.

### Removed

- Unused exports (`TIMER_STATUSES`, `progressLabel`, `lastCheckedAt`), an
  unused keyframe animation, two unreferenced type aliases, an unused
  dev-dependency, and two empty directories.

[Unreleased]: https://github.com/ArthurJosephLawson/Wolf/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ArthurJosephLawson/Wolf/releases/tag/v0.1.0
