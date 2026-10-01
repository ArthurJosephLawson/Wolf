use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::database::Database;
use crate::error::{WolfError, WolfResult};
use crate::models::{new_id, now_iso, Task, TaskFilter, TaskListQuery, TaskSort};

const SELECT_COLUMNS: &str =
    "id, title, description, completed, priority, due_date, created_at, updated_at, completed_at";

fn map_row(row: &Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        completed: row.get::<_, i64>(3)? != 0,
        priority: row.get(4)?,
        due_date: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        completed_at: row.get(8)?,
    })
}

fn validate_title(raw: &str) -> WolfResult<String> {
    let title = raw.trim();
    if title.is_empty() {
        return Err(WolfError::invalid("A task needs a title."));
    }
    if title.chars().count() > 200 {
        return Err(WolfError::invalid(
            "A task title can be at most 200 characters.",
        ));
    }
    Ok(title.to_string())
}

fn validate_priority(value: i64) -> WolfResult<i64> {
    if (0..=3).contains(&value) {
        Ok(value)
    } else {
        Err(WolfError::invalid(
            "Priority must be 0 (low), 1 (normal), 2 (high) or 3 (urgent).",
        ))
    }
}

fn validate_date(value: &str) -> WolfResult<String> {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map(|_| value.to_string())
        .map_err(|_| {
            WolfError::invalid(format!(
                "`{value}` is not a valid date (expected YYYY-MM-DD)."
            ))
        })
}

impl Database {
    pub fn create_task(
        &self,
        title: &str,
        description: Option<&str>,
        priority: Option<i64>,
        due_date: Option<&str>,
    ) -> WolfResult<Task> {
        let title = validate_title(title)?;
        let priority = validate_priority(priority.unwrap_or(crate::models::PRIORITY_NORMAL))?;
        let due_date = match due_date.filter(|d| !d.trim().is_empty()) {
            Some(d) => Some(validate_date(d.trim())?),
            None => None,
        };

        let now = now_iso();
        let task = Task {
            id: new_id(),
            title,
            description: description.unwrap_or_default().to_string(),
            completed: false,
            priority,
            due_date,
            created_at: now.clone(),
            updated_at: now,
            completed_at: None,
        };

        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO tasks
                   (id, title, description, completed, priority, due_date, created_at, updated_at, completed_at)
                 VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6, ?7, NULL)",
                params![
                    task.id,
                    task.title,
                    task.description,
                    task.priority,
                    task.due_date,
                    task.created_at,
                    task.updated_at
                ],
            )?;
            Ok(())
        })?;

        Ok(task)
    }

    pub fn get_task(&self, id: &str) -> WolfResult<Task> {
        self.with_conn(|conn| {
            conn.query_row(
                &format!("SELECT {SELECT_COLUMNS} FROM tasks WHERE id = ?1"),
                params![id],
                map_row,
            )
            .optional()?
            .ok_or_else(|| WolfError::not_found("Task"))
        })
    }

    pub fn list_tasks(&self, query: &TaskListQuery, today: &str) -> WolfResult<Vec<Task>> {
        let filter = query.filter.unwrap_or_default();
        let sort = query.sort.unwrap_or_default();
        let search = query
            .search
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| format!("%{}%", s.to_lowercase()));

        let mut sql = format!("SELECT {SELECT_COLUMNS} FROM tasks WHERE 1 = 1");
        let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        match filter {
            TaskFilter::All => {}
            TaskFilter::Active => sql.push_str(" AND completed = 0"),
            TaskFilter::Completed => sql.push_str(" AND completed = 1"),
            TaskFilter::Today => {
                sql.push_str(" AND due_date = ?");
                args.push(Box::new(today.to_string()));
            }
            TaskFilter::Overdue => {
                sql.push_str(" AND completed = 0 AND due_date IS NOT NULL AND due_date < ?");
                args.push(Box::new(today.to_string()));
            }
        }

        if let Some(pattern) = search {
            sql.push_str(" AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)");
            args.push(Box::new(pattern.clone()));
            args.push(Box::new(pattern));
        }

        sql.push_str(match sort {
            TaskSort::Default => {
                " ORDER BY completed ASC, due_date IS NULL ASC, due_date ASC, priority DESC, created_at ASC"
            }
            TaskSort::DueDate => {
                " ORDER BY completed ASC, due_date IS NULL ASC, due_date ASC, priority DESC"
            }
            TaskSort::Priority => " ORDER BY completed ASC, priority DESC, due_date IS NULL ASC, due_date ASC",
            TaskSort::Alphabetical => " ORDER BY completed ASC, LOWER(title) ASC",
            TaskSort::Created => " ORDER BY completed ASC, created_at DESC",
        });

        self.with_conn(|conn| {
            let mut stmt = conn.prepare(&sql)?;
            let refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a.as_ref()).collect();
            let rows = stmt.query_map(refs.as_slice(), map_row)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(WolfError::from)
        })
    }

    pub fn update_task(
        &self,
        id: &str,
        title: Option<&str>,
        description: Option<&str>,
        completed: Option<bool>,
        priority: Option<i64>,
        due_date: Option<Option<&str>>,
    ) -> WolfResult<Task> {
        let title = title.map(validate_title).transpose()?;
        let priority = priority.map(validate_priority).transpose()?;

        let due_date = match due_date {
            Some(Some(d)) if !d.trim().is_empty() => Some(Some(validate_date(d.trim())?)),
            Some(Some(_)) => Some(None),
            Some(None) | None => None,
        };

        let now = now_iso();
        let completed_at = completed.map(|_| now_iso());

        let changed = self.with_conn(|conn| {
            let exists: Option<String> = conn
                .query_row("SELECT id FROM tasks WHERE id = ?1", params![id], |r| {
                    r.get(0)
                })
                .optional()?;
            if exists.is_none() {
                return Err(WolfError::not_found("Task"));
            }

            let sql = "UPDATE tasks SET
                             title        = COALESCE(?1, title),
                             description  = COALESCE(?2, description),
                             priority     = COALESCE(?3, priority),
                             completed    = COALESCE(?4, completed),
                             completed_at = CASE WHEN ?4 IS NULL THEN completed_at ELSE ?5 END,
                             updated_at   = ?6,
                             due_date     = CASE WHEN ?7 = 1 THEN ?8 ELSE due_date END
                         WHERE id = ?9";
            let rows = conn.execute(
                sql,
                params![
                    title,
                    description,
                    priority,
                    completed,
                    completed_at,
                    now,
                    due_date.is_some() as i64,
                    due_date.clone().flatten(),
                    id
                ],
            )?;
            Ok(rows)
        })?;

        if changed == 0 {
            return Err(WolfError::not_found("Task"));
        }
        self.get_task(id)
    }

    pub fn set_task_completed(&self, id: &str, completed: bool) -> WolfResult<Task> {
        self.update_task(id, None, None, Some(completed), None, None)
    }

    pub fn delete_task(&self, id: &str) -> WolfResult<()> {
        let removed = self
            .with_conn(|conn| Ok(conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?))?;
        if removed == 0 {
            return Err(WolfError::not_found("Task"));
        }
        Ok(())
    }

    pub fn task_stats(&self, today: &str) -> WolfResult<crate::models::task::TaskStats> {
        self.with_conn(|conn| task_stats_with(conn, today))
    }
}

pub(crate) fn task_stats_with(
    conn: &Connection,
    today: &str,
) -> WolfResult<crate::models::task::TaskStats> {
    let row = conn.query_row(
        "SELECT
            COUNT(*),
            COALESCE(SUM(completed), 0),
            COALESCE(SUM(CASE WHEN completed = 0 AND due_date = ?1 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN completed = 0 AND due_date IS NOT NULL AND due_date < ?1 THEN 1 ELSE 0 END), 0)
         FROM tasks",
        params![today],
        |r| {
            Ok(crate::models::task::TaskStats {
                total: r.get::<_, i64>(0)? as u32,
                completed: r.get::<_, i64>(1)? as u32,
                open: 0,
                due_today: r.get::<_, i64>(2)? as u32,
                overdue: r.get::<_, i64>(3)? as u32,
            })
        },
    )?;

    Ok(crate::models::task::TaskStats {
        open: row.total.saturating_sub(row.completed),
        ..row
    })
}
