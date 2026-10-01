use serde::{Deserialize, Serialize};

/// One entry of `GET /api/tags`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModel {
    pub name: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub family: Option<String>,
    #[serde(default)]
    pub parameter_size: Option<String>,
    #[serde(default)]
    pub quantization: Option<String>,
    #[serde(default)]
    pub modified_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModelDetail {
    pub name: String,
    #[serde(default)]
    pub family: Option<String>,
    #[serde(default)]
    pub parameter_size: Option<String>,
    #[serde(default)]
    pub quantization: Option<String>,
    #[serde(default)]
    pub size: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OllamaState {
    /// Reachable and the configured model is present.
    Ready,
    /// Reachable, but no models are installed at all.
    NoModels,
    /// Reachable, but the configured model is missing.
    ModelMissing,
    /// Not reachable / not running.
    Offline,
}

impl OllamaState {
    pub fn as_str(self) -> &'static str {
        match self {
            OllamaState::Ready => "ready",
            OllamaState::NoModels => "no_models",
            OllamaState::ModelMissing => "model_missing",
            OllamaState::Offline => "offline",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStatus {
    pub state: OllamaState,
    pub url: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub models: Vec<OllamaModel>,
    /// Server-reported version, when the daemon exposes `/api/version`.
    #[serde(default)]
    pub version: Option<String>,
    /// Short, human readable explanation of the current state.
    #[serde(default)]
    pub detail: String,
    pub checked_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ChatRole {
    System,
    User,
    Assistant,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    /// Local context block (tasks/events/habits) injected by Wolf.
    #[serde(default)]
    pub context: String,
    #[serde(default)]
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub temperature: Option<f64>,
    /// Keeps small local models from rambling; `None` lets the model decide.
    #[serde(default)]
    pub num_predict: Option<u32>,
    #[serde(default)]
    pub keep_alive: Option<String>,
}

impl ChatRequest {
    /// Build the final message list sent to `/api/chat`.
    pub fn to_api_messages(&self) -> Vec<ChatMessage> {
        let mut messages: Vec<ChatMessage> = Vec::with_capacity(self.messages.len() + 2);

        let system = self
            .system_prompt
            .clone()
            .unwrap_or_else(crate::assistant::system_prompt);

        let mut system_text = system;
        if !self.context.trim().is_empty() {
            system_text.push_str("\n\n<local_context>\n");
            system_text.push_str(self.context.trim());
            system_text.push_str("\n</local_context>");
        }
        messages.push(ChatMessage {
            role: ChatRole::System,
            content: system_text,
        });
        messages.extend(self.messages.iter().cloned());
        messages
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponse {
    pub content: String,
    pub model: String,
    #[serde(default)]
    pub total_duration_ms: Option<u64>,
    #[serde(default)]
    pub eval_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StreamDone {
    pub request_id: String,
    pub model: String,
    pub total_duration_ms: Option<u64>,
    pub eval_count: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_messages_prepend_system_and_context() {
        let req = ChatRequest {
            model: "m".into(),
            messages: vec![ChatMessage {
                role: ChatRole::User,
                content: "What do I have today?".into(),
            }],
            context: "Tasks: none".into(),
            system_prompt: Some("be terse".into()),
            temperature: None,
            num_predict: None,
            keep_alive: None,
        };

        let messages = req.to_api_messages();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, ChatRole::System);
        assert!(messages[0].content.contains("be terse"));
        assert!(messages[0].content.contains("<local_context>"));
        assert!(messages[0].content.contains("Tasks: none"));
        assert_eq!(messages[1].role, ChatRole::User);
    }

    #[test]
    fn api_messages_omit_empty_context_block() {
        let req = ChatRequest {
            model: "m".into(),
            messages: vec![],
            context: "   ".into(),
            system_prompt: Some("sys".into()),
            temperature: None,
            num_predict: None,
            keep_alive: None,
        };
        let messages = req.to_api_messages();
        assert_eq!(messages.len(), 1);
        assert!(!messages[0].content.contains("local_context"));
    }
}
