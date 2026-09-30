/**
 * Ollama client tests.
 *
 * The client is exercised through a fake transport, so these run without a
 * daemon and cover the four UI states and the failure paths.
 */
import { describe, expect, it, vi } from "vitest";
import { OllamaClient, describeStatus } from "./OllamaClient";
import {
  STATE_COPY,
  type AskRequest,
  type ChatMessage,
  type OllamaModel,
  type OllamaTransport,
  type StreamEvent,
} from "./types";

function model(name: string): OllamaModel {
  return {
    name,
    size: 1024,
    family: "qwen2",
    parameterSize: "7B",
    quantization: "Q4",
    modifiedAt: null,
  };
}

function transport(overrides: Partial<OllamaTransport> = {}): OllamaTransport {
  return {
    status: async () => ({
      state: "ready",
      url: "http://localhost:11434",
      model: "qwen2.5-coder:7b",
      models: [model("qwen2.5-coder:7b")],
      version: "0.5.4",
      detail: "ok",
      checkedAt: new Date().toISOString(),
    }),
    listModels: async () => [model("qwen2.5-coder:7b")],
    suggestedModel: async () => "qwen2.5-coder",
    assistantContext: async (query) => ({
      query,
      intent: "tasks",
      context: "<local_context>2 open tasks</local_context>",
      systemPrompt: "You are Wolf.",
    }),
    ask: async () => ({
      content: "ok",
      model: "m",
      totalDurationMs: 1,
      evalCount: 2,
    }),
    askStream: async () => ({ requestId: "chat-0" }),
    ...overrides,
  };
}

describe("configuration", () => {
  it("normalises the URL and model", () => {
    const client = new OllamaClient({
      transport: transport(),
      config: { url: "http://localhost:11434/", model: "  " },
    });
    expect(client.endpoint).toBe("http://localhost:11434");
    expect(client.model).toBe("qwen2.5-coder");
  });

  it("falls back to the local default when the URL is blank", () => {
    const client = new OllamaClient({
      transport: transport(),
      config: { url: "   ", model: "x" },
    });
    expect(client.endpoint).toBe("http://localhost:11434");
  });

  it("applies updates", () => {
    const client = new OllamaClient({
      transport: transport(),
      config: { url: "http://localhost:11434", model: "a" },
    });
    client.update({ model: "b" });
    expect(client.model).toBe("b");
  });
});

describe("status", () => {
  it("reports ready when the model is installed", async () => {
    const client = new OllamaClient({
      transport: transport(),
      config: { url: "http://localhost:11434", model: "qwen2.5-coder" },
    });
    const status = await client.status();
    expect(status.state).toBe("ready");
    expect(status.model).toBe("qwen2.5-coder:7b");
    expect(await client.isReady()).toBe(true);
  });

  it("turns a transport failure into an offline status rather than an error", async () => {
    const client = new OllamaClient({
      transport: transport({
        status: async () => {
          throw new Error("connection refused");
        },
      }),
      config: { url: "http://localhost:11434", model: "m" },
    });
    const status = await client.status();
    expect(status.state).toBe("offline");
    expect(status.models).toEqual([]);
    expect(await client.isReady()).toBe(false);
    expect(await client.listModels()).toEqual([]);
  });

  it("passes overrides through to the transport", async () => {
    const status_ = vi.fn(transport().status);
    const client = new OllamaClient({
      transport: transport({ status: status_ }),
      config: { url: "a", model: "b" },
    });
    await client.status({ url: "http://127.0.0.1:11434", model: "z" });
    expect(status_).toHaveBeenCalledWith("http://127.0.0.1:11434", "z");
  });
});

describe("asking", () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "What is due today?" },
  ];

  it("refuses an empty question", async () => {
    const client = new OllamaClient({
      transport: transport(),
      config: { url: "http://localhost:11434", model: "m" },
    });
    await expect(client.ask("   ")).rejects.toThrow();
    await expect(
      client.askStream({ messages: [] }, () => undefined),
    ).rejects.toThrow();
  });

  it("returns the model's answer", async () => {
    const ask = vi.fn(async () => ({
      content: "Two tasks.",
      model: "m",
      totalDurationMs: 12,
      evalCount: 3,
    }));
    const client = new OllamaClient({
      transport: transport({ ask }),
      config: { url: "http://localhost:11434", model: "m" },
    });
    const answer = await client.ask("What is due today?", messages);
    expect(answer.content).toBe("Two tasks.");
    expect(ask).toHaveBeenCalledWith("What is due today?", messages);
  });

  it("wraps transport failures in a Wolf error", async () => {
    const client = new OllamaClient({
      transport: transport({
        ask: async () => {
          throw new Error("boom");
        },
      }),
      config: { url: "http://localhost:11434", model: "m" },
    });
    await expect(client.ask("hello")).rejects.toMatchObject({
      name: "WolfAppError",
    });
  });

  it("streams tokens to the caller and fills in the model", async () => {
    const request: AskRequest = { messages };
    const client = new OllamaClient({
      transport: transport({
        askStream: async (req, onEvent) => {
          const event: StreamEvent = {
            type: "token",
            requestId: "chat-0",
            text: "hi",
          };
          onEvent(event);
          expect(req.model).toBe("configured-model");
          return { requestId: "chat-0" };
        },
      }),
      config: { url: "http://localhost:11434", model: "configured-model" },
    });

    const seen: StreamEvent[] = [];
    const dispose = await client.askStream(request, (event) =>
      seen.push(event),
    );
    expect(seen).toHaveLength(1);
    expect(typeof dispose).toBe("function");
  });

  it("keeps delivering tokens that arrive after the ack resolves", async () => {
    // The native side acknowledges the request and then streams in the
    // background, so the listener has to outlive the awaited promise.
    let deliver: ((event: StreamEvent) => void) | null = null;
    const client = new OllamaClient({
      transport: transport({
        askStream: async (_req, onEvent) => {
          deliver = onEvent;
          return { requestId: "chat-0" };
        },
      }),
      config: { url: "http://localhost:11434", model: "m" },
    });

    const seen: StreamEvent[] = [];
    const dispose = await client.askStream({ messages }, (event) =>
      seen.push(event),
    );
    expect(seen).toHaveLength(0);

    deliver!({ type: "token", requestId: "chat-0", text: "late" });
    expect(seen).toEqual([
      { type: "token", requestId: "chat-0", text: "late" },
    ]);

    dispose();
    deliver!({ type: "token", requestId: "chat-0", text: "after" });
    expect(seen).toHaveLength(1);
  });
});

describe("status copy", () => {
  it("describes every state", () => {
    for (const state of [
      "ready",
      "no_models",
      "model_missing",
      "offline",
    ] as const) {
      const described = describeStatus({
        state,
        url: "http://localhost:11434",
        model: null,
        models: [],
        version: null,
        detail: "",
        checkedAt: "",
      });
      expect(described.label).toBe(STATE_COPY[state].label);
      expect(["ok", "warn", "off"]).toContain(described.tone);
    }
  });

  it("says it is checking before the first probe", () => {
    expect(describeStatus(null).tone).toBe("warn");
  });

  it("marks a stopped daemon as offline", () => {
    const described = describeStatus({
      state: "offline",
      url: "http://localhost:11434",
      model: null,
      models: [],
      version: null,
      detail: "connection refused",
      checkedAt: "",
    });
    expect(described.tone).toBe("off");
    expect(described.hint).toBe("connection refused");
  });
});
