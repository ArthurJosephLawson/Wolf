//! Tauri IPC surface.
//!
//! Every command is a thin adapter: validate, delegate to a repository, map
//! errors. No SQL and no business rules live in this module.

pub mod assistant;
pub mod calendar;
pub mod desktop;
pub mod focus;
pub mod habits;
pub mod ollama;
pub mod settings;
pub mod tasks;

use chrono::Datelike;

/// Local calendar date used for all "today" logic, read from the OS.
pub fn today() -> chrono::NaiveDate {
    chrono::Local::now().date_naive()
}

/// Local wall-clock time in the naive format used by calendar events.
pub fn local_now() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M").to_string()
}

/// Monday of the week containing `date`, as `YYYY-MM-DD`.
pub fn week_start(date: chrono::NaiveDate) -> String {
    let weekday = date.weekday().num_days_from_monday() as i64;
    (date - chrono::Duration::days(weekday))
        .format("%Y-%m-%d")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn week_start_is_monday() {
        // 2026-09-28 is a Monday, so it is already its own week start.
        assert_eq!(week_start(chrono::NaiveDate::from_ymd_opt(2026, 9, 28).unwrap()), "2026-09-28");
        // 2026-09-30 is a Wednesday.
        assert_eq!(week_start(chrono::NaiveDate::from_ymd_opt(2026, 9, 30).unwrap()), "2026-09-28");
        // 2026-10-04 is a Sunday, so that week still started on 2026-09-28.
        assert_eq!(week_start(chrono::NaiveDate::from_ymd_opt(2026, 10, 4).unwrap()), "2026-09-28");
        // 2026-10-05 is the next Monday.
        assert_eq!(week_start(chrono::NaiveDate::from_ymd_opt(2026, 10, 5).unwrap()), "2026-10-05");
    }
}
