/**
 * Desktop integration: windows, tray bridge, environment reporting.
 *
 * UI components call these helpers rather than touching window APIs directly, so
 * the desktop behaviour is testable and lives in exactly one place.
 */
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke, isDesktop } from "./ipc";
import { isWolfSignal, type WolfSignal } from "../assets/wolf/animation";
import type { EnvironmentInfo, TrayPayload } from "../types";

/** Event emitted by the Rust tray module. */
export const TRAY_EVENT = "wolf://tray";
/** Emitted when the companion window could not be created. */
export const COMPANION_ERROR_EVENT = "wolf://companion-error";
/**
 * Carries a wolf signal between windows.
 *
 * The main and companion windows are separate webviews with separate JS
 * contexts, so each has its own copy of the wolf store. Without this event the
 * companion would never learn that the assistant started speaking.
 */
export const WOLF_SIGNAL_EVENT = "wolf://signal";

export const desktopService = {
  isDesktop,

  showMain(): Promise<void> {
    return invoke<void>("show_main_window");
  },

  hideMain(): Promise<void> {
    return invoke<void>("hide_main_window");
  },

  async setCompanionVisible(visible: boolean): Promise<boolean> {
    return invoke<boolean>("set_companion_visible", { visible });
  },

  toggleCompanion(): Promise<boolean> {
    return invoke<boolean>("toggle_companion");
  },

  setCompanionAlwaysOnTop(value: boolean): Promise<void> {
    return invoke<void>("set_companion_always_on_top", { value });
  },

  saveCompanionPosition(): Promise<void> {
    return invoke<void>("save_companion_position");
  },

  quit(): Promise<void> {
    return invoke<void>("quit_app");
  },

  environment(): Promise<EnvironmentInfo> {
    return invoke<EnvironmentInfo>("environment");
  },

  /** Subscribe to tray activations. Returns an unsubscribe function. */
  onTray(handler: (payload: TrayPayload) => void): Promise<UnlistenFn> {
    if (!isDesktop) return Promise.resolve(() => undefined);
    return listen<TrayPayload>(TRAY_EVENT, (event) => handler(event.payload));
  },

  onCompanionError(handler: (message: string) => void): Promise<UnlistenFn> {
    if (!isDesktop) return Promise.resolve(() => undefined);
    return listen<string>(COMPANION_ERROR_EVENT, (event) =>
      handler(event.payload),
    );
  },

  /** Ask the companion window to change size (used by the scale setting). */
  async requestCompanionResize(scale: number): Promise<void> {
    if (!isDesktop) return;
    await emit("wolf://companion-scale", { scale });
  },

  /**
   * Tell the other windows that a wolf signal happened.
   *
   * Failures are swallowed on purpose: the local store has already been
   * updated, and a companion window that is closed or mid-teardown must not
   * turn a cosmetic signal into a rejected promise.
   */
  async broadcastWolfSignal(signal: WolfSignal): Promise<void> {
    if (!isDesktop) return;
    try {
      await emit(WOLF_SIGNAL_EVENT, signal);
    } catch {
      // No other window is listening, or the event channel is unavailable.
    }
  },

  /** Subscribe to wolf signals from the other windows. */
  onWolfSignal(handler: (signal: WolfSignal) => void): Promise<UnlistenFn> {
    if (!isDesktop) return Promise.resolve(() => undefined);
    return listen<unknown>(WOLF_SIGNAL_EVENT, (event) => {
      // Signals arrive as untyped JSON; anything unexpected is dropped rather
      // than allowed to resolve to an arbitrary pose.
      if (!isWolfSignal(event.payload)) return;
      handler(event.payload);
    });
  },
};
