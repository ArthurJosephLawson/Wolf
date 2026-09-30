use super::Database;
use crate::error::{WolfError, WolfResult};

/// Open an in-memory database for tests. Available under `#[cfg(test)]` and to
/// integration tests through the public re-export in `wolf_lib`.
pub fn test_db() -> Database {
    Database::open_in_memory().expect("in-memory database")
}

pub fn fixed_date(value: &str) -> chrono::NaiveDate {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .unwrap_or_else(|_| panic!("test fixture must be a valid YYYY-MM-DD date, got {value}"))
}

pub fn date_str(date: chrono::NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

pub fn assert_valid_date(value: &str) -> WolfResult<()> {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map(|_| ())
        .map_err(|_| WolfError::invalid(format!("`{value}` is not a valid YYYY-MM-DD date.")))
}
