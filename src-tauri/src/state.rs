//! Process-wide application state shared by every Tauri command.

use std::sync::{Arc, RwLock};

use tauri::{AppHandle, Manager, Runtime, State};

use crate::database::Database;
use crate::error::{WolfError, WolfResult};
use crate::models::{Settings, SettingsPatch};
use crate::ollama::OllamaClient;

/// Everything a command needs that is not part of the request payload.
pub struct AppState {
    pub db: Database,
    pub ollama: OllamaClient,
    settings: RwLock<Settings>,
    /// Monotonic counter used to label streaming chat requests.
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

    /// Persist new settings, sanitise them and refresh the in-memory copy.
    ///
    /// Every save funnels through here, including partial patches such as the
    /// companion position, so the loopback check on `ollama_url` cannot be
    /// side-stepped by taking the patch route.
    pub fn replace_settings(&self, incoming: Settings) -> WolfResult<Settings> {
        // Sanitise first so a blank URL still falls back to the default, then
        // reject anything that is not loopback before it can reach SQLite.
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

    /// Merge a partial update into the current settings and persist the result.
    /// Only the fields present in `patch` are changed.
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

/// Convenience accessor used by commands.
///
/// Returns Tauri's managed-state guard, which derefs to `&AppState`.
pub fn state<'a, R: Runtime>(app: &'a AppHandle<R>) -> WolfResult<State<'a, AppState>> {
    app.try_state::<AppState>()
        .ok_or_else(|| WolfError::internal("Wolf is still starting up."))
}

/// Shared state handle type used inside `tauri::State` signatures.
pub type SharedState<'r> = tauri::State<'r, AppState>;

/// Marker for the Arc used by the reminder scheduler.
pub type SchedulerHandle = Arc<()>;
