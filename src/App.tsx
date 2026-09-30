/**
 * Main application shell.
 *
 * Owns startup (settings, theme, Ollama probe, tray wiring) and routing. Route
 * changes never reload data — each page loads itself once and reads from the
 * stores, so switching screens is instant.
 */
import { useEffect, useMemo } from "react";
import { ToastHost } from "./components/Notifications/ToastHost";
import { HomePage } from "./pages/Home/HomePage";
import { TasksPage } from "./pages/Tasks/TasksPage";
import { HabitsPage } from "./pages/Habits/HabitsPage";
import { CalendarPage } from "./pages/Calendar/CalendarPage";
import { FocusPage } from "./pages/Focus/FocusPage";
import { AssistantPage } from "./pages/Assistant/AssistantPage";
import { SettingsPage } from "./pages/Settings/SettingsPage";
import { useSettingsStore } from "./stores/settingsStore";
import {
  useOllamaStore,
  useOllamaSummary,
  configureOllama,
} from "./stores/ollamaStore";
import { useUiStore, greeting } from "./stores/uiStore";
import { useFocusStore } from "./stores/focusStore";
import { useTaskStore } from "./stores/taskStore";
import { useWolfStore } from "./stores/wolfStore";
import { desktopService } from "./services/desktop/desktopService";
import { calendarService } from "./services/database/calendarService";
import { MESSAGES, notify } from "./services/notifications/notify";
import { minutesUntil, pendingReminders } from "./utils/reminderLogic";
import { isDesktop } from "./services/desktop/bridge";
import type { Route } from "./types";

const NAV: readonly { route: Route; label: string; icon: string }[] = [
  { route: "home", label: "Today", icon: "◆" },
  { route: "tasks", label: "Tasks", icon: "✓" },
  { route: "habits", label: "Habits", icon: "◉" },
  { route: "calendar", label: "Calendar", icon: "▤" },
  { route: "focus", label: "Focus", icon: "◐" },
  { route: "assistant", label: "Assistant", icon: "? " },
  { route: "settings", label: "Settings", icon: "⚙" },
];

/** How often the reminder sweep runs. */
const REMINDER_INTERVAL_MS = 30_000;

export function App() {
  const route = useUiStore((s) => s.route);
  const setRoute = useUiStore((s) => s.setRoute);
  const pushToast = useUiStore((s) => s.pushToast);
  const settings = useSettingsStore((s) => s.settings);
  const loadSettings = useSettingsStore((s) => s.load);
  const ollama = useOllamaSummary();
  const checkOllama = useOllamaStore((s) => s.check);

  // Startup: settings first, because everything else depends on them.
  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    configureOllama(settings.ollamaUrl, settings.ollamaModel);
    if (settings.autoCheckOllama) {
      void checkOllama({
        url: settings.ollamaUrl,
        model: settings.ollamaModel,
      }).then((status) => {
        if (status.state === "offline")
          useWolfStore.getState().pushShared("offline");
        else if (status.state === "ready")
          useWolfStore.getState().pushShared("all-clear");
      });
    }
  }, [
    settings.ollamaUrl,
    settings.ollamaModel,
    settings.autoCheckOllama,
    checkOllama,
  ]);

  // `data-window` lets the CSS tell the main window from the companion, which
  // share one stylesheet but not one layout.
  useEffect(() => {
    document.documentElement.dataset.window = "main";
    document.body.dataset.window = "main";
  }, []);

  // The wolf needs periodic re-evaluation for time-based rules (quiet hours,
  // transient state expiry) in this window too.
  useEffect(() => {
    const id = window.setInterval(
      () => useWolfStore.getState().reevaluate(),
      1_000,
    );
    return () => window.clearInterval(id);
  }, []);

  // Focus store keeps its own copy of the durations.
  useEffect(() => {
    useFocusStore.getState().init(settings);
  }, [settings]);

  // Event reminders. The backend already filters on its own setting; the sweep
  // is gated here as well so a disabled toggle costs no polling at all.
  useEffect(() => {
    if (!isDesktop) return;
    if (!settings.eventRemindersEnabled || !settings.notificationsEnabled)
      return;

    let cancelled = false;
    // Delivery is awaited before the row is marked, so a slow notification
    // service must not let the next tick start a second sweep on the same rows.
    let inFlight = false;

    const sweep = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const due = await calendarService.dueReminders();
        if (cancelled) return;
        for (const event of pendingReminders(due, new Date())) {
          const minutes = minutesUntil(event.startTime, new Date());
          await notify(MESSAGES.eventSoon(event.title, minutes));
          if (cancelled) return;
          await calendarService.markNotified(event.id);
        }
      } catch {
        // Reminders are best-effort: a refused notification must not stop the
        // app or stop the next sweep.
      } finally {
        inFlight = false;
      }
    };

    void sweep();
    const id = window.setInterval(() => void sweep(), REMINDER_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    settings.eventRemindersEnabled,
    settings.notificationsEnabled,
  ]);

  // Tray menu and companion errors arrive as Tauri events. `listen` resolves
  // asynchronously, so the disposers are collected into a mutable holder and
  // drained on cleanup — including any that land after unmount.
  useEffect(() => {
    if (!isDesktop) return;
    const disposers: (() => void)[] = [];
    let cancelled = false;

    const track = (pending: Promise<() => void>) => {
      void pending.then((dispose) => {
        if (cancelled) dispose();
        else disposers.push(dispose);
      });
    };

    track(
      desktopService.onTray((payload) => {
        if (payload.route) setRoute(payload.route);
        else setRoute("home");
        if (payload.focus === "start") useFocusStore.getState().start();
        if (payload.focus === "pause") useFocusStore.getState().pause();
        void desktopService.showMain();
      }),
    );

    track(
      desktopService.onCompanionError((message) => {
        pushToast({
          tone: "error",
          title: "Companion window failed",
          body: message,
        });
      }),
    );

    return () => {
      cancelled = true;
      for (const dispose of disposers) dispose();
      disposers.length = 0;
    };
  }, [setRoute, pushToast]);

  const page = useMemo(() => {
    switch (route) {
      case "tasks":
        return <TasksPage />;
      case "habits":
        return <HabitsPage />;
      case "calendar":
        return <CalendarPage />;
      case "focus":
        return <FocusPage />;
      case "assistant":
        return <AssistantPage />;
      case "settings":
        return <SettingsPage />;
      case "home":
      default:
        return <HomePage />;
    }
  }, [route]);

  // Route with a keyboard shortcut: 1-7, ignoring text fields.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < NAV.length)
        setRoute(NAV[index]!.route);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setRoute]);

  if (!isDesktop) {
    return <Standalone />;
  }

  return (
    <div className="app-shell">
      <header className="titlebar" data-tauri-drag-region>
        <span className="titlebar__brand" data-tauri-drag-region>
          <span aria-hidden="true">🐺</span> WOLF
        </span>
        <span className="titlebar__spacer" data-tauri-drag-region />
        <span className="faint" title={ollama.hint}>
          <span
            className="wolf__dot"
            data-tone={ollama.tone}
            aria-hidden="true"
          />
          {ollama.label}
        </span>
      </header>

      <nav className="sidebar" aria-label="Sections">
        {NAV.map((item, index) => (
          <button
            key={item.route}
            type="button"
            className="sidebar__link"
            aria-current={route === item.route ? "page" : undefined}
            onClick={() => setRoute(item.route)}
            title={`${item.label} (${index + 1})`}
          >
            <span className="sidebar__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="sidebar__label">{item.label}</span>
          </button>
        ))}
        <span className="spacer" />
        <button
          type="button"
          className="sidebar__link"
          onClick={() => void useTaskStore.getState().load()}
          title="Refresh data"
        >
          <span className="sidebar__icon" aria-hidden="true">
            ⟳
          </span>
          <span className="sidebar__label">Refresh</span>
        </button>
      </nav>

      <main className="main scroll-y">
        <div className="main__inner">{page}</div>
      </main>

      <ToastHost />
    </div>
  );
}

/** Shown by `npm run dev:web` when there is no Tauri shell behind the page. */
function Standalone() {
  return (
    <div className="standalone-notice">
      <h1 style={{ marginBottom: 10 }}>Wolf needs its desktop shell</h1>
      <p>
        This page is the web frontend, but Wolf keeps its data in a local SQLite
        database and its AI features in a local Ollama daemon, both reached
        through Tauri. Start the app with:
      </p>
      <p>
        <code>npm run dev</code>
      </p>
      <p className="faint">
        {greeting("")} — frontend-only mode cannot read or write your tasks,
        habits or events.
      </p>
    </div>
  );
}
