//! Forward-only SQL migrator.
//!
//! Migrations live in `migrations/*.sql` at the repository root and are embedded
//! into the binary at compile time. They are applied in the order of the
//! `MIGRATIONS` array, not in filename order, exactly once each. No table is
//! ever dropped or recreated by a migration.

use std::path::Path;

use rusqlite::Connection;

use crate::error::{WolfError, WolfResult};

const MIGRATIONS: &[(&str, &str)] = &[
    (
        "0001_init",
        include_str!("../../../migrations/0001_init.sql"),
    ),
    (
        "0002_settings",
        include_str!("../../../migrations/0002_settings.sql"),
    ),
];

/// Create the bookkeeping table if it does not exist yet.
pub fn ensure_migration_table(conn: &Connection) -> WolfResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            name       TEXT PRIMARY KEY NOT NULL,
            applied_at TEXT NOT NULL
         );",
    )?;
    Ok(())
}

/// Apply every migration that has not been recorded yet.
pub fn migrate(conn: &Connection) -> WolfResult<usize> {
    ensure_migration_table(conn)?;

    let already: Vec<String> = {
        let mut stmt = conn.prepare("SELECT name FROM schema_migrations")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };

    let mut applied = 0usize;
    for (name, sql) in MIGRATIONS {
        if already.iter().any(|n| n == name) {
            continue;
        }
        // A migration is a single transaction: it either lands fully or not at all.
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(sql)?;
        tx.execute(
            "INSERT INTO schema_migrations (name, applied_at) VALUES (?1, ?2)",
            rusqlite::params![name, crate::models::now_iso()],
        )?;
        tx.commit()?;
        applied += 1;
        log::info!("applied migration {name}");
    }

    Ok(applied)
}

/// Number of migrations recorded in the database. Used by tests and diagnostics.
pub fn applied_count(conn: &Connection) -> WolfResult<usize> {
    ensure_migration_table(conn)?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM schema_migrations", [], |r| {
        r.get(0)
    })?;
    Ok(count as usize)
}

/// Open (creating parent directories as needed) a SQLite database at `path`
/// with the pragmas Wolf relies on.
pub fn open_database(path: &Path) -> WolfResult<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            WolfError::internal(format!(
                "Could not create the Wolf data folder {}: {e}",
                parent.display()
            ))
        })?;
    }

    let conn = Connection::open(path)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA temp_store = MEMORY;",
    )?;
    Ok(conn)
}
