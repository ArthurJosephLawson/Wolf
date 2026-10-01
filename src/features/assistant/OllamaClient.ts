/**
 * Ollama client.
 *
 * Wolf talks to a locally running `ollama serve` — by default
 * `http://localhost:11434`. There is no cloud fallback, no API key and no
 * proxying: if the daemon is unreachable, the user is told so plainly and the
 * rest of the application carries on.
 *
 * All I/O is delegated to an injected {@link OllamaTransport}, so the client's
 * decision logic can be tested without a daemon.
 */
import { toAppError, WolfAppError } from "../../lib/errors";
import {
  STATE_COPY,
  type AskRequest,
  type AssistantContext,
  type ChatMessage,
  type ChatResponse,
  type OllamaModel,
  type OllamaStatus,
  type OllamaTransport,
  type StreamEvent,
} from "./ollamaTypes";

export type {
  OllamaTransport,
  OllamaStatus,
  OllamaModel,
  AssistantContext,
  ChatMessage,
  ChatResponse,
  StreamEvent,
};

/** Configuration the client applies before every request. */
interface OllamaClientConfig {
  url: string;
  model: string;
}

interface OllamaClientOptions {
  transport: OllamaTransport;
  config: OllamaClientConfig;
}

export class OllamaClient {
  private transport: OllamaTransport;
  private config: OllamaClientConfig;

  constructor(options: OllamaClientOptions) {
    this.transport = options.transport;
    this.config = normaliseConfig(options.config);
  }

  get endpoint(): string {
    return this.config.url;
  }

  get model(): string {
    return this.config.model;
  }

  update(config: Partial<OllamaClientConfig>): void {
    this.config = normaliseConfig({ ...this.config, ...config });
  }

  /** Probe the daemon. Never throws for "not running" — that is a valid state. */
  async status(
    overrides: Partial<OllamaClientConfig> = {},
  ): Promise<OllamaStatus> {
    const url = overrides.url ?? this.config.url;
    const model = overrides.model ?? this.config.model;
    try {
      return await this.transport.status(url, model);
    } catch (error) {
      // A probe failure is reported as "offline" rather than an exception, so a
      // stopped daemon can never break the app.
      const appError = toAppError(
        error,
        "Wolf could not check the local Ollama service.",
      );
      return {
        state: "offline",
        url,
        model,
        models: [],
        version: null,
        detail: appError.message,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async listModels(
    overrides: Partial<OllamaClientConfig> = {},
  ): Promise<OllamaModel[]> {
    const status = await this.status(overrides);
    if (status.state === "offline") return [];
    return status.models;
  }

  async suggestedModel(): Promise<string> {
    try {
      return await this.transport.suggestedModel();
    } catch {
      return "qwen2.5-coder";
    }
  }

  /** Whether the assistant can actually be used right now. */
  async isReady(overrides: Partial<OllamaClientConfig> = {}): Promise<boolean> {
    const status = await this.status(overrides);
    return status.state === "ready";
  }

  /**
   * Resolve the `<local_context>` block and system prompt for a question.
   *
   * Purely a read: it assembles text from the local database and contacts no
   * model. The assistant screen calls this before streaming so the context that
   * will be sent is the one the user was shown, rather than a second
   * independently built copy.
   */
  async assistantContext(query: string): Promise<AssistantContext | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;
    try {
      return await this.transport.assistantContext(trimmed);
    } catch (error) {
      throw toAppError(error, "Wolf could not read your local data.");
    }
  }

  /** One-shot question, no streaming. */
  async ask(
    prompt: string,
    history: ChatMessage[] = [],
  ): Promise<ChatResponse> {
    const trimmed = prompt.trim();
    if (!trimmed)
      throw new WolfAppError("invalid", "Ask Wolf something first.");
    try {
      return await this.transport.ask(trimmed, history);
    } catch (error) {
      throw toAppError(error, "Wolf could not reach the local Ollama service.");
    }
  }

  /**
   * Streaming question. `onEvent` receives tokens as they arrive, and the
   * returned disposer detaches the listener so a stopped stream stops updating
   * the caller.
   *
   * The promise resolves once the native side has accepted the request, not
   * when the answer is complete. A `done` or `failed` event terminates the
   * stream; the caller owns its busy state until then.
   */
  async askStream(
    request: AskRequest,
    onEvent: (event: StreamEvent) => void,
  ): Promise<() => void> {
    if (
      request.messages.length === 0 ||
      request.messages.every((m) => m.content.trim() === "")
    ) {
      throw new WolfAppError("invalid", "Ask Wolf something first.");
    }
    const payload: AskRequest = {
      ...request,
      model: request.model ?? this.config.model,
    };
    // Mutable indirection so the disposer can detach a listener that the
    // transport captured before this promise resolved.
    let active: ((event: StreamEvent) => void) | null = onEvent;
    try {
      await this.transport.askStream(payload, (event) => active?.(event));
    } catch (error) {
      throw toAppError(error, "Wolf could not reach the local Ollama service.");
    }
    return () => {
      active = null;
    };
  }
}

function normaliseConfig(config: OllamaClientConfig): OllamaClientConfig {
  const url = config.url.trim().replace(/\/+$/, "");
  return {
    url: url === "" ? "http://localhost:11434" : url,
    model: config.model.trim() || "qwen2.5-coder",
  };
}

/** Display helper shared by the header, settings and assistant screens. */
export function describeStatus(status: OllamaStatus | null): {
  label: string;
  hint: string;
  tone: "ok" | "warn" | "off";
} {
  if (!status) {
    return { label: "Checking Ollama…", hint: "", tone: "warn" };
  }
  const copy = STATE_COPY[status.state];
  const tone =
    status.state === "ready"
      ? "ok"
      : status.state === "offline"
        ? "off"
        : "warn";
  const model =
    status.state === "ready" && status.model ? ` · ${status.model}` : "";
  return {
    label: `${copy.label}${model}`,
    hint: status.detail || copy.hint,
    tone,
  };
}
