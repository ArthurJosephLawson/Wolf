/**
 * Frame-accurate pixel animation with no continuous render loop.
 *
 * Two independent timers drive the companion:
 *
 * - a self-rescheduling timeout that advances the current state's frames using
 *   per-frame durations, so a hold frame and a 100ms frame can coexist; and
 * - while idle, a second timer that fires a blink every 3-6 seconds.
 *
 * Both are cleared on unmount, so an idle window costs one short timeout every
 * few seconds and nothing else.
 */
import { useEffect, useState } from "react";
import { frameDurations, nextBlinkDelay } from "../../assets/wolf/animation";
import {
  framesFor,
  WOLF_STATE_LABELS,
  type Matrix,
  type WolfState,
} from "../../assets/wolf/sprites";

interface WolfFrameView {
  frame: Matrix;
  index: number;
  count: number;
  label: string;
}

/** Used only if a state's duration list ever comes back short. */
const DEFAULT_STEP_MS = 120;

export function useWolfFrame(state: WolfState): WolfFrameView {
  const [index, setIndex] = useState(0);
  const [blinkIndex, setBlinkIndex] = useState<number | null>(null);
  const [renderedState, setRenderedState] = useState(state);

  // Restart the animation when the companion changes state. Adjusting during
  // render rather than in an effect avoids the extra commit an effect reset
  // would cause, and the discarded render is cheap here.
  if (renderedState !== state) {
    setRenderedState(state);
    setIndex(0);
    setBlinkIndex(null);
  }

  const frames = framesFor(state);
  const count = frames.length;

  useEffect(() => {
    if (count <= 1) return;
    const durations = frameDurations(state, count);
    let frame = 0;
    let timer = 0;

    const step = () => {
      frame = (frame + 1) % count;
      setIndex(frame);
      timer = window.setTimeout(step, durations[frame] ?? DEFAULT_STEP_MS);
    };

    timer = window.setTimeout(step, durations[0] ?? DEFAULT_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [state, count]);

  useEffect(() => {
    // Only the resting wolf blinks. Any other state is already busy, and the
    // render below ignores a half-finished blink.
    if (state !== "idle") return;

    const blinkFrames = framesFor("blink");
    let phase = 0;
    let timer = 0;

    const playBlink = () => {
      phase = 0;
      const advance = () => {
        if (phase >= blinkFrames.length) {
          setBlinkIndex(null);
          schedule();
          return;
        }
        setBlinkIndex(phase);
        phase += 1;
        timer = window.setTimeout(advance, 100);
      };
      advance();
    };

    const schedule = () => {
      timer = window.setTimeout(playBlink, nextBlinkDelay());
    };

    schedule();
    return () => window.clearTimeout(timer);
  }, [state]);

  const blinkFrames = framesFor("blink");
  const blinking = state === "idle" && blinkIndex !== null;
  const shown = blinking ? blinkFrames[blinkIndex!] : frames[index % count];

  return {
    frame: shown ?? frames[0]!,
    index: index % count,
    count,
    label: WOLF_STATE_LABELS[state],
  };
}
