/**
 * Typed error handling for the Tauri bridge.
 *
 * Rust serialises every failure as `{ kind, message }` with a message written
 * for humans. The UI never shows a stack trace or a raw HTTP error; if a
 * rejection is not a `WolfError`, we map it to a generic message here rather
 * than leaking it.
 */
import type { WolfErrorShape } from "../types";

export class WolfAppError extends Error {
  readonly kind: string;

  constructor(kind: string, message: string) {
    super(message);
    this.name = "WolfAppError";
    this.kind = kind;
  }

  /** True when the local AI daemon is the problem. */
  get isOllamaIssue(): boolean {
    return [
      "unavailable",
      "no_models",
      "model_not_found",
      "transport",
      "timeout",
      "bad_status",
      "malformed",
    ].includes(this.kind);
  }

  get isNotFound(): boolean {
    return this.kind === "not_found";
  }
}

export function toAppError(
  unknown: unknown,
  fallback = "Wolf hit an unexpected problem.",
): WolfAppError {
  if (unknown instanceof WolfAppError) return unknown;

  if (typeof unknown === "object" && unknown !== null) {
    const candidate = unknown as Partial<WolfErrorShape> & {
      message?: unknown;
    };
    if (
      typeof candidate.message === "string" &&
      typeof candidate.kind === "string"
    ) {
      return new WolfAppError(candidate.kind, candidate.message);
    }
    if (typeof candidate.message === "string") {
      return new WolfAppError("unknown", candidate.message);
    }
  }

  if (unknown instanceof Error) {
    return new WolfAppError("unknown", `${fallback} (${unknown.message})`);
  }

  return new WolfAppError("unknown", fallback);
}
