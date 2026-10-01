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

  async status(
    overrides: Partial<OllamaClientConfig> = {},
  ): Promise<OllamaStatus> {
    const url = overrides.url ?? this.config.url;
    const model = overrides.model ?? this.config.model;
    try {
      return await this.transport.status(url, model);
    } catch (error) {
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

  async isReady(overrides: Partial<OllamaClientConfig> = {}): Promise<boolean> {
    const status = await this.status(overrides);
    return status.state === "ready";
  }

  async assistantContext(query: string): Promise<AssistantContext | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;
    try {
      return await this.transport.assistantContext(trimmed);
    } catch (error) {
      throw toAppError(error, "Wolf could not read your local data.");
    }
  }

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
