use rusqlite::params;

use crate::database::Database;
use crate::error::WolfResult;
use crate::models::Settings;

const SETTINGS_KEY: &str = "app";

impl Database {
    /// Load the persisted settings, falling back to defaults when absent or
    /// unreadable. A corrupt settings blob must never stop the app from
    /// starting, so the raw JSON is only trusted after it deserialises.
    pub fn load_settings(&self) -> WolfResult<Settings> {
        let raw: Option<String> = self.with_conn(|conn| {
            Ok(conn
                .query_row(
                    "SELECT value FROM settings WHERE key = ?1",
                    params![SETTINGS_KEY],
                    |r| r.get(0),
                )
                .ok())
        })?;

        let Some(raw) = raw else {
            return Ok(Settings::default());
        };

        Ok(match serde_json::from_str::<Settings>(&raw) {
            Ok(settings) => settings.sanitized(),
            Err(err) => {
                log::warn!("stored settings were unreadable ({err}); using defaults");
                Settings::default()
            }
        })
    }

    /// Persist settings, always writing a sanitised copy.
    pub fn save_settings(&self, settings: &Settings) -> WolfResult<Settings> {
        let clean = settings.clone().sanitized();
        let encoded = serde_json::to_string(&clean)
            .map_err(|e| crate::error::WolfError::internal(format!("Could not encode settings: {e}")))?;

        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                params![SETTINGS_KEY, encoded, crate::models::now_iso()],
            )?;
            Ok(())
        })?;

        Ok(clean)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::test_support::test_db;

    #[test]
    fn defaults_when_empty() {
        let db = test_db();
        assert_eq!(db.load_settings().unwrap(), Settings::default());
    }

    #[test]
    fn round_trip() {
        let db = test_db();
        let custom = Settings {
            ollama_model: "gemma2:2b".into(),
            focus_minutes: 50,
            theme: "dusk".into(),
            ..Settings::default()
        };
        let saved = db.save_settings(&custom).unwrap();
        assert_eq!(saved.focus_minutes, 50);
        assert_eq!(db.load_settings().unwrap(), saved);
    }

    #[test]
    fn values_are_sanitised_on_save() {
        let db = test_db();
        let saved = db
            .save_settings(&Settings { focus_minutes: 9_999, ..Settings::default() })
            .unwrap();
        assert_eq!(saved.focus_minutes, 180);
        assert_eq!(db.load_settings().unwrap().focus_minutes, 180);
    }

    #[test]
    fn corrupt_blob_falls_back_to_defaults() {
        let db = test_db();
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO settings (key, value, updated_at) VALUES ('app', 'not json', 'now')",
                [],
            )?;
            Ok(())
        })
        .unwrap();
        assert_eq!(db.load_settings().unwrap(), Settings::default());
    }
}
