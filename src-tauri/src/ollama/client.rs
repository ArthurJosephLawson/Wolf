//! Local Ollama REST client.
//!
//! Wolf talks to a locally running `ollama serve` and nothing else. There is no
//! cloud fallback, no API key, no proxy: if the daemon is down the user is told
//! so plainly.

use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::ipc::Channel;

use crate::error::{OllamaError, WolfError, WolfResult};
use crate::models::ollama::{
    ChatMessage, ChatRequest, ChatResponse, ChatRole, OllamaModel, OllamaState, OllamaStatus,
    StreamDone,
};

/// Default local endpoint, matching a stock `ollama serve`.
pub const DEFAULT_OLLAMA_URL: &str = "http://localhost:11434";
/// Model suggested to the user when nothing is installed.
pub const SUGGESTED_MODEL: &str = "qwen2.5-coder";

const CONNECT_TIMEOUT: Duration = Duration::from_millis(1_500);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(180);

/// One NDJSON frame emitted by `/api/chat` with `"stream": true`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChatChunk {
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub message: Option<ChatMessage>,
    #[serde(default)]
    pub response: Option<String>,
    #[serde(default)]
    pub done: Option<bool>,
    #[serde(default)]
    pub total_duration: Option<u64>,
    #[serde(default)]
    pub eval_count: Option<u32>,
    #[serde(default)]
    pub error: Option<String>,
}

impl ChatChunk {
    /// Ollama returns either `message.content` or the legacy `response` field.
    pub fn text(&self) -> Option<&str> {
        self.message
            .as_ref()
            .filter(|m| m.role == ChatRole::Assistant)
            .map(|m| m.content.as_str())
            .or(self.response.as_deref())
            .filter(|s| !s.is_empty())
    }

    pub fn is_done(&self) -> bool {
        self.done.unwrap_or(false)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TagsResponse {
    #[serde(default)]
    models: Vec<TagModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TagModel {
    name: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    details: Option<TagDetails>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TagDetails {
    #[serde(default)]
    family: Option<String>,
    #[serde(default)]
    parameter_size: Option<String>,
    #[serde(default)]
    quantization_level: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct VersionResponse {
    #[serde(default)]
    version: String,
}

/// Payload sent to the frontend for each streamed token batch.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StreamEvent {
    /// Incremental text, already decoded from the NDJSON frame.
    Token { request_id: String, text: String },
    /// Terminal payload with timing metadata.
    Done { request_id: String, summary: StreamDone },
    /// The stream ended early; `message` is safe to show to the user.
    Failed { request_id: String, message: String, kind: String },
}

pub struct OllamaClient {
    http: reqwest::Client,
}

impl Default for OllamaClient {
    fn default() -> Self {
        Self::new()
    }
}

impl OllamaClient {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            // Wolf never follows redirects to somewhere other than the local daemon.
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("Wolf/", env!("CARGO_PKG_VERSION")))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        OllamaClient { http }
    }

    fn url(&self, base: &str, path: &str) -> String {
        format!("{}{}", base.trim_end_matches('/'), path)
    }

    fn map_transport_error(err: reqwest::Error, base: &str) -> OllamaError {
        if err.is_timeout() {
            return OllamaError::Timeout;
        }
        if err.is_connect() || err.is_request() {
            return OllamaError::Unavailable {
                url: base.to_string(),
            };
        }
        // Body/decode failures point at an incompatible daemon, not at the network.
        if err.is_decode() || err.is_body() {
            return OllamaError::Malformed;
        }
        OllamaError::Transport(err.to_string())
    }

    /// `GET /api/version` — the cheapest possible reachability probe.
    pub async fn version(&self, base: &str) -> WolfResult<String> {
        let response = self
            .http
            .get(self.url(base, "/api/version"))
            .send()
            .await
            .map_err(|e| WolfError::Ollama(Self::map_transport_error(e, base)))?;

        if !response.status().is_success() {
            return Err(OllamaError::BadStatus { status: response.status().as_u16() }.into());
        }

        let body: VersionResponse = response
            .json()
            .await
            .map_err(|_| WolfError::Ollama(OllamaError::Malformed))?;
        Ok(body.version)
    }

    /// `GET /api/tags` — every model installed on this machine.
    pub async fn list_models(&self, base: &str) -> WolfResult<Vec<OllamaModel>> {
        let response = self
            .http
            .get(self.url(base, "/api/tags"))
            .send()
            .await
            .map_err(|e| WolfError::Ollama(Self::map_transport_error(e, base)))?;

        if !response.status().is_success() {
            return Err(OllamaError::BadStatus { status: response.status().as_u16() }.into());
        }

        let body: TagsResponse = response
            .json()
            .await
            .map_err(|_| WolfError::Ollama(OllamaError::Malformed))?;

        Ok(body
            .models
            .into_iter()
            .map(|m| OllamaModel {
                name: m.name,
                size: m.size,
                family: m.details.as_ref().and_then(|d| d.family.clone()),
                parameter_size: m.details.as_ref().and_then(|d| d.parameter_size.clone()),
                quantization: m.details.as_ref().and_then(|d| d.quantization_level.clone()),
                modified_at: None,
            })
            .collect())
    }

    /// Resolve a user-typed model name against the installed list.
    /// `qwen2.5-coder` matches the installed `qwen2.5-coder:7b-instruct`.
    pub fn resolve_model(models: &[OllamaModel], requested: &str) -> Option<String> {
        let wanted = requested.trim().to_lowercase();
        if wanted.is_empty() {
            return models.first().map(|m| m.name.clone());
        }
        if let Some(exact) = models.iter().find(|m| m.name.to_lowercase() == wanted) {
            return Some(exact.name.clone());
        }
        let wanted_base = wanted.split(':').next().unwrap_or(&wanted);
        models
            .iter()
            .find(|m| m.name.to_lowercase().split(':').next().unwrap_or_default() == wanted_base)
            .map(|m| m.name.clone())
    }

    /// Health probe that classifies the daemon into the four UI states.
    pub async fn status(&self, base: &str, model: &str) -> WolfResult<OllamaStatus> {
        let checked_at = crate::models::now_iso();
        let url = base.trim_end_matches('/').to_string();

        let version = match self.version(&url).await {
            Ok(v) => Some(v),
            Err(err) => {
                let ollama = match err {
                    WolfError::Ollama(inner) => inner,
                    other => return Err(other),
                };
                return Ok(OllamaStatus {
                    state: OllamaState::Offline,
                    detail: ollama.to_string(),
                    url,
                    model: Some(model.to_string()),
                    models: Vec::new(),
                    version: None,
                    checked_at,
                });
            }
        };

        let models = self.list_models(&url).await.unwrap_or_default();
        let version_label = version.as_deref().unwrap_or("(unknown version)");

        let (state, resolved, detail) = if models.is_empty() {
            (
                OllamaState::NoModels,
                None,
                format!("Ollama {version_label} is running but has no models. Pull one with `ollama pull {SUGGESTED_MODEL}`."),
            )
        } else if let Some(found) = Self::resolve_model(&models, model) {
            (
                OllamaState::Ready,
                Some(found.clone()),
                format!("Ollama {version_label} · {found}"),
            )
        } else {
            (
                OllamaState::ModelMissing,
                None,
                format!(
                    "Ollama {version_label} is running, but `{model}` is not installed. Available: {}.",
                    models
                        .iter()
                        .map(|m| m.name.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            )
        };

        Ok(OllamaStatus {
            state,
            url,
            model: resolved,
            models,
            version,
            detail,
            checked_at,
        })
    }

    fn chat_body(request: &ChatRequest, stream: bool) -> serde_json::Value {
        let mut options = serde_json::Map::new();
        if let Some(t) = request.temperature {
            options.insert("temperature".into(), json!(t));
        }
        if let Some(n) = request.num_predict {
            options.insert("num_predict".into(), json!(n));
        }

        let mut body = serde_json::Map::new();
        body.insert("model".into(), json!(request.model));
        body.insert("messages".into(), json!(request.to_api_messages()));
        body.insert("stream".into(), json!(stream));
        body.insert("keep_alive".into(), json!(request.keep_alive.clone().unwrap_or_else(|| "10m".into())));
        if !options.is_empty() {
            body.insert("options".into(), serde_json::Value::Object(options));
        }
        serde_json::Value::Object(body)
    }

    /// Build the chat request. Kept separate from sending so both the streaming
    /// and one-shot paths share exactly one body shape.
    fn send_chat(&self, base: &str, request: &ChatRequest, stream: bool) -> WolfResult<reqwest::RequestBuilder> {
        let url = self.url(base, "/api/chat");
        Ok(self.http.post(url).json(&Self::chat_body(request, stream)))
    }

    fn model_guard(request: &ChatRequest) -> WolfResult<()> {
        if request.model.trim().is_empty() {
            return Err(OllamaError::ModelNotFound {
                model: "(none)".into(),
                available: "choose a model in Wolf settings".into(),
            }
            .into());
        }
        Ok(())
    }

    /// Non-streaming completion. Used for short contextual lookups and tests.
    pub async fn chat(&self, base: &str, request: &ChatRequest) -> WolfResult<ChatResponse> {
        Self::model_guard(request)?;

        let response = self
            .send_chat(base, request, false)?
            .send()
            .await
            .map_err(|e| WolfError::Ollama(Self::map_transport_error(e, base)))?;

        if !response.status().is_success() {
            return Err(OllamaError::BadStatus { status: response.status().as_u16() }.into());
        }

        let chunk: ChatChunk = response
            .json()
            .await
            .map_err(|_| WolfError::Ollama(OllamaError::Malformed))?;

        if let Some(err) = chunk.error {
            return Err(ollama_reported_error(&err));
        }

        let content = chunk
            .text()
            .ok_or(WolfError::Ollama(OllamaError::Malformed))?
            .to_string();

        Ok(ChatResponse {
            content,
            model: chunk.model.unwrap_or_else(|| request.model.clone()),
            total_duration_ms: chunk.total_duration.map(|ns| ns / 1_000_000),
            eval_count: chunk.eval_count,
        })
    }

    /// Streaming completion. Tokens are pushed to the frontend over `channel`
    /// as they arrive; the function returns as soon as the stream is exhausted.
    pub async fn chat_stream(
        &self,
        base: &str,
        request: &ChatRequest,
        request_id: &str,
        channel: Channel<StreamEvent>,
    ) -> WolfResult<()> {
        Self::model_guard(request)?;

        let response = match self.send_chat(base, request, true)?.send().await {
            Ok(response) => response,
            Err(e) => {
                let err = WolfError::Ollama(Self::map_transport_error(e, base));
                let _ = channel.send(StreamEvent::Failed {
                    request_id: request_id.to_string(),
                    message: err.to_string(),
                    kind: err.kind().to_string(),
                });
                return Err(err);
            }
        };

        if !response.status().is_success() {
            let err = WolfError::Ollama(OllamaError::BadStatus { status: response.status().as_u16() });
            let _ = channel.send(StreamEvent::Failed {
                request_id: request_id.to_string(),
                message: err.to_string(),
                kind: err.kind().to_string(),
            });
            return Err(err);
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut model = request.model.clone();
        let mut done_summary: Option<StreamDone> = None;

        'outer: loop {
            let next = stream.next().await;
            let Some(item) = next else { break };
            let bytes = match item {
                Ok(bytes) => bytes,
                Err(e) => {
                    let err = WolfError::Ollama(Self::map_transport_error(e, base));
                    let _ = channel.send(StreamEvent::Failed {
                        request_id: request_id.to_string(),
                        message: err.to_string(),
                        kind: err.kind().to_string(),
                    });
                    return Err(err);
                }
            };

            buffer.push_str(&String::from_utf8_lossy(&bytes));

            // NDJSON: one JSON object per line, the tail may be incomplete.
            while let Some(idx) = buffer.find('\n') {
                let line: String = buffer.drain(..=idx).collect();
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                match serde_json::from_str::<ChatChunk>(line) {
                    Ok(chunk) => {
                        if let Some(name) = chunk.model.clone() {
                            model = name;
                        }
                        if let Some(err) = chunk.error {
                            let err = ollama_reported_error(&err);
                            let _ = channel.send(StreamEvent::Failed {
                                request_id: request_id.to_string(),
                                message: err.to_string(),
                                kind: err.kind().to_string(),
                            });
                            return Err(err);
                        }
                        if let Some(text) = chunk.text() {
                            if channel
                                .send(StreamEvent::Token {
                                    request_id: request_id.to_string(),
                                    text: text.to_string(),
                                })
                                .is_err()
                            {
                                // The window went away; stop burning CPU on tokens.
                                break 'outer;
                            }
                        }
                        if chunk.is_done() {
                            done_summary = Some(StreamDone {
                                request_id: request_id.to_string(),
                                model: model.clone(),
                                total_duration_ms: chunk.total_duration.map(|ns| ns / 1_000_000),
                                eval_count: chunk.eval_count,
                            });
                            break 'outer;
                        }
                    }
                    Err(_) => {
                        // A malformed frame is reported but does not abort a
                        // stream that is otherwise producing good tokens.
                        log::warn!("ignoring malformed Ollama stream frame");
                    }
                }
            }
        }

        match done_summary {
            Some(summary) => {
                let _ = channel.send(StreamEvent::Done {
                    request_id: request_id.to_string(),
                    summary,
                });
                Ok(())
            }
            None => {
                // Stream ended without a `done` frame: still a usable answer.
                let summary = StreamDone {
                    request_id: request_id.to_string(),
                    model,
                    total_duration_ms: None,
                    eval_count: None,
                };
                let _ = channel.send(StreamEvent::Done {
                    request_id: request_id.to_string(),
                    summary,
                });
                Ok(())
            }
        }
    }
}

/// Ollama can answer 200 with an `error` field (e.g. a missing model). Surface
/// that text instead of the opaque status code.
fn ollama_reported_error(message: &str) -> WolfError {
    log::warn!("ollama reported: {message}");
    OllamaError::Transport(format!("Ollama reported: {message}")).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model(name: &str) -> OllamaModel {
        OllamaModel {
            name: name.into(),
            size: 1,
            family: None,
            parameter_size: None,
            quantization: None,
            modified_at: None,
        }
    }

    #[test]
    fn parses_a_token_chunk() {
        let chunk: ChatChunk = serde_json::from_str(
            r#"{"model":"m","message":{"role":"assistant","content":"hi"},"done":false}"#,
        )
        .expect("decode");
        assert_eq!(chunk.text(), Some("hi"));
        assert!(!chunk.is_done());
    }

    #[test]
    fn parses_legacy_response_field() {
        let chunk: ChatChunk =
            serde_json::from_str(r#"{"response":"legacy","done":true}"#).expect("decode");
        assert_eq!(chunk.text(), Some("legacy"));
        assert!(chunk.is_done());
    }

    #[test]
    fn tolerates_a_frame_with_no_content() {
        let chunk: ChatChunk = serde_json::from_str(r#"{"done":false}"#).expect("decode");
        assert_eq!(chunk.text(), None);
    }

    #[test]
    fn parses_tags_response_into_models() {
        let body: TagsResponse = serde_json::from_str(
            r#"{"models":[{"name":"qwen2.5-coder:7b","size":42,"details":{"family":"qwen2","parameter_size":"7B","quantization_level":"Q4_0"}}]}"#,
        )
        .expect("decode");

        let models: Vec<OllamaModel> = body
            .models
            .into_iter()
            .map(|m| OllamaModel {
                name: m.name,
                size: m.size,
                family: m.details.as_ref().and_then(|d| d.family.clone()),
                parameter_size: m.details.as_ref().and_then(|d| d.parameter_size.clone()),
                quantization: m.details.as_ref().and_then(|d| d.quantization_level.clone()),
                modified_at: None,
            })
            .collect();

        assert_eq!(models[0].name, "qwen2.5-coder:7b");
        assert_eq!(models[0].quantization.as_deref(), Some("Q4_0"));
    }

    #[test]
    fn parses_empty_tags_response() {
        let body: TagsResponse = serde_json::from_str(r#"{"models":[]}"#).expect("decode");
        assert!(body.models.is_empty());
    }

    #[test]
    fn resolves_model_by_exact_name() {
        let models = vec![model("qwen2.5-coder:7b"), model("gemma2:2b")];
        assert_eq!(
            OllamaClient::resolve_model(&models, "gemma2:2b").as_deref(),
            Some("gemma2:2b")
        );
    }

    #[test]
    fn resolves_model_by_family_prefix() {
        let models = vec![model("qwen2.5-coder:7b"), model("gemma2:2b")];
        assert_eq!(
            OllamaClient::resolve_model(&models, "qwen2.5-coder").as_deref(),
            Some("qwen2.5-coder:7b")
        );
    }

    #[test]
    fn unknown_model_does_not_resolve() {
        let models = vec![model("gemma2:2b")];
        assert!(OllamaClient::resolve_model(&models, "llama3").is_none());
    }

    #[test]
    fn empty_request_falls_back_to_first_model() {
        let models = vec![model("a:1"), model("b:2")];
        assert_eq!(OllamaClient::resolve_model(&models, "  ").as_deref(), Some("a:1"));
    }

    #[test]
    fn chat_body_contains_system_context_and_options() {
        let request = ChatRequest {
            model: "m".into(),
            messages: vec![ChatMessage {
                role: ChatRole::User,
                content: "hi".into(),
            }],
            context: "Tasks: 2 open".into(),
            system_prompt: Some("sys".into()),
            temperature: Some(0.2),
            num_predict: Some(256),
            keep_alive: None,
        };
        let body = OllamaClient::chat_body(&request, true);

        assert_eq!(body["model"], "m");
        assert_eq!(body["stream"], true);
        assert_eq!(body["keep_alive"], "10m");
        assert_eq!(body["options"]["temperature"], 0.2);
        assert_eq!(body["options"]["num_predict"], 256);
        let system = body["messages"][0]["content"].as_str().unwrap();
        assert!(system.contains("Tasks: 2 open"));
        assert_eq!(body["messages"][1]["content"], "hi");
    }

    #[test]
    fn empty_model_is_rejected_before_any_request() {
        let request = ChatRequest { model: "  ".into(), ..Default::default() };
        let err = OllamaClient::model_guard(&request).expect_err("should fail");
        assert_eq!(err.kind(), "model_not_found");
    }

    #[test]
    fn states_serialise_to_snake_case() {
        assert_eq!(serde_json::to_string(&OllamaState::NoModels).unwrap(), "\"no_models\"");
        assert_eq!(serde_json::to_string(&OllamaState::ModelMissing).unwrap(), "\"model_missing\"");
        assert_eq!(serde_json::to_string(&OllamaState::Offline).unwrap(), "\"offline\"");
        assert_eq!(serde_json::to_string(&OllamaState::Ready).unwrap(), "\"ready\"");
    }
}
