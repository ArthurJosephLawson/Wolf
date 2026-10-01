import { useEffect, useMemo } from "react";
import { useWolfFrame } from "./useWolfFrames";
import { useWolfStore } from "./wolfStore";
import { useSettingsStore } from "../settings/settingsStore";
import { useOllamaSummary } from "../assistant/ollamaStore";
import { desktopService } from "../../services/desktop";
import { WolfSprite } from "./WolfSprite";
import { greeting } from "../../app/uiStore";

const MAX_BUBBLE = 46;

export function Companion() {
  const state = useWolfStore((s) => s.state);
  const { frame, label } = useWolfFrame(state);
  const scale = useSettingsStore((s) => s.settings.companionScale);
  const userName = useSettingsStore((s) => s.settings.userName);
  const alwaysOnTop = useSettingsStore((s) => s.settings.companionAlwaysOnTop);
  const ollama = useOllamaSummary();

  useEffect(() => {
    const id = window.setInterval(
      () => useWolfStore.getState().reevaluate(),
      1_000,
    );
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void desktopService
      .onWolfSignal((signal) => {
        useWolfStore.getState().push(signal);
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const bubble = useMemo(() => {
    const text = ollama.checking ? label : ollama.label;
    return text.length <= MAX_BUBBLE
      ? text
      : `${text.slice(0, MAX_BUBBLE - 1)}…`;
  }, [ollama.checking, ollama.label, label]);

  const openMain = () => {
    void desktopService.showMain();
  };

  const poke = () => {
    useWolfStore.getState().pushShared("poked");
  };

  const hideSelf = () => {
    void desktopService.setCompanionVisible(false);
  };

  const toggleTop = () => {
    void desktopService.setCompanionAlwaysOnTop(!alwaysOnTop);
    void useSettingsStore
      .getState()
      .update({ companionAlwaysOnTop: !alwaysOnTop });
  };

  return (
    <div
      className="companion-root"
      data-tauri-drag-region
      onDoubleClick={openMain}
      title={`${greeting(userName)} — ${label}`}
    >
      <div className="companion-root__bubble" data-tauri-drag-region>
        {bubble}
      </div>

      <div
        onClick={poke}
        role="button"
        tabIndex={0}
        aria-label={`Pet Wolf. Currently: ${label}`}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            poke();
          }
        }}
      >
        <WolfSprite frame={frame} scale={2.6 * scale} />
      </div>

      <div className="companion-root__tools">
        <button
          type="button"
          className="companion-tool"
          onClick={openMain}
          title="Open Wolf"
          aria-label="Open the main Wolf window"
        >
          ⌂
        </button>
        <button
          type="button"
          className="companion-tool"
          onClick={toggleTop}
          aria-pressed={alwaysOnTop}
          title={alwaysOnTop ? "Always on top: on" : "Always on top: off"}
        >
          {alwaysOnTop ? "▣" : "▢"}
        </button>
        <button
          type="button"
          className="companion-tool"
          onClick={hideSelf}
          title="Hide Wolf"
          aria-label="Hide Wolf"
        >
          ×
        </button>
      </div>
    </div>
  );
}
