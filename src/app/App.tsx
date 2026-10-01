import { useEffect, useMemo } from "react";
import { useTaskStore } from "../features/tasks/taskStore";
import { HomePage } from "../features/home/HomePage";
import { TasksPage } from "../features/tasks/TasksPage";
import { HabitsPage } from "../features/habits/HabitsPage";
import { CalendarPage } from "../features/calendar/CalendarPage";
import { FocusPage } from "../features/focus/FocusPage";
import { AssistantPage } from "../features/assistant/AssistantPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { useSettingsStore } from "../features/settings/settingsStore";
import {
  useOllamaStore,
  useOllamaSummary,
  configureOllama,
} from "../features/assistant/ollamaStore";
import { useFocusStore } from "../features/focus/focusStore";
import { useWolfStore } from "../features/wolf/wolfStore";
import { isDesktop } from "../services/ipc";
import { NAV } from "./nav";
import { StandaloneNotice } from "./StandaloneNotice";
import { ToastHost } from "./ToastHost";
import { useDesktopEvents } from "./useDesktopEvents";
import { useReminderSweep } from "./useReminderSweep";
import { useRouteKeys } from "./useRouteKeys";
import { useUiStore } from "./uiStore";

export function App() {
  const route = useUiStore((s) => s.route);
  const setRoute = useUiStore((s) => s.setRoute);
  const settings = useSettingsStore((s) => s.settings);
  const loadSettings = useSettingsStore((s) => s.load);
  const ollama = useOllamaSummary();
  const checkOllama = useOllamaStore((s) => s.check);

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

  useEffect(() => {
    document.documentElement.dataset.window = "main";
    document.body.dataset.window = "main";
  }, []);

  useEffect(() => {
    const id = window.setInterval(
      () => useWolfStore.getState().reevaluate(),
      1_000,
    );
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    useFocusStore.getState().init(settings);
  }, [settings]);

  useReminderSweep(settings);
  useDesktopEvents();
  useRouteKeys();

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

  if (!isDesktop) {
    return <StandaloneNotice />;
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
