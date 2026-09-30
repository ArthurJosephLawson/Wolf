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
pub fn assistant_context(state: State<'_, AppState>, query: String) -> WolfResult<AssistantContext> {
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

/// Example questions shown in the empty assistant state.
#[tauri::command]
pub fn assistant_suggestions() -> Vec<String> {
    vec![
        "What do I have today?".to_string(),
        "What tasks are overdue?".to_string(),
        "When is my next meeting?".to_string(),
        "What should I focus on next?".to_string(),
        "How many focus sessions did I complete?".to_string(),
        "Summarize my day.".to_string(),
    ]
}
