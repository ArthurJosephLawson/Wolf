/**
 * Wolf state store.
 *
 * The wolf's pose is driven by real application signals, not by decoration.
 * A "signal" is pushed by whoever knows something happened (a task was
 * completed, the assistant started answering, a focus phase changed); this store
 * resolves it into a concrete {@link WolfState} with a time-to-live, so the
 * companion always settles back to `idle` on its own.
 */
import { create } from "zustand";
import type { WolfSignal } from "../assets/wolf/animation";
import { resolveState, stateTtl } from "../assets/wolf/animation";
import type { WolfState } from "../assets/wolf/sprites";
import { desktopService } from "../services/desktop/desktopService";

interface WolfStore {
  signal: WolfSignal;
  state: WolfState;
  /** Epoch ms when the current transient state should expire. */
  expiresAt: number | null;
  /** Monotonic id so the companion can restart its animation on repeat events. */
  pulse: number;

  /** Apply a signal in this window only. */
  push: (signal: WolfSignal) => void;
  /**
   * Apply a signal and tell the other windows about it.
   *
   * Used by the main window, which is the one that knows about what the app is
   * doing. The companion only ever receives.
   */
  pushShared: (signal: WolfSignal) => void;
  hold: (state: WolfState) => void;
  settle: () => void;
  /** Called on a timer; re-evaluates time-based rules like quiet hours. */
  reevaluate: () => void;
}

export const useWolfStore = create<WolfStore>((set, get) => ({
  signal: "default",
  state: resolveState("default"),
  expiresAt: null,
  pulse: 0,

  push(signal) {
    const now = Date.now();
    const resolved = resolveState(signal);
    // Read the TTL from the animation timings rather than a copy of them: a
    // second table here is what let `listening` end up without an expiry and
    // stick forever.
    const ttl = stateTtl(resolved);
    set((prev) => ({
      signal,
      state: resolved,
      expiresAt: ttl === null ? null : now + ttl,
      // Only bump for genuinely transient states so idle animation isn't reset.
      pulse: TRANSIENT.has(resolved) ? prev.pulse + 1 : prev.pulse,
    }));
  },

  pushShared(signal) {
    get().push(signal);
    void desktopService.broadcastWolfSignal(signal);
  },

  hold(state) {
    set({ signal: "default", state, expiresAt: null });
  },

  settle() {
    set({ signal: "default", state: resolveState("default"), expiresAt: null });
  },

  reevaluate() {
    const { signal, expiresAt } = get();
    if (expiresAt !== null && Date.now() >= expiresAt) {
      get().settle();
      return;
    }
    // Signals can be re-resolved as rules change; nothing is time-based today,
    // but the hook keeps the companion honest without a page having to know.
    const next = resolveState(signal);
    if (next !== get().state) set({ state: next });
  },
}));

const TRANSIENT = new Set<WolfState>([
  "speaking",
  "happy",
  "winking",
  "huffing",
  "puffing",
]);
