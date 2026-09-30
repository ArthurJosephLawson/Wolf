/**
 * Frame cadence for each wolf state.
 *
 * Kept separate from the sprite data so timing can be tuned without touching
 * the artwork, and so the animation loop can be tested without a DOM.
 *
 * Cadence is per frame rather than per state: the idle breath holds its widest
 * frame for 200ms while the rest of the cycle moves quickly, and that
 * distinction is not expressible with a single interval.
 */
import type { WolfState } from "./sprites";

/**
 * Milliseconds to hold each frame, in order. The list is aligned to
 * `framesFor(state)`; if the two ever disagree in length the shorter one
 * repeats, so timing can be tuned without a matching artwork change.
 */
export const FRAME_DURATIONS: Record<WolfState, readonly number[]> = {
  // 1200ms cycle with a 200ms hold on the fully inflated frame.
  idle: [300, 350, 200, 350],
  // 100ms per frame: a blink has to read as instant at any size.
  blink: [100, 100, 100],
  // Fast, so speech reads as continuous chattering.
  speaking: [120, 120, 120, 120],
  // Held longer: listening is patient, not twitchy.
  listening: [450, 200, 450],
  // Sparkle pops are quick, the settled pose is not.
  happy: [200, 200, 300, 300],
  // The squeeze lingers, the release does not.
  winking: [150, 400, 150],
  huffing: [200, 150, 300],
  puffing: [300, 300, 400],
  // Sad is the slowest: it should not feel busy.
  sad: [500, 500, 500, 500],
};

export interface FrameTiming {
  /** Milliseconds each frame is shown, in frame order. */
  durations: readonly number[];
  /** How long a state persists before falling back to `idle`. `null` = sticky. */
  ttlMs: number | null;
}

export const TIMINGS: Record<WolfState, FrameTiming> = {
  idle: { durations: FRAME_DURATIONS.idle, ttlMs: null },
  blink: { durations: FRAME_DURATIONS.blink, ttlMs: null },
  speaking: { durations: FRAME_DURATIONS.speaking, ttlMs: 30_000 },
  listening: { durations: FRAME_DURATIONS.listening, ttlMs: 20_000 },
  happy: { durations: FRAME_DURATIONS.happy, ttlMs: 6_000 },
  winking: { durations: FRAME_DURATIONS.winking, ttlMs: 2_000 },
  huffing: { durations: FRAME_DURATIONS.huffing, ttlMs: 8_000 },
  puffing: { durations: FRAME_DURATIONS.puffing, ttlMs: 20_000 },
  sad: { durations: FRAME_DURATIONS.sad, ttlMs: null },
};

/**
 * Frame durations aligned to the frame list actually produced for `state`.
 *
 * Guarded rather than trusted: a mismatch between artwork and timing is an easy
 * mistake to make, and it should degrade to a smooth loop instead of showing
 * `undefined` milliseconds.
 */
export function frameDurations(state: WolfState, frameCount: number): number[] {
  const pattern = FRAME_DURATIONS[state] ?? FRAME_DURATIONS.idle;
  return Array.from(
    { length: frameCount },
    (_, i) => pattern[i % pattern.length]!,
  );
}

/** Only reached if a state is ever given an empty duration list. */
const FALLBACK_FRAME_MS = 1_200;

export function frameInterval(state: WolfState): number {
  return TIMINGS[state]?.durations[0] ?? FALLBACK_FRAME_MS;
}

export function stateTtl(state: WolfState): number | null {
  return TIMINGS[state]?.ttlMs ?? null;
}

/**
 * A blink fires on its own while the wolf is idle, so the companion never
 * looks frozen. The range is the specified 3-6 seconds.
 */
export const BLINK_MIN_MS = 3_000;
export const BLINK_MAX_MS = 6_000;

export function nextBlinkDelay(random: () => number = Math.random): number {
  return BLINK_MIN_MS + random() * (BLINK_MAX_MS - BLINK_MIN_MS);
}

/**
 * Map a coarse signal to a wolf state.
 *
 * This is the "the wolf is not decoration" rule from the design: the
 * application's own state picks the pose.
 */
export type WolfSignal =
  | "default"
  | "thinking"
  | "speaking"
  | "focus-active"
  | "focus-paused"
  | "break-active"
  | "task-completed"
  | "task-created"
  | "all-clear"
  | "busy"
  | "poked"
  | "offline"
  | "sleep";

/**
 * Every accepted signal, as a runtime list.
 *
 * Signals cross the window boundary as plain strings, so the receiving end has
 * to be able to reject anything it does not recognise.
 */
export const WOLF_SIGNALS = [
  "default",
  "thinking",
  "speaking",
  "focus-active",
  "focus-paused",
  "break-active",
  "task-completed",
  "task-created",
  "all-clear",
  "busy",
  "poked",
  "offline",
  "sleep",
] as const satisfies readonly WolfSignal[];

export function isWolfSignal(value: unknown): value is WolfSignal {
  return (
    typeof value === "string" &&
    (WOLF_SIGNALS as readonly string[]).includes(value)
  );
}

export function resolveState(signal: WolfSignal): WolfState {
  // A failure is shown whatever else is happening.
  if (signal === "offline") return "sad";

  switch (signal) {
    case "speaking":
      return "speaking";
    case "thinking":
      return "puffing";
    case "focus-active":
      return "listening";
    case "busy":
      return "listening";
    case "focus-paused":
      return "huffing";
    case "break-active":
      return "happy";
    case "task-completed":
      return "happy";
    case "task-created":
      return "happy";
    case "all-clear":
      return "happy";
    case "poked":
      return "winking";
    case "sleep":
    case "default":
    default:
      return "idle";
  }
}
