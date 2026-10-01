import { Chip, Field } from "../../components/ui";
import { useOllamaStore, useOllamaSummary } from "../assistant/ollamaStore";
import { getOllamaClient } from "../assistant/ollamaStore";
import { DEFAULT_SETTINGS } from "./settingsStore";
import { useUiStore } from "../../app/uiStore";
import type { OllamaStatus, Settings } from "../../types";

export function OllamaSettings({
  settings,
  onSelectModel,
  set,
}: {
  settings: Settings;
  onSelectModel: (model: string) => void;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}) {
  const status = useOllamaStore((s) => s.status);
  const check = useOllamaStore((s) => s.check);
  const ollama = useOllamaSummary();
  const toast = useUiStore((s) => s.pushToast);

  return (
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
            void check({
              url: settings.ollamaUrl,
              model: settings.ollamaModel,
            })
          }
        >
          {ollama.checking ? "Checking…" : "Check now"}
        </button>
        {status?.version ? (
          <span className="faint">daemon {status.version}</span>
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
          <ModelPicker
            status={status}
            settings={settings}
            onSelect={onSelectModel}
            set={set}
          />
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
  );
}

function ModelPicker({
  status,
  settings,
  onSelect,
  set,
}: {
  status: OllamaStatus | null;
  settings: Settings;
  onSelect: (model: string) => void;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}) {
  const installed = status?.models ?? [];
  if (installed.length === 0) {
    return (
      <input
        id="settings-ollama-model"
        className="input"
        value={settings.ollamaModel}
        onChange={(event) => set("ollamaModel", event.target.value)}
        spellCheck={false}
      />
    );
  }

  return (
    <select
      id="settings-ollama-model"
      className="select"
      value={settings.ollamaModel}
      onChange={(event) => onSelect(event.target.value)}
    >
      {!installed.some((model) => model.name === settings.ollamaModel) ? (
        <option value={settings.ollamaModel}>
          {settings.ollamaModel} (not installed)
        </option>
      ) : null}
      {installed.map((model) => (
        <option key={model.name} value={model.name}>
          {model.name}
        </option>
      ))}
    </select>
  );
}
