use tauri::State;

use crate::error::WolfResult;
use crate::models::{Settings, SettingsPatch};
use crate::state::AppState;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> WolfResult<Settings> {
    Ok(state.settings())
}

#[tauri::command]
pub fn save_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> WolfResult<Settings> {
    let saved = state.replace_settings(settings)?;
    crate::commands::desktop::apply_settings(&app, &saved);
    Ok(saved)
}

#[tauri::command]
pub async fn select_model(state: State<'_, AppState>, model: String) -> WolfResult<Settings> {
    let settings = state.settings();
    let status = state.ollama.status(&settings.ollama_url, &model).await?;
    let resolved = status.model.clone().unwrap_or_else(|| model.clone());
    state.patch_settings(SettingsPatch {
        ollama_model: Some(resolved),
        ..SettingsPatch::default()
    })
}
