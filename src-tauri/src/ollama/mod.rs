pub mod client;

pub use client::{
    validate_base_url, ChatChunk, OllamaClient, StreamEvent, DEFAULT_OLLAMA_URL, SUGGESTED_MODEL,
};
