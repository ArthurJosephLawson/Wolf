use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum OllamaError {
    #[error("Ollama is not running at {url}. Start it with `ollama serve`.")]
    Unavailable { url: String },
    #[error("Ollama is running but has no models installed. Try `ollama pull {suggestion}`.")]
    NoModels { suggestion: String },
    #[error("Model `{model}` is not installed on this machine. Installed models: {available}.")]
    ModelNotFound { model: String, available: String },
    #[error("Wolf only talks to a local Ollama daemon, so the address has to be http://localhost or http://127.0.0.1 (any port). `{host}` is not one of those.")]
    NotLocal { host: String },
    #[error("`{value}` is not a valid URL. Use something like http://localhost:11434.")]
    NotAUrl { value: String },
    #[error("Ollama returned an unexpected response ({status}).")]
    BadStatus { status: u16 },
    #[error("Ollama sent a response Wolf could not read.")]
    Malformed,
    #[error("Could not reach Ollama: {0}")]
    Transport(String),
    #[error("The request to Ollama took too long and was cancelled.")]
    Timeout,
}

impl OllamaError {
    pub fn kind(&self) -> &'static str {
        match self {
            OllamaError::Unavailable { .. } => "unavailable",
            OllamaError::NoModels { .. } => "no_models",
            OllamaError::ModelNotFound { .. } => "model_not_found",
            OllamaError::NotLocal { .. } => "not_local",
            OllamaError::NotAUrl { .. } => "not_a_url",
            OllamaError::BadStatus { .. } => "bad_status",
            OllamaError::Malformed => "malformed",
            OllamaError::Transport(_) => "transport",
            OllamaError::Timeout => "timeout",
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum WolfError {
    #[error("Local database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("{entity} not found.")]
    NotFound { entity: &'static str },

    #[error("{0}")]
    Invalid(String),

    #[error(transparent)]
    Ollama(#[from] OllamaError),

    #[error("Desktop integration unavailable: {0}")]
    Desktop(String),

    #[error("Desktop integration failed: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("{0}")]
    Internal(String),
}

impl WolfError {
    pub fn invalid(message: impl Into<String>) -> Self {
        WolfError::Invalid(message.into())
    }

    pub fn not_found(entity: &'static str) -> Self {
        WolfError::NotFound { entity }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        WolfError::Internal(message.into())
    }

    pub fn desktop(message: impl Into<String>) -> Self {
        WolfError::Desktop(message.into())
    }

    pub fn kind(&self) -> &'static str {
        match self {
            WolfError::Database(_) => "database",
            WolfError::NotFound { .. } => "not_found",
            WolfError::Invalid(_) => "invalid",
            WolfError::Ollama(inner) => inner.kind(),
            WolfError::Desktop(_) => "desktop",
            WolfError::Tauri(_) => "desktop",
            WolfError::Internal(_) => "internal",
        }
    }
}

impl Serialize for WolfError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("WolfError", 2)?;
        state.serialize_field("kind", self.kind())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

pub type WolfResult<T> = Result<T, WolfError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialises_kind_and_human_message() {
        let err = WolfError::Ollama(OllamaError::Unavailable {
            url: "http://localhost:11434".into(),
        });
        let json = serde_json::to_value(&err).expect("serialisable");
        assert_eq!(json["kind"], "unavailable");
        assert!(json["message"].as_str().unwrap().contains("ollama serve"));
    }

    #[test]
    fn not_found_message_is_readable() {
        assert_eq!(WolfError::not_found("Task").to_string(), "Task not found.");
    }
}
