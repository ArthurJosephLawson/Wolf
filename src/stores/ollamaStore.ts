/**
 * Ollama status store.
 *
 * Holds the daemon's health, the installed model list and the short status
 * copy the header renders. A stopped daemon is a *state*, not an error, so the
 * probe never rejects out of this store.
 */
import { create } from "zustand";
import { OllamaClient, describeStatus } from "../services/ollama/OllamaClient";
import { ollamaTransport } from "../services/ollama/transport";
import type { OllamaStatus } from "../types";

let client: OllamaClient | null = null;

function ensureClient(): OllamaClient {
  if (!client) {
    client = new OllamaClient({
      transport: ollamaTransport,
      config: { url: "http://localhost:11434", model: "qwen2.5-coder" },
    });
  }
  return client;
}

/** Point the shared client at the user's configuration. */
export function configureOllama(url: string, model: string): void {
  ensureClient().update({ url, model });
}

export function getOllamaClient(): OllamaClient {
  return ensureClient();
}

interface OllamaStore {
  status: OllamaStatus | null;
  checking: boolean;
  error: string | null;
  check: (options?: { url?: string; model?: string }) => Promise<OllamaStatus>;
}

export const useOllamaStore = create<OllamaStore>((set, get) => ({
  status: null,
  checking: false,
  error: null,

  async check(options) {
    set({ checking: true, error: null });
    try {
      const status = await ensureClient().status({
        url: options?.url,
        model: options?.model,
      });
      set({ status, checking: false, error: null });
      return status;
    } catch (error) {
      // `OllamaClient.status` already converts failures into an offline status;
      // reaching here means something unexpected happened.
      const message =
        error instanceof Error ? error.message : "Wolf could not check Ollama.";
      set({ checking: false, error: message });
      return (
        get().status ?? {
          state: "offline",
          url: options?.url ?? "http://localhost:11434",
          model: options?.model ?? null,
          models: [],
          version: null,
          detail: message,
          checkedAt: new Date().toISOString(),
        }
      );
    }
  },
}));

export function useOllamaSummary(): {
  label: string;
  hint: string;
  tone: "ok" | "warn" | "off";
  checking: boolean;
} {
  const status = useOllamaStore((s) => s.status);
  const checking = useOllamaStore((s) => s.checking);
  const described = describeStatus(status);
  return { ...described, checking };
}
