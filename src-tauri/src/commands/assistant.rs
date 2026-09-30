//! Assistant support commands.
//!
//! The privacy requirement is that the user can always see exactly what Wolf
//! hands to the local model. `assistant_context` returns that block verbatim
//! for any question, before any model is contacted.

use tauri::State;

use crate::ai;
use crate::commands::today;
use crate::error::WolfResult;
use crate::state::AppState;

/// The `<local_context>` block Wolf would send for `query`.
#[tauri::command]
pub fn assistant_context(
    state: State<'_, AppState>,
    query: String,
) -> WolfResult<AssistantContext> {
    let context = ai::build_context(&state.db, &query, today())?;
    let intent = ai::classify_intent(&query).label().to_string();
    Ok(AssistantContext {
        query,
        intent,
        context,
        system_prompt: ai::system_prompt(),
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
