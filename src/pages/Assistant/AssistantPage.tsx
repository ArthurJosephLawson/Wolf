/**
 * Assistant screen.
 *
 * Talks to a locally running Ollama daemon. There is no cloud path: if the
 * daemon is not up, the screen explains exactly what to start, and the rest of
 * Wolf keeps working.
 */
import { useEffect, useRef, useState } from "react";
import { Panel, Chip, Empty } from "../../components/common/ui";
import {
  getOllamaClient,
  useOllamaStore,
  useOllamaSummary,
} from "../../stores/ollamaStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useWolfStore } from "../../stores/wolfStore";
import { useUiStore } from "../../stores/uiStore";
import type { WolfSignal } from "../../assets/wolf/animation";
import type { ChatMessage, StreamEvent } from "../../types";

const MAX_HISTORY = 20;

const SUGGESTIONS = [
  "What should I do next?",
  "How is today looking?",
  "Plan my next hour",
  "Help me clear a stuck task",
];

export function AssistantPage() {
  const settings = useSettingsStore((s) => s.settings);
  const status = useOllamaStore((s) => s.status);
  const check = useOllamaStore((s) => s.check);
  const ollama = useOllamaSummary();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  // Set while a stream is in flight: `detach` releases the native listener and
  // `stop` is what the Stop button calls.
  const stopRef = useRef<(() => void) | null>(null);
  const detachRef = useRef<(() => void) | null>(null);

  const ready = status?.state === "ready";

  useEffect(() => {
    if (!status)
      void check({ url: settings.ollamaUrl, model: settings.ollamaModel });
  }, [status, check, settings.ollamaUrl, settings.ollamaModel]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, streaming]);

  // Leaving the screen mid-stream must not leave a listener updating an
  // unmounted tree.
  useEffect(() => () => detachRef.current?.(), []);

  /**
   * Sends `prompt`, defaulting to whatever is in the input box.
   *
   * The native side acknowledges a stream immediately and delivers tokens
   * afterwards, so the busy state is owned by the stream itself: it ends on
   * `done`/`failed`, or when the user stops it, not when the ack arrives.
   */
  const send = async (override?: string) => {
    const prompt = (override ?? input).trim();
    if (prompt === "" || streaming) return;
    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setStreaming(true);
    useWolfStore.getState().pushShared("thinking");

    const history = messages.slice(-MAX_HISTORY);
    const reply: ChatMessage = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, reply]);

    // `stopped` lets the Stop button detach without needing to cancel the
    // native stream, which has no cancellation channel.
    let stopped = false;
    stopRef.current = () => {
      stopped = true;
      finish();
    };

    const finish = (final: WolfSignal = "default") => {
      detachRef.current?.();
      detachRef.current = null;
      setStreaming(false);
      stopRef.current = null;
      // `final` lets a clean finish linger on `happy` instead of being
      // immediately overwritten by the neutral pose.
      useWolfStore.getState().pushShared(final);
    };

    let saidAnything = false;
    const onEvent = (event: StreamEvent) => {
      if (stopped) return;
      if (event.type === "token") {
        // The wolf thinks while it waits, then starts speaking with the first
        // real token instead of the acknowledgement.
        if (!saidAnything) {
          saidAnything = true;
          useWolfStore.getState().pushShared("speaking");
        }
        setMessages((prev) =>
          prev.map((message, index, all) =>
            index === all.length - 1
              ? { ...message, content: message.content + event.text }
              : message,
          ),
        );
      } else if (event.type === "failed") {
        setError(event.message);
        setMessages((prev) =>
          prev.map((message, index, all) =>
            index === all.length - 1 ? { ...message, content: "" } : message,
          ),
        );
        finish();
      } else {
        // `done`: the model finished cleanly, so acknowledge it before the
        // store drops back to the neutral pose.
        finish("all-clear");
      }
    };

    try {
      const client = getOllamaClient();
      client.update({ url: settings.ollamaUrl, model: settings.ollamaModel });

      // Resolve the context for this exact question first. It is a read-only
      // local lookup, and sending the block we resolved here is what lets the
      // assistant promise that the context it shows is the context it used.
      const resolved = await client.assistantContext(prompt);
      if (stopped) return;

      const dispose = await client.askStream(
        {
          model: settings.ollamaModel,
          messages: [...history, { role: "user", content: prompt }],
          context: resolved?.context ?? null,
          systemPrompt: resolved?.systemPrompt ?? null,
        },
        onEvent,
      );
      if (stopped) dispose();
      else detachRef.current = dispose;
    } catch (streamError) {
      setError(
        streamError instanceof Error
          ? streamError.message
          : "Wolf could not reach the local Ollama service.",
      );
      setMessages((prev) => prev.slice(0, -1));
      finish();
    }
  };

  if (!ready) {
    return (
      <>
        <Panel
          title="Assistant"
          actions={
            <button
              type="button"
              className="btn btn--small"
              onClick={() =>
                void check({
                  url: settings.ollamaUrl,
                  model: settings.ollamaModel,
                })
              }
            >
              {ollama.checking ? "Checking…" : "Check again"}
            </button>
          }
        >
          <div className="stack">
            <div className="row">
              <Chip tone={status?.state === "offline" ? "danger" : "warn"}>
                {ollama.label}
              </Chip>
            </div>
            <p className="muted">{ollama.hint}</p>
            <p className="faint">
              The assistant runs entirely on this machine. Wolf talks to a local
              Ollama daemon at <code>{settings.ollamaUrl}</code> and never sends
              anything anywhere else.
            </p>

            {status?.state === "offline" ? (
              <pre
                style={{
                  background: "var(--bg-sunken)",
                  border: "2px solid var(--border)",
                  padding: 8,
                  margin: 0,
                  overflowX: "auto",
                }}
              >
                <code>
                  {"ollama serve\nollama pull " + settings.ollamaModel}
                </code>
              </pre>
            ) : null}

            {status?.state === "no_models" ? (
              <pre
                style={{
                  background: "var(--bg-sunken)",
                  border: "2px solid var(--border)",
                  padding: 8,
                  margin: 0,
                  overflowX: "auto",
                }}
              >
                <code>{`ollama pull ${settings.ollamaModel}\n# a small, fast choice:\nollama pull ${settings.fallbackModel}`}</code>
              </pre>
            ) : null}

            {status?.state === "model_missing" ? (
              <div className="stack">
                <p className="muted">
                  Ollama is running, but the model Wolf asked for is not
                  installed. Pick an installed model, or pull this one:
                </p>
                <pre
                  style={{
                    background: "var(--bg-sunken)",
                    border: "2px solid var(--border)",
                    padding: 8,
                    margin: 0,
                    overflowX: "auto",
                  }}
                >
                  <code>{"ollama pull " + settings.ollamaModel}</code>
                </pre>
                {status.models.length > 0 ? (
                  <div className="row">
                    {status.models.map((model) => (
                      <button
                        key={model.name}
                        type="button"
                        className="btn btn--small"
                        onClick={() =>
                          void useSettingsStore
                            .getState()
                            .selectModel(model.name)
                        }
                      >
                        Use {model.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p role="alert" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            ) : null}
          </div>
        </Panel>
      </>
    );
  }

  return (
    <>
      <Panel title="Assistant" actions={<Chip tone="ok">{ollama.label}</Chip>}>
        <div
          ref={logRef}
          className="scroll-y"
          style={{ maxHeight: "46vh", minHeight: 200, paddingRight: 4 }}
          role="log"
          aria-live="polite"
          aria-label="Conversation"
        >
          {messages.length === 0 ? (
            <Empty>
              Ask about your tasks, habits or schedule. Wolf reads the local
              database to answer with real numbers.
            </Empty>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                style={{
                  marginBottom: 8,
                  padding: 6,
                  border: "2px solid",
                  borderColor:
                    message.role === "user"
                      ? "var(--primary-dim)"
                      : "var(--border)",
                  background:
                    message.role === "user"
                      ? "var(--bg-raised)"
                      : "var(--bg-sunken)",
                }}
              >
                <div className="mono-label">
                  {message.role === "user" ? "You" : "Wolf"}
                </div>
                <div
                  style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  {message.content ||
                    (streaming && index === messages.length - 1 ? "…" : "")}
                </div>
              </div>
            ))
          )}
        </div>

        {error ? (
          <p role="alert" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        ) : null}

        <form
          className="row"
          style={{ marginTop: 8, alignItems: "flex-end" }}
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label className="visually-hidden" htmlFor="assistant-input">
            Message
          </label>
          <textarea
            id="assistant-input"
            className="textarea"
            style={{ flex: 1, minHeight: 44 }}
            value={input}
            placeholder="Ask Wolf…"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter adds a newline.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="submit"
            className="btn btn--primary"
            disabled={streaming || input.trim() === ""}
          >
            {streaming ? "Thinking…" : "Ask"}
          </button>
          {streaming ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                stopRef.current?.();
                useUiStore
                  .getState()
                  .pushToast({ tone: "info", title: "Stopped" });
              }}
            >
              Stop
            </button>
          ) : null}
        </form>
      </Panel>

      {messages.length === 0 ? (
        <Panel title="Try asking">
          <div className="row">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="btn btn--small"
                onClick={() => {
                  setInput(suggestion);
                  void send(suggestion);
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </Panel>
      ) : null}
    </>
  );
}
