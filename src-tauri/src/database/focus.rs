use rusqlite::{params, Row};

use crate::database::Database;
use crate::error::{WolfError, WolfResult};
use crate::models::focus::{
    DailyFocus, FocusSession, FocusSessionKind, FocusStats, NewFocusSession,
};
use crate::models::new_id;

const SELECT_COLUMNS: &str =
    "id, started_at, ended_at, duration_seconds, completed, kind";

fn map_session(row: &Row<'_>) -> rusqlite::Result<FocusSession> {
    Ok(FocusSession {
        id: row.get(0)?,
        started_at: row.get(1)?,
        ended_at: row.get(2)?,
        duration_seconds: row.get::<_, i64>(3)? as u32,
        completed: row.get::<_, i64>(4)? != 0,
        kind: FocusSessionKind::parse(&row.get::<_, String>(5)?),
    })
}

impl Database {
    pub fn create_focus_session(&self, input: &NewFocusSession) -> WolfResult<FocusSession> {
        let started_at = validate_instant(&input.started_at, "start time")?;
        let ended_at = match &input.ended_at {
            Some(v) => Some(validate_instant(v, "end time")?),
            None => None,
        };
        if let Some(e) = ended_at {
            if e < started_at {
                return Err(WolfError::invalid(
                    "A focus session cannot end before it starts.",
                ));
            }
        }

        let session = FocusSession {
            id: new_id(),
            started_at: started_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            ended_at: ended_at
                .map(|e| e.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)),
            duration_seconds: input.duration_seconds.unwrap_or(0).min(24 * 60 * 60),
            completed: input.completed.unwrap_or(false),
            kind: input.kind.unwrap_or(FocusSessionKind::Focus),
        };

        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO focus_sessions
                   (id, started_at, ended_at, duration_seconds, completed, kind)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    session.id,
                    session.started_at,
                    session.ended_at,
                    session.duration_seconds,
                    session.completed as i64,
                    session.kind.as_str()
                ],
            )?;
            Ok(())
        })?;

        Ok(session)
    }

    pub fn list_focus_sessions(&self, limit: u32) -> WolfResult<Vec<FocusSession>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {SELECT_COLUMNS} FROM focus_sessions ORDER BY started_at DESC LIMIT ?1"
            ))?;
            let rows = stmt.query_map(params![limit], map_session)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(WolfError::from)
        })
    }

    pub fn delete_focus_session(&self, id: &str) -> WolfResult<()> {
        let removed = self.with_conn(|conn| {
            Ok(conn.execute("DELETE FROM focus_sessions WHERE id = ?1", params![id])?)
        })?;
        if removed == 0 {
            return Err(WolfError::not_found("Focus session"));
        }
        Ok(())
    }

    /// Aggregate counters used by the dashboard, the focus screen and the AI.
    pub fn focus_stats(&self, today_local: &str, week_start_local: &str) -> WolfResult<FocusStats> {
        self.with_conn(|conn| {
            let buckets: Vec<(i64, i64, i64)> = {
                let mut stmt = conn.prepare(
                    "SELECT
                        COALESCE(SUM(CASE WHEN substr(started_at, 1, 10) = ?1 THEN 1 ELSE 0 END), 0),
                        COALESCE(SUM(CASE WHEN substr(started_at, 1, 10) >= ?2 THEN 1 ELSE 0 END), 0),
                        COALESCE(COUNT(*), 0)
                     FROM focus_sessions
                     WHERE completed = 1 AND kind = 'focus'",
                )?;
                let rows = stmt.query_map(params![today_local, week_start_local], |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get(2)?))
                })?;
                rows.collect::<Result<Vec<_>, _>>()?
            };
            let (completed_today, completed_week, total_completed) =
                buckets.first().copied().unwrap_or((0, 0, 0));

            let minutes: Vec<(String, i64)> = {
                let mut stmt = conn.prepare(
                    "SELECT substr(started_at, 1, 10) AS day,
                            COALESCE(SUM(duration_seconds), 0) / 60
                     FROM focus_sessions
                     WHERE completed = 1 AND kind = 'focus' AND substr(started_at, 1, 10) >= ?1
                     GROUP BY day",
                )?;
                let rows = stmt.query_map(params![week_start_local], |r| {
                    Ok((r.get(0)?, r.get(1)?))
                })?;
                rows.collect::<Result<Vec<_>, _>>()?
            };
            let today_minutes: i64 = minutes
                .iter()
                .find(|(day, _)| day == today_local)
                .map(|(_, m)| *m)
                .unwrap_or(0);

            // Fill gaps so the sparkline always has exactly 7 points, oldest first.
            let mut daily_minutes = Vec::with_capacity(7);
            let start = chrono::NaiveDate::parse_from_str(week_start_local, "%Y-%m-%d").ok();
            for offset in 0..7 {
                let date = start
                    .map(|d| d + chrono::Duration::days(offset))
                    .map(|d| d.format("%Y-%m-%d").to_string());
                let minutes = date
                    .as_deref()
                    .and_then(|d| minutes.iter().find(|(day, _)| day == d))
                    .map(|(_, m)| *m)
                    .unwrap_or(0);
                daily_minutes.push(DailyFocus {
                    date: date.unwrap_or_default(),
                    minutes: minutes.max(0) as u32,
                });
            }

            Ok(FocusStats {
                completed_today: completed_today.max(0) as u32,
                completed_week: completed_week.max(0) as u32,
                total_completed: total_completed.max(0) as u32,
                focus_minutes_today: today_minutes.max(0) as u32,
                focus_minutes_week: minutes.iter().map(|(_, m)| *m).sum::<i64>().max(0) as u32,
                daily_minutes,
            })
        })
    }
}

fn validate_instant(raw: &str, field: &str) -> WolfResult<chrono::DateTime<chrono::Utc>> {
    chrono::DateTime::parse_from_rfc3339(raw.trim())
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .map_err(|_| {
            WolfError::invalid(format!(
                "`{raw}` is not a valid {field} (expected an RFC 3339 timestamp)."
            ))
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::test_support::test_db;

    fn session(start: &str, minutes: u32) -> NewFocusSession {
        NewFocusSession {
            started_at: format!("{start}T09:00:00.000Z"),
            ended_at: Some(format!("{start}T09:{:02}:00.000Z", 30)),
            duration_seconds: Some(minutes * 60),
            completed: Some(true),
            kind: Some(FocusSessionKind::Focus),
        }
    }

    #[test]
    fn create_and_list() {
        let db = test_db();
        let created = db.create_focus_session(&session("2026-09-28", 25)).expect("create");
        assert!(created.completed);
        assert_eq!(created.duration_seconds, 1500);
        assert_eq!(db.list_focus_sessions(10).unwrap().len(), 1);
    }

    #[test]
    fn stats_count_today_and_week() {
        let db = test_db();
        db.create_focus_session(&session("2026-09-28", 25)).unwrap();
        db.create_focus_session(&session("2026-09-28", 25)).unwrap();
        db.create_focus_session(&session("2026-09-21", 25)).unwrap();

        let stats = db.focus_stats("2026-09-28", "2026-09-22").expect("stats");
        assert_eq!(stats.completed_today, 2);
        assert_eq!(stats.completed_week, 2);
        assert_eq!(stats.total_completed, 3);
        assert_eq!(stats.focus_minutes_today, 50);
        assert_eq!(stats.daily_minutes.len(), 7);
    }

    #[test]
    fn breaks_are_not_counted_as_focus() {
        let db = test_db();
        let mut input = session("2026-09-28", 5);
        input.kind = Some(FocusSessionKind::ShortBreak);
        db.create_focus_session(&input).unwrap();

        let stats = db.focus_stats("2026-09-28", "2026-09-22").unwrap();
        assert_eq!(stats.completed_today, 0);
        assert_eq!(stats.focus_minutes_today, 0);
    }

    #[test]
    fn incomplete_sessions_are_excluded() {
        let db = test_db();
        let mut input = session("2026-09-28", 25);
        input.completed = Some(false);
        db.create_focus_session(&input).unwrap();
        assert_eq!(db.focus_stats("2026-09-28", "2026-09-22").unwrap().completed_today, 0);
    }

    #[test]
    fn rejects_backwards_session() {
        let db = test_db();
        let input = NewFocusSession {
            started_at: "2026-09-28T10:00:00Z".into(),
            ended_at: Some("2026-09-28T09:00:00Z".into()),
            ..Default::default()
        };
        assert_eq!(db.create_focus_session(&input).unwrap_err().kind(), "invalid");
    }

    #[test]
    fn rejects_malformed_timestamp() {
        let db = test_db();
        let input = NewFocusSession {
            started_at: "yesterday".into(),
            ..Default::default()
        };
        assert_eq!(db.create_focus_session(&input).unwrap_err().kind(), "invalid");
    }

    #[test]
    fn daily_series_is_dense() {
        let db = test_db();
        db.create_focus_session(&session("2026-09-22", 25)).unwrap();
        let stats = db.focus_stats("2026-09-28", "2026-09-22").unwrap();
        let dates: Vec<&str> = stats.daily_minutes.iter().map(|d| d.date.as_str()).collect();
        assert_eq!(
            dates,
            vec![
                "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27",
                "2026-09-28"
            ]
        );
        assert_eq!(stats.daily_minutes[0].minutes, 25);
        assert_eq!(stats.daily_minutes[6].minutes, 0);
    }
}
