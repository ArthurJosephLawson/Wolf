//! Domain models shared between the persistence layer and the UI.
//!
//! Every type here is `serde`-round-trippable so the exact same struct crosses
//! the Tauri IPC boundary. Timestamps travel as RFC 3339 strings and calendar
//! dates as `YYYY-MM-DD` strings, which keeps SQLite comparisons textual and
//! debuggable.

use serde::{Deserialize, Serialize};

pub mod calendar;
pub mod focus;
pub mod habit;
pub mod ollama;
pub mod settings;
pub mod task;

/// Zero-based priority, lower is more urgent. Mirrored in `src/types/task.ts`.
pub const PRIORITY_LOW: i64 = 0;
pub const PRIORITY_NORMAL: i64 = 1;
pub const PRIORITY_HIGH: i64 = 2;
pub const PRIORITY_URGENT: i64 = 3;

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Shared shape for every "sortable, filterable list" screen.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskSort {
    /// Manual/creation order: incomplete first, then by due date.
    #[default]
    Default,
    DueDate,
    Priority,
    Alphabetical,
    Created,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskFilter {
    #[default]
    All,
    Active,
    Completed,
    Today,
    Overdue,
}

// Re-export the domain types so the rest of the crate can `use crate::models::X`
// without knowing which file a type lives in.
pub use calendar::{
    CalendarEvent, CalendarEventUpdate, DaySummary, EventListQuery, NewCalendarEvent,
};
pub use focus::{DailyFocus, FocusSession, FocusSessionKind, FocusStats, NewFocusSession};
pub use habit::{
    Habit, HabitCompletion, HabitDay, HabitFrequency, HabitUpdate, HabitWithProgress, NewHabit,
};
pub use ollama::{
    ChatMessage, ChatRequest, ChatResponse, ChatRole, OllamaModel, OllamaState, OllamaStatus, StreamDone,
};
pub use settings::{Settings, SettingsPatch};
pub use task::{NewTask, Task, TaskListQuery, TaskStats, TaskUpdate};
