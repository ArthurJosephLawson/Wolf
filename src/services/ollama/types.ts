/**
 * Transport-agnostic types for the local Ollama client.
 *
 * The actual HTTP call is injected, which is what makes the client testable
 * without a running daemon. In the packaged app the transport is the Tauri
 * command bridge; nothing in the UI ever calls `fetch` against a remote host.
 */
import type {
  AskAck,
  AskRequest,
  AssistantContext,
  ChatMessage,
  ChatResponse,
  OllamaModel,
  OllamaStatus,
  StreamEvent,
} from "../../types";

export type {
  AskAck,
  AskRequest,
  AssistantContext,
  ChatMessage,
  ChatResponse,
  OllamaModel,
  OllamaStatus,
  StreamEvent,
};

/** Everything the client needs from the native layer. */
export interface OllamaTransport {
  status(url?: string | null, model?: string | null): Promise<OllamaStatus>;
  listModels(url?: string | null): Promise<OllamaModel[]>;
  suggestedModel(): Promise<string>;
  /** Resolves the `<local_context>` block and system prompt for a question. */
  assistantContext(query: string): Promise<AssistantContext>;
  ask(prompt: string, history?: ChatMessage[]): Promise<ChatResponse>;
  /** Opens a stream and returns an id; tokens arrive on `onEvent`. */
  askStream(
    request: AskRequest,
    onEvent: (event: StreamEvent) => void,
  ): Promise<AskAck>;
}

export class OllamaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaUnavailableError";
  }
}

/** Human-readable copy for each daemon state. */
export const STATE_COPY: Record<
  OllamaStatus["state"],
  { label: string; hint: string }
> = {
  ready: {
    label: "Ollama online",
    hint: "Answers are generated on this machine.",
  },
  no_models: {
    label: "Ollama online · no models",
    hint: "Pull a model to enable the assistant.",
  },
  model_missing: {
    label: "Ollama online · model missing",
    hint: "Choose an installed model in Settings.",
  },
  offline: {
    label: "Ollama offline",
    hint: "Start it with `ollama serve`. Everything else still works.",
  },
};
