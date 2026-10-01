import { useEffect, useState } from "react";
import { Panel, ErrorNote, Field } from "../../components/ui";
import {
  configureOllama,
  useOllamaStore,
  useOllamaSummary,
} from "../assistant/ollamaStore";
import { useWolfStore } from "../wolf/wolfStore";
import { DEFAULT_SETTINGS, useSettingsStore } from "./settingsStore";
import { DesktopSettings } from "./DesktopSettings";
import { FocusSettings } from "./FocusSettings";
import { NotificationSettings } from "./NotificationSettings";
import { OllamaSettings } from "./OllamaSettings";
import { Row } from "./SettingsFields";
import { desktopService } from "../../services/desktop";
import type { EnvironmentInfo, Settings } from "../../types";

export function SettingsPage() {
  const store = useSettingsStore();
  const settings = store.settings;
  const ollama = useOllamaSummary();
  const [env, setEnv] = useState<EnvironmentInfo | null>(null);

  useEffect(() => {
    void desktopService
      .environment()
      .then(setEnv)
      .catch(() => setEnv(null));
  }, []);

  useEffect(() => {
    configureOllama(settings.ollamaUrl, settings.ollamaModel);
  }, [settings.ollamaUrl, settings.ollamaModel]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    void store.update({ [key]: value } as Partial<Settings>);
  };

  const resetAll = () => {
    void store.update(DEFAULT_SETTINGS);
    useWolfStore.getState().pushShared("all-clear");
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
        <OllamaSettings
          settings={settings}
          set={set}
          onSelectModel={(model) => void store.selectModel(model)}
        />
      </Panel>

      <Panel title="Focus timer">
        <FocusSettings settings={settings} set={set} />
      </Panel>

      <Panel title="Desktop">
        <DesktopSettings settings={settings} set={set} onReset={resetAll} />
      </Panel>

      <Panel title="Notifications">
        <NotificationSettings settings={settings} env={env} set={set} />
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
