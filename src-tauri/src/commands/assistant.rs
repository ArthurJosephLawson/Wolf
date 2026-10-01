use tauri::State;

use crate::assistant;
use crate::commands::today;
use crate::error::WolfResult;
use crate::state::AppState;

#[tauri::command]
pub fn assistant_context(
    state: State<'_, AppState>,
    query: String,
) -> WolfResult<AssistantContext> {
    let context = assistant::build_context(&state.db, &query, today())?;
    let intent = assistant::classify_intent(&query).label().to_string();
    Ok(AssistantContext {
        query,
        intent,
        context,
        system_prompt: assistant::system_prompt(),
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantContext {
    pub query: String,
    pub intent: String,
    pub context: String,
    pub system_prompt: String,
}
