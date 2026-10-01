/**
 * The real {@link OllamaTransport}, backed by Tauri commands.
 *
 * The native Rust client owns all HTTP so that the only socket Wolf ever opens
 * is the one the user configured (localhost by default). Streaming arrives over
 * a Tauri `Channel`.
 */
import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  AskAck,
  AskRequest,
  AssistantContext,
  ChatMessage,
  ChatResponse,
  OllamaModel,
  OllamaStatus,
  OllamaTransport,
  StreamEvent,
} from "../features/assistant/ollamaTypes";

export const ollamaTransport: OllamaTransport = {
  async status(
    url: string | null,
    model: string | null,
  ): Promise<OllamaStatus> {
    return invoke<OllamaStatus>("ollama_status", { url, model });
  },

  async listModels(url: string | null): Promise<OllamaModel[]> {
    return invoke<OllamaModel[]>("list_ollama_models", { url });
  },

  async suggestedModel(): Promise<string> {
    return invoke<string>("suggested_model");
  },

  async assistantContext(query: string): Promise<AssistantContext> {
    return invoke<AssistantContext>("assistant_context", { query });
  },

  async ask(prompt: string, history: ChatMessage[]): Promise<ChatResponse> {
    return invoke<ChatResponse>("ask_ollama", { prompt, history });
  },

  /**
   * Opens a stream. The returned ack resolves as soon as the native side has
   * accepted the request; tokens keep arriving on `onEvent` afterwards and the
   * stream ends with a `done` or `failed` event. Callers must therefore keep
   * their busy state until the terminal event, not until the ack.
   */
  async askStream(
    request: AskRequest,
    onEvent: (event: StreamEvent) => void,
  ): Promise<AskAck> {
    const channel = new Channel<StreamEvent>();
    channel.onmessage = onEvent;
    return invoke<AskAck>("ask_ollama_stream", { request, channel });
  },
};
