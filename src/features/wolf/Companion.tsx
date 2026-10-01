/**
 * The floating companion window.
 *
 * A compact, always-on-top wolf that can be dragged around the desktop, shows
 * a one-line status bubble, and opens the main app on interaction.
 *
 * Dragging uses Tauri's start-dragging, which keeps the movement native (so the
 * window is dragged by the compositor, not emulated in JS) and works on both
 * Wayland and X11.
 */
import { useEffect, useMemo } from "react";
import { useWolfFrame } from "./useWolfFrames";
import { useWolfStore } from "./wolfStore";
import { useSettingsStore } from "../settings/settingsStore";
import { useOllamaSummary } from "../assistant/ollamaStore";
import { desktopService } from "../../services/desktop";
import { WolfSprite } from "./WolfSprite";
import { greeting } from "../../app/uiStore";

/** Keep the transcript short — the bubble is a status line, not a chat view. */
const MAX_BUBBLE = 46;

export function Companion() {
  const state = useWolfStore((s) => s.state);
  const { frame, label } = useWolfFrame(state);
  const scale = useSettingsStore((s) => s.settings.companionScale);
  const userName = useSettingsStore((s) => s.settings.userName);
  const alwaysOnTop = useSettingsStore((s) => s.settings.companionAlwaysOnTop);
  const ollama = useOllamaSummary();

  // The companion is its own window, so it needs its own periodic re-evaluation
  // for transient state expiry and quiet-hours changes.
  useEffect(() => {
    const id = window.setInterval(
      () => useWolfStore.getState().reevaluate(),
      1_000,
    );
    return () => window.clearInterval(id);
  }, []);

  // Its store is a separate copy from the main window's, so the main window's
  // signals have to arrive over the event channel to reach this window.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void desktopService
      .onWolfSignal((signal) => {
        useWolfStore.getState().push(signal);
      })
      .then((fn) => {
        // The effect may have been cleaned up while the listen was in flight.
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Derived, not stored: the bubble is whichever of these two strings applies.
  const bubble = useMemo(() => {
    const text = ollama.checking ? label : ollama.label;
    return text.length <= MAX_BUBBLE
      ? text
      : `${text.slice(0, MAX_BUBBLE - 1)}…`;
  }, [ollama.checking, ollama.label, label]);

  const openMain = () => {
    void desktopService.showMain();
  };

  /** Petting the wolf is a real interaction, not decoration. */
  const poke = () => {
    // Broadcast too, so the wolf reacts in the main window as well. Receiving
    // uses `push` rather than `pushShared`, so this cannot echo.
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
