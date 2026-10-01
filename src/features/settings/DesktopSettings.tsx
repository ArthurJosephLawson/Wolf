import { Field } from "../../components/ui";
import { desktopService } from "../../services/desktop";
import { useUiStore } from "../../app/uiStore";
import { Toggle } from "./SettingsFields";
import type { Settings } from "../../types";

export function DesktopSettings({
  settings,
  set,
  onReset,
}: {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onReset: () => void;
}) {
  const toast = useUiStore((s) => s.pushToast);

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
            onReset();
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
  );
}
