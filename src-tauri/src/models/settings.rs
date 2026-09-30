use serde::{Deserialize, Serialize};

/// User-owned settings, persisted in the local `settings` table as JSON.
/// Nothing here is ever sent anywhere except the configured local Ollama URL.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Base URL of the local Ollama daemon.
    pub ollama_url: String,
    pub ollama_model: String,
    pub fallback_model: String,

    pub focus_minutes: u32,
    pub short_break_minutes: u32,
    pub long_break_minutes: u32,
    /// Focus sessions completed before a long break is offered.
    pub sessions_before_long_break: u32,

    pub notifications_enabled: bool,
    pub habit_reminders_enabled: bool,
    pub event_reminders_enabled: bool,

    pub companion_enabled: bool,
    pub companion_always_on_top: bool,
    pub companion_scale: f64,
    pub companion_x: Option<f64>,
    pub companion_y: Option<f64>,

    pub start_minimized: bool,
    pub close_to_tray: bool,
    pub auto_check_ollama: bool,

    /// Palette identifier resolved by `src/styles/theme.css`.
    pub theme: String,
    /// Optional display name used in greetings.
    pub user_name: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            ollama_url: "http://localhost:11434".to_string(),
            ollama_model: "qwen2.5-coder".to_string(),
            fallback_model: "gemma2:2b".to_string(),

            focus_minutes: 25,
            short_break_minutes: 5,
            long_break_minutes: 15,
            sessions_before_long_break: 4,

            notifications_enabled: true,
            habit_reminders_enabled: false,
            event_reminders_enabled: true,

            companion_enabled: true,
            companion_always_on_top: true,
            companion_scale: 1.0,
            companion_x: None,
            companion_y: None,

            start_minimized: false,
            close_to_tray: true,
            auto_check_ollama: true,

            theme: "midnight".to_string(),
            user_name: "".to_string(),
        }
    }
}

impl Settings {
    /// Clamp every field into a range the rest of the app can rely on.
    pub fn sanitized(mut self) -> Self {
        let url = self.ollama_url.trim().to_string();
        self.ollama_url = if url.is_empty() {
            "http://localhost:11434".to_string()
        } else {
            url.trim_end_matches('/').to_string()
        };

        if self.ollama_model.trim().is_empty() {
            self.ollama_model = "qwen2.5-coder".to_string();
        }
        if self.fallback_model.trim().is_empty() {
            self.fallback_model = "gemma2:2b".to_string();
        }

        self.focus_minutes = self.focus_minutes.clamp(1, 180);
        self.short_break_minutes = self.short_break_minutes.clamp(1, 60);
        self.long_break_minutes = self.long_break_minutes.clamp(1, 120);
        self.sessions_before_long_break = self.sessions_before_long_break.clamp(1, 12);
        self.companion_scale = if self.companion_scale.is_finite() {
            self.companion_scale.clamp(0.5, 2.0)
        } else {
            1.0
        };
        self.theme = if self.theme.trim().is_empty() {
            "midnight".to_string()
        } else {
            self.theme.trim().to_string()
        };
        self.user_name = self.user_name.trim().chars().take(40).collect();
        self
    }
}

impl Settings {
    /// Apply only the fields the patch actually carries.
    ///
    /// `None` means "leave alone" — this is what keeps a companion-position
    /// save from wiping the user's Ollama model or focus durations.
    pub fn apply_patch(&mut self, patch: SettingsPatch) {
        if let Some(v) = patch.ollama_url {
            self.ollama_url = v;
        }
        if let Some(v) = patch.ollama_model {
            self.ollama_model = v;
        }
        if let Some(v) = patch.fallback_model {
            self.fallback_model = v;
        }
        if let Some(v) = patch.focus_minutes {
            self.focus_minutes = v;
        }
        if let Some(v) = patch.short_break_minutes {
            self.short_break_minutes = v;
        }
        if let Some(v) = patch.long_break_minutes {
            self.long_break_minutes = v;
        }
        if let Some(v) = patch.sessions_before_long_break {
            self.sessions_before_long_break = v;
        }
        if let Some(v) = patch.notifications_enabled {
            self.notifications_enabled = v;
        }
        if let Some(v) = patch.habit_reminders_enabled {
            self.habit_reminders_enabled = v;
        }
        if let Some(v) = patch.event_reminders_enabled {
            self.event_reminders_enabled = v;
        }
        if let Some(v) = patch.companion_enabled {
            self.companion_enabled = v;
        }
        if let Some(v) = patch.companion_always_on_top {
            self.companion_always_on_top = v;
        }
        if let Some(v) = patch.companion_scale {
            self.companion_scale = v;
        }
        if let Some(v) = patch.companion_x {
            self.companion_x = Some(v);
        }
        if let Some(v) = patch.companion_y {
            self.companion_y = Some(v);
        }
        if let Some(v) = patch.start_minimized {
            self.start_minimized = v;
        }
        if let Some(v) = patch.close_to_tray {
            self.close_to_tray = v;
        }
        if let Some(v) = patch.auto_check_ollama {
            self.auto_check_ollama = v;
        }
        if let Some(v) = patch.theme {
            self.theme = v;
        }
        if let Some(v) = patch.user_name {
            self.user_name = v;
        }
    }
}

/// A partial settings update: every field is optional, and a missing field is
/// left untouched. Used for internal updates such as remembering the companion
/// position, where the caller genuinely only knows one or two values.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct SettingsPatch {
    pub ollama_url: Option<String>,
    pub ollama_model: Option<String>,
    pub fallback_model: Option<String>,
    pub focus_minutes: Option<u32>,
    pub short_break_minutes: Option<u32>,
    pub long_break_minutes: Option<u32>,
    pub sessions_before_long_break: Option<u32>,
    pub notifications_enabled: Option<bool>,
    pub habit_reminders_enabled: Option<bool>,
    pub event_reminders_enabled: Option<bool>,
    pub companion_enabled: Option<bool>,
    pub companion_always_on_top: Option<bool>,
    pub companion_scale: Option<f64>,
    pub companion_x: Option<f64>,
    pub companion_y: Option<f64>,
    pub start_minimized: Option<bool>,
    pub close_to_tray: Option<bool>,
    pub auto_check_ollama: Option<bool>,
    pub theme: Option<String>,
    pub user_name: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_sane() {
        let s = Settings::default();
        assert_eq!(s.ollama_url, "http://localhost:11434");
        assert_eq!(s.focus_minutes, 25);
        assert_eq!(s.short_break_minutes, 5);
        assert_eq!(s.long_break_minutes, 15);
    }

    #[test]
    fn sanitizing_clamps_and_repairs_values() {
        let s = Settings {
            ollama_url: "  ".into(),
            focus_minutes: 0,
            short_break_minutes: 9_999,
            companion_scale: f64::NAN,
            user_name: "  Arthur  ".into(),
            ..Settings::default()
        }
        .sanitized();

        assert_eq!(s.ollama_url, "http://localhost:11434");
        assert_eq!(s.focus_minutes, 1);
        assert_eq!(s.short_break_minutes, 60);
        assert_eq!(s.companion_scale, 1.0);
        assert_eq!(s.user_name, "Arthur");
    }

    #[test]
    fn sanitizing_trims_trailing_slash() {
        let s = Settings {
            ollama_url: "http://127.0.0.1:11434/".into(),
            ..Settings::default()
        }
        .sanitized();
        assert_eq!(s.ollama_url, "http://127.0.0.1:11434");
    }

    #[test]
    fn round_trips_through_json() {
        let original = Settings::default();
        let json = serde_json::to_string(&original).expect("encode");
        let decoded: Settings = serde_json::from_str(&json).expect("decode");
        assert_eq!(original, decoded);
    }
}
