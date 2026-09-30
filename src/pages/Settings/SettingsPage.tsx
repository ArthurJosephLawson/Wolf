/**
 * Settings screen.
 *
 * Every control writes through the settings store, which persists to SQLite
 * immediately and applies the parts that affect the desktop shell (companion
 * window, theme, notifications) as the value changes.
 */
import { useEffect, useState } from "react";
import { Panel, ErrorNote, Field, Chip } from "../../components/common/ui";
import { DEFAULT_SETTINGS, useSettingsStore } from "../../stores/settingsStore";
import {
  useOllamaStore,
  useOllamaSummary,
  configureOllama,
  getOllamaClient,
} from "../../stores/ollamaStore";
import { useUiStore } from "../../stores/uiStore";
import { useWolfStore } from "../../stores/wolfStore";
import { desktopService } from "../../services/desktop/desktopService";
import type { EnvironmentInfo, Settings } from "../../types";

const FOCUS_PRESETS = [15, 25, 45, 50, 90];

export function SettingsPage() {
  const store = useSettingsStore();
  const settings = store.settings;
  const ollamaStatus = useOllamaStore((s) => s.status);
  const checkOllama = useOllamaStore((s) => s.check);
  const ollama = useOllamaSummary();
  const toast = useUiStore((s) => s.pushToast);
  const [env, setEnv] = useState<EnvironmentInfo | null>(null);

  useEffect(() => {
    void desktopService
      .environment()
      .then(setEnv)
      .catch(() => setEnv(null));
  }, []);

  // Keep the shared AI client pointed at the user's configuration.
  useEffect(() => {
    configureOllama(settings.ollamaUrl, settings.ollamaModel);
  }, [settings.ollamaUrl, settings.ollamaModel]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    void store.update({ [key]: value } as Partial<Settings>);
  };

  const toggleCompanion = async (enabled: boolean) => {
    set("companionEnabled", enabled);
    try {
      await desktopService.setCompanionVisible(enabled);
      useUiStore.getState().setCompanionVisible(enabled);
    } catch {
      toast({
        tone: "warning",
        title: "Could not change the companion window",
      });
    }
  };

  return (
    <>
      <Panel title="Settings">
        <ErrorNote
          message={store.error ?? useOllamaStore.getState().error}
          onDismiss={store.clearError}
        />

        <div className="grid grid--2">
          <Field
            label="Your name"
            htmlFor="settings-name"
            hint="Used in greetings. Never sent anywhere."
          >
            <input
              id="settings-name"
              className="input"
              value={settings.userName}
              maxLength={40}
              onChange={(event) => set("userName", event.target.value)}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Local assistant (Ollama)">
        <div className="stack">
          <div className="row">
            <Chip tone={ollama.tone === "off" ? "danger" : ollama.tone}>
              {ollama.label}
            </Chip>
            <button
              type="button"
              className="btn btn--small"
              disabled={ollama.checking}
              onClick={() =>
                void checkOllama({
                  url: settings.ollamaUrl,
                  model: settings.ollamaModel,
                })
              }
            >
              {ollama.checking ? "Checking…" : "Check now"}
            </button>
            {ollamaStatus?.version ? (
              <span className="faint">daemon {ollamaStatus.version}</span>
            ) : null}
          </div>

          <p className="faint">{ollama.hint}</p>

          <div className="grid grid--2">
            <Field
              label="Ollama address"
              htmlFor="settings-ollama-url"
              hint="Wolf only ever talks to this address. Keep it local."
            >
              <input
                id="settings-ollama-url"
                className="input"
                value={settings.ollamaUrl}
                onChange={(event) => set("ollamaUrl", event.target.value)}
                placeholder="http://localhost:11434"
                spellCheck={false}
              />
            </Field>

            <Field
              label="Model"
              htmlFor="settings-ollama-model"
              hint="Installed on this machine."
            >
              {ollamaStatus && ollamaStatus.models.length > 0 ? (
                <select
                  id="settings-ollama-model"
                  className="select"
                  value={settings.ollamaModel}
                  onChange={(event) =>
                    void store.selectModel(event.target.value)
                  }
                >
                  {!ollamaStatus.models.some(
                    (model) => model.name === settings.ollamaModel,
                  ) ? (
                    <option value={settings.ollamaModel}>
                      {settings.ollamaModel} (not installed)
                    </option>
                  ) : null}
                  {ollamaStatus.models.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="settings-ollama-model"
                  className="input"
                  value={settings.ollamaModel}
                  onChange={(event) => set("ollamaModel", event.target.value)}
                  spellCheck={false}
                />
              )}
            </Field>
          </div>

          <div className="row">
            <button
              type="button"
              className="btn btn--small"
              onClick={() => void getOllamaClient().suggestedModel()}
            >
              Suggest a model
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                set("ollamaModel", DEFAULT_SETTINGS.fallbackModel);
                toast({
                  tone: "info",
                  title: "Model set",
                  body: DEFAULT_SETTINGS.fallbackModel,
                });
              }}
            >
              Use small fallback
            </button>
            <span className="faint">Current: {settings.ollamaModel}</span>
          </div>
        </div>
      </Panel>

      <Panel title="Focus timer">
        <div className="stack">
          <FocusField
            label="Focus length"
            value={settings.focusMinutes}
            presets={FOCUS_PRESETS}
            onChange={(value) => set("focusMinutes", value)}
          />
          <FocusField
            label="Short break"
            value={settings.shortBreakMinutes}
            presets={[3, 5, 8, 10]}
            onChange={(value) => set("shortBreakMinutes", value)}
          />
          <FocusField
            label="Long break"
            value={settings.longBreakMinutes}
            presets={[10, 15, 20, 30]}
            onChange={(value) => set("longBreakMinutes", value)}
          />
          <FocusField
            label="Sessions before a long break"
            value={settings.sessionsBeforeLongBreak}
            presets={[2, 3, 4, 5]}
            onChange={(value) => set("sessionsBeforeLongBreak", value)}
          />
        </div>
      </Panel>

      <Panel title="Desktop">
        <div className="stack">
          <Toggle
            label="Show the companion wolf"
            hint="A small always-on-top wolf you can drag around."
            checked={settings.companionEnabled}
            onChange={(value) => void toggleCompanion(value)}
          />
          <Toggle
            label="Companion stays on top"
            checked={settings.companionAlwaysOnTop}
            onChange={(value) => {
              set("companionAlwaysOnTop", value);
              void desktopService.setCompanionAlwaysOnTop(value);
            }}
          />
          <Field label="Companion size" htmlFor="settings-companion-scale">
            <input
              id="settings-companion-scale"
              type="range"
              min={0.6}
              max={2.4}
              step={0.1}
              value={settings.companionScale}
              onChange={(event) => {
                const scale = Number(event.target.value);
                set("companionScale", scale);
                void desktopService.requestCompanionResize(scale);
              }}
            />
            <span className="faint">{settings.companionScale.toFixed(1)}×</span>
          </Field>
          <Toggle
            label="Close to tray"
            hint="Closing the window keeps Wolf running in the tray."
            checked={settings.closeToTray}
            onChange={(value) => set("closeToTray", value)}
          />
          <Toggle
            label="Start minimised"
            checked={settings.startMinimized}
            onChange={(value) => set("startMinimized", value)}
          />
          <div className="row">
            <button
              type="button"
              className="btn btn--small"
              onClick={() => void desktopService.saveCompanionPosition()}
            >
              Remember companion position
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => void desktopService.showMain()}
            >
              Show main window
            </button>
            <button
              type="button"
              className="btn btn--small btn--danger"
              onClick={() => {
                void store.update(DEFAULT_SETTINGS);
                useWolfStore.getState().pushShared("all-clear");
                toast({
                  tone: "success",
                  title: "Settings reset",
                  body: "Back to Wolf's defaults.",
                });
              }}
            >
              Reset all settings
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="Notifications">
        <div className="stack">
          <Toggle
            label="Notifications"
            hint={
              env?.notificationsAvailable === false
                ? "No notification service detected on this desktop."
                : undefined
            }
            checked={settings.notificationsEnabled}
            disabled={env?.notificationsAvailable === false}
            onChange={(value) => set("notificationsEnabled", value)}
          />
          <Toggle
            label="Event reminders"
            checked={settings.eventRemindersEnabled}
            onChange={(value) => set("eventRemindersEnabled", value)}
          />
          <Toggle
            label="Daily habit reminder"
            checked={settings.habitRemindersEnabled}
            onChange={(value) => set("habitRemindersEnabled", value)}
          />
          <Toggle
            label="Check Ollama on startup"
            checked={settings.autoCheckOllama}
            onChange={(value) => set("autoCheckOllama", value)}
          />
        </div>
      </Panel>

      <Panel title="About">
        {env ? (
          <ul className="list">
            <Row label="Version" value={env.appVersion} />
            <Row label="Session" value={env.sessionType} />
            <Row label="Desktop" value={env.desktop} />
            <Row label="Data directory" value={env.dataDir} />
            <Row
              label="Notifications"
              value={env.notificationsAvailable ? "available" : "unavailable"}
            />
            <Row label="Assistant" value={ollama.label} />
          </ul>
        ) : (
          <p className="faint">Loading environment…</p>
        )}
        <p className="faint" style={{ marginTop: 8 }}>
          Wolf stores everything locally in SQLite. No accounts, no telemetry,
          no network calls other than the Ollama address above.
        </p>
      </Panel>
    </>
  );
}

function FocusField({
  label,
  value,
  presets,
  onChange,
}: {
  label: string;
  value: number;
  presets: readonly number[];
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [renderedValue, setRenderedValue] = useState(value);

  // If the value changed elsewhere (a preset, or a reset), drop the stale draft
  // during render instead of in an effect that would repaint it.
  if (renderedValue !== value) {
    setRenderedValue(value);
    setDraft(String(value));
  }

  return (
    <div className="row">
      <span className="field__label" style={{ minWidth: 190 }}>
        {label}
      </span>
      <div className="row" style={{ gap: 2 }}>
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`btn btn--small${preset === value ? " btn--primary" : " btn--ghost"}`}
            onClick={() => onChange(preset)}
            aria-pressed={preset === value}
          >
            {preset}
          </button>
        ))}
      </div>
      <label className="visually-hidden" htmlFor={`focus-${label}`}>
        {label} in minutes
      </label>
      <input
        id={`focus-${label}`}
        className="input"
        style={{ width: 76 }}
        type="number"
        min={1}
        max={180}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const parsed = Number(draft);
          if (
            Number.isFinite(parsed) &&
            parsed >= 1 &&
            parsed <= 180 &&
            parsed !== value
          )
            onChange(Math.floor(parsed));
          else setDraft(String(value));
        }}
      />
      <span className="faint">min</span>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className="row"
      style={{
        gap: 8,
        alignItems: "flex-start",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        style={{ marginTop: 3 }}
      />
      <span>
        <span style={{ display: "block" }}>{label}</span>
        {hint ? <span className="faint">{hint}</span> : null}
      </span>
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="list__item" style={{ justifyContent: "space-between" }}>
      <span className="faint">{label}</span>
      <span style={{ wordBreak: "break-all" }}>{value}</span>
    </li>
  );
}
