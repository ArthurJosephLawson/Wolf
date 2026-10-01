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

export interface OllamaTransport {
  status(url?: string | null, model?: string | null): Promise<OllamaStatus>;
  listModels(url?: string | null): Promise<OllamaModel[]>;
  suggestedModel(): Promise<string>;

  assistantContext(query: string): Promise<AssistantContext>;
  ask(prompt: string, history?: ChatMessage[]): Promise<ChatResponse>;

  askStream(
    request: AskRequest,
    onEvent: (event: StreamEvent) => void,
  ): Promise<AskAck>;
}

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
