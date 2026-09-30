/**
 * Settings store.
 *
 * The single source of truth for user preferences. Settings are loaded once at
 * startup from SQLite and written back on every change, so there is exactly one
 * copy of the truth.
 */
import { create } from "zustand";
import { settingsService } from "../services/database/settingsService";
import { toAppError } from "../services/errors";
import type { Settings } from "../types";

export const DEFAULT_SETTINGS: Settings = {
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "qwen2.5-coder",
  fallbackModel: "gemma2:2b",
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsBeforeLongBreak: 4,
  notificationsEnabled: true,
  habitRemindersEnabled: false,
  eventRemindersEnabled: true,
  companionEnabled: true,
  companionAlwaysOnTop: true,
  companionScale: 1,
  companionX: null,
  companionY: null,
  startMinimized: false,
  closeToTray: true,
  autoCheckOllama: true,
  userName: "",
};

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  saving: boolean;
  error: string | null;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
  selectModel: (model: string) => Promise<void>;
  clearError: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  saving: false,
  error: null,

  async load() {
    try {
      const settings = await settingsService.get();
      set({ settings, loaded: true, error: null });
    } catch (error) {
      // Never block the app on settings: fall back to defaults and say why.
      set({
        settings: DEFAULT_SETTINGS,
        loaded: true,
        error: toAppError(error, "Wolf could not load your settings.").message,
      });
    }
  },

  async update(patch) {
    const previous = get().settings;
    const optimistic = { ...previous, ...patch };
    set({ settings: optimistic, saving: true, error: null });

    try {
      const saved = await settingsService.save(optimistic);
      set({ settings: saved, saving: false });
    } catch (error) {
      set({
        settings: previous,
        saving: false,
        error: toAppError(error, "Wolf could not save that setting.").message,
      });
    }
  },

  async selectModel(model) {
    const previous = get().settings;
    set({ saving: true, error: null });
    try {
      const saved = await settingsService.selectModel(model);
      set({ settings: saved, saving: false });
    } catch (error) {
      set({
        settings: previous,
        saving: false,
        error: toAppError(error, "Wolf could not select that model.").message,
      });
    }
  },

  clearError() {
    set({ error: null });
  },
}));

/**
 * Focus durations, selected as primitives.
 *
 * Returning a fresh object from a selector would re-render on every store
 * change under `useSyncExternalStore`, so each field is subscribed separately.
 */
export function useFocusDurations(): Pick<
  Settings,
  | "focusMinutes"
  | "shortBreakMinutes"
  | "longBreakMinutes"
  | "sessionsBeforeLongBreak"
> {
  const focusMinutes = useSettingsStore((s) => s.settings.focusMinutes);
  const shortBreakMinutes = useSettingsStore(
    (s) => s.settings.shortBreakMinutes,
  );
  const longBreakMinutes = useSettingsStore((s) => s.settings.longBreakMinutes);
  const sessionsBeforeLongBreak = useSettingsStore(
    (s) => s.settings.sessionsBeforeLongBreak,
  );
  return {
    focusMinutes,
    shortBreakMinutes,
    longBreakMinutes,
    sessionsBeforeLongBreak,
  };
}
