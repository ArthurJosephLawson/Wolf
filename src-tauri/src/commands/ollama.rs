use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use crate::ai;
use crate::commands::today;
use crate::error::{OllamaError, WolfError, WolfResult};
use crate::models::ollama::{
    ChatMessage, ChatRequest, ChatResponse, ChatRole, OllamaModel, OllamaState, OllamaStatus,
};
use crate::ollama::client::StreamEvent;
use crate::state::AppState;

/// Health + model probe. Never fails hard: an offline daemon is a state the UI
/// must render, not an error.
#[tauri::command]
pub async fn ollama_status(
    state: State<'_, AppState>,
    url: Option<String>,
    model: Option<String>,
) -> WolfResult<OllamaStatus> {
    let settings = state.settings();
    let base = url.unwrap_or(settings.ollama_url);
    let model = model.unwrap_or(settings.ollama_model);
    state.ollama.status(&base, &model).await
}

#[tauri::command]
pub async fn list_ollama_models(
    state: State<'_, AppState>,
    url: Option<String>,
) -> WolfResult<Vec<OllamaModel>> {
    let base = url.unwrap_or_else(|| state.settings().ollama_url);
    state.ollama.list_models(&base).await
}

/// Model suggested to the user when the daemon has none installed.
#[tauri::command]
pub fn suggested_model() -> &'static str {
    crate::ollama::SUGGESTED_MODEL
}

/// One-shot, non-streaming answer. Used for short contextual lookups.
#[tauri::command]
pub async fn ask_ollama(
    state: State<'_, AppState>,
    prompt: String,
    history: Option<Vec<ChatMessage>>,
) -> WolfResult<ChatResponse> {
    if prompt.trim().is_empty() {
        return Err(WolfError::invalid("Ask Wolf something first."));
    }
    let settings = state.settings();
    let context = ai::build_context(&state.db, &prompt, today())?;
    let request = ChatRequest {
        model: settings.ollama_model.clone(),
        messages: history.unwrap_or_default(),
        context,
        system_prompt: Some(ai::system_prompt()),
        // Local models are literal; a touch of determinism keeps answers stable.
        temperature: Some(0.2),
        num_predict: Some(512),
        keep_alive: None,
    };
    state.ollama.chat(&settings.ollama_url, &request).await
}

/// Streaming answer. The command returns as soon as the stream is armed so the
/// UI can render instantly; tokens are delivered over `channel`.
#[tauri::command]
pub async fn ask_ollama_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    request: AskRequest,
    channel: Channel<StreamEvent>,
) -> WolfResult<AskAck> {
    let settings = state.settings();
    let request_id = state.next_request_id();

    let last_prompt = request
        .messages
        .iter()
        .rev()
        .find(|m| m.role == ChatRole::User)
        .map(|m| m.content.clone())
        .unwrap_or_default();

    if last_prompt.trim().is_empty() {
        return Err(WolfError::invalid("Ask Wolf something first."));
    }

    let requested_model = request
        .model
        .clone()
        .unwrap_or_else(|| settings.ollama_model.clone());

    // Pre-flight the daemon so the user gets an instant, clear error instead of
    // a stream that silently never starts.
    let status = state.ollama.status(&settings.ollama_url, &requested_model).await?;
    if status.state != OllamaState::Ready {
        let err = match status.state {
            OllamaState::Offline => OllamaError::Unavailable {
                url: settings.ollama_url.clone(),
            },
            OllamaState::NoModels => OllamaError::NoModels {
                suggestion: crate::ollama::SUGGESTED_MODEL.to_string(),
            },
            _ => OllamaError::ModelNotFound {
                model: requested_model.clone(),
                available: status
                    .models
                    .iter()
                    .map(|m| m.name.clone())
                    .collect::<Vec<_>>()
                    .join(", "),
            },
        };
        let message = err.to_string();
        let _ = channel.send(StreamEvent::Failed {
            request_id: request_id.clone(),
            message: message.clone(),
            kind: err.kind().to_string(),
        });
        return Err(WolfError::Ollama(err));
    }

    let context = ai::build_context(&state.db, &last_prompt, today())?;
    let resolved_model = status.model.clone().unwrap_or(requested_model);
    let base_url = settings.ollama_url.clone();

    let chat_request = ChatRequest {
        model: resolved_model,
        messages: request.messages,
        context,
        system_prompt: request.system_prompt.or_else(|| Some(ai::system_prompt())),
        temperature: Some(request.temperature.unwrap_or(0.2)),
        num_predict: Some(request.num_predict.unwrap_or(512)),
        keep_alive: None,
    };

    let stream_request_id = request_id.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        if let Err(err) = state
            .ollama
            .chat_stream(&base_url, &chat_request, &stream_request_id, channel)
            .await
        {
            log::debug!("chat stream ended: {err}");
        }
    });

    Ok(AskAck { request_id })
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AskRequest {
    #[serde(default)]
    pub model: Option<String>,
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(default)]
    pub num_predict: Option<u32>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AskAck {
    pub request_id: String,
}
