use std::sync::RwLock;

use tauri::{AppHandle, Manager, Runtime, State};

use crate::database::Database;
use crate::error::{WolfError, WolfResult};
use crate::models::{Settings, SettingsPatch};
use crate::ollama::OllamaClient;

pub struct AppState {
    pub db: Database,
    pub ollama: OllamaClient,
    settings: RwLock<Settings>,

    request_counter: std::sync::atomic::AtomicU64,
}

impl AppState {
    pub fn new(db: Database, settings: Settings) -> Self {
        AppState {
            db,
            ollama: OllamaClient::new(),
            settings: RwLock::new(settings),
            request_counter: std::sync::atomic::AtomicU64::new(0),
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings
            .read()
            .map(|s| s.clone())
            .unwrap_or_else(|_| Settings::default())
    }

    pub fn replace_settings(&self, incoming: Settings) -> WolfResult<Settings> {
        let incoming = incoming.sanitized();
        let incoming = Settings {
            ollama_url: crate::ollama::validate_base_url(&incoming.ollama_url)?,
            ..incoming
        };
        let saved = self.db.save_settings(&incoming)?;
        let mut guard = self
            .settings
            .write()
            .map_err(|_| WolfError::internal("Settings lock was poisoned."))?;
        *guard = saved.clone();
        Ok(saved)
    }

    pub fn patch_settings(&self, patch: SettingsPatch) -> WolfResult<Settings> {
        let mut current = self.settings();
        current.apply_patch(patch);
        self.replace_settings(current)
    }

    pub fn next_request_id(&self) -> String {
        let n = self
            .request_counter
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        format!("chat-{n}")
    }
}

pub fn state<'a, R: Runtime>(app: &'a AppHandle<R>) -> WolfResult<State<'a, AppState>> {
    app.try_state::<AppState>()
        .ok_or_else(|| WolfError::internal("Wolf is still starting up."))
}
