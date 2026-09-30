/**
 * The single Tauri IPC boundary.
 *
 * Nothing else in the app calls `invoke` directly. Keeping every command name
 * in one file means a renamed Rust command breaks the build here rather than at
 * runtime, and it makes the frontend trivially mockable in tests.
 *
 * `withGlobalTauri` is off, so IPC must go through the `@tauri-apps/api` module
 * imports, which talk to the injected `__TAURI_INTERNALS__` object. That object
 * only exists inside the shell, which is also what we use to detect the desktop
 * environment. A browser fallback lets `npm run dev:web` render a labelled
 * "desktop unavailable" view instead of a blank screen.
 */

import { invoke as tauriInvoke } from "@tauri-apps/api/core";

function hasTauriRuntime(): boolean {
  return (
    typeof (globalThis as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__ === "object"
  );
}

/** True when running inside the Tauri shell. */
export const isDesktop = hasTauriRuntime();

function unavailable(command: string): Promise<never> {
  return Promise.reject(
    new Error(
      `Wolf's native layer is not available (command: ${command}). Run the app with \`npm run dev\` so the Tauri shell is present.`,
    ),
  );
}

/** Invoke a Rust command. Rejects with `{ kind, message }` on failure. */
export function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isDesktop) return unavailable(command);
  return tauriInvoke<T>(command, args) as Promise<T>;
}
