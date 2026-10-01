use tauri::{AppHandle, Manager, Runtime, State};

use crate::error::{WolfError, WolfResult};
use crate::models::Settings;
use crate::notifications::{self, Notification};
use crate::state::AppState;
use crate::windows;

#[tauri::command]
pub fn show_main_window(app: AppHandle) -> WolfResult<()> {
    windows::show_main(&app)
}

#[tauri::command]
pub fn hide_main_window(app: AppHandle) -> WolfResult<()> {
    windows::hide_main(&app)
}

#[tauri::command]
pub fn set_companion_visible(app: AppHandle, visible: bool) -> WolfResult<bool> {
    let settings = crate::state::state(&app)?.settings();
    if visible {
        windows::ensure_companion(&app)?;
    }
    windows::set_companion_visible(&app, visible)?;
    if !settings.companion_always_on_top {
        windows::set_companion_always_on_top(&app, false)?;
    }
    Ok(visible)
}

#[tauri::command]
pub fn toggle_companion(app: AppHandle) -> WolfResult<bool> {
    windows::toggle_companion(&app)
}

#[tauri::command]
pub fn set_companion_always_on_top(app: AppHandle, value: bool) -> WolfResult<()> {
    windows::set_companion_always_on_top(&app, value)
}

#[tauri::command]
pub fn save_companion_position(app: AppHandle) -> WolfResult<()> {
    windows::persist_companion_position(&app)
}

#[tauri::command]
pub fn quit_app(app: AppHandle) -> WolfResult<()> {
    windows::quit(&app);
    Ok(())
}

#[tauri::command]
pub fn send_notification(
    app: AppHandle,
    summary: String,
    body: String,
    urgent: Option<bool>,
) -> WolfResult<()> {
    let notification = Notification {
        summary: truncate(&summary, 80),
        body: truncate(&body, 400),
        urgent: urgent.unwrap_or(false),
    };
    notifications::notify(&app, notification).map_err(WolfError::desktop)
}

#[tauri::command]
pub fn notifications_available() -> bool {
    notifications::is_available()
}

fn truncate(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    let cut: String = value.chars().take(max_chars.saturating_sub(1)).collect();
    format!("{cut}…")
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentInfo {
    pub session_type: String,
    pub desktop: String,
    pub app_version: String,
    pub data_dir: String,
    pub notifications_available: bool,
}

#[tauri::command]
pub fn environment(app: AppHandle) -> EnvironmentInfo {
    let session_type = std::env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "unknown".to_string());
    let desktop = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_else(|_| "unknown".to_string());

    EnvironmentInfo {
        session_type,
        desktop,
        app_version: app.package_info().version.to_string(),
        data_dir: crate::database::config_dir()
            .map(|p| p.join("wolf").display().to_string())
            .unwrap_or_else(|_| "unavailable".into()),
        notifications_available: notifications::is_available(),
    }
}

pub fn apply_settings<R: Runtime>(app: &AppHandle<R>, settings: &Settings) {
    if let Err(err) = windows::set_companion_always_on_top(app, settings.companion_always_on_top) {
        log::warn!("could not update companion always-on-top: {err}");
    }
    if let Err(err) = windows::set_companion_visible(app, settings.companion_enabled) {
        log::warn!("could not update companion visibility: {err}");
    }
}

pub fn handle_close_requested<R: Runtime>(app: &AppHandle<R>) -> bool {
    let close_to_tray = crate::state::state(app)
        .map(|s| s.settings().close_to_tray)
        .unwrap_or(true);
    if close_to_tray {
        let _ = windows::persist_companion_position(app);
        let _ = windows::hide_main(app);
        return true;
    }
    false
}

pub fn state_ref<R: Runtime>(app: &AppHandle<R>) -> WolfResult<State<'_, AppState>> {
    app.try_state::<AppState>()
        .ok_or_else(|| WolfError::internal("Wolf is still starting up."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncation_is_ellipsised_not_hard_cut() {
        assert_eq!(truncate("hello", 80), "hello");
        let long = "x".repeat(120);
        let cut = truncate(&long, 10);
        assert_eq!(cut.chars().count(), 10);
        assert!(cut.ends_with('…'));
    }

    #[test]
    fn multibyte_truncation_keeps_valid_utf8() {
        let value = "é".repeat(50);
        let cut = truncate(&value, 5);
        assert_eq!(cut, "éééé…");
    }
}
