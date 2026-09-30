pub mod calendar;
pub mod focus;
pub mod habits;
pub mod migrator;
pub mod settings;
pub mod tasks;
#[cfg(test)]
pub mod test_support;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use crate::error::{WolfError, WolfResult};

/// Handle to the local SQLite database.
///
/// The connection is shared behind a mutex because Tauri dispatches commands
/// from a multithreaded runtime and `rusqlite::Connection` is `Send` but not
/// `Sync`. Holding a single writer keeps WAL contention and `SQLITE_BUSY`
/// retries out of the repositories.
#[derive(Clone)]
pub struct Database {
    inner: Arc<Mutex<Connection>>,
}

impl Database {
    /// Open the database at `path`, applying any outstanding migrations.
    pub fn open(path: &Path) -> WolfResult<Self> {
        let conn = migrator::open_database(path)?;
        migrator::migrate(&conn)?;
        Ok(Database {
            inner: Arc::new(Mutex::new(conn)),
        })
    }

    /// Open an in-memory database. Used by the test-suite.
    pub fn open_in_memory() -> WolfResult<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        migrator::migrate(&conn)?;
        Ok(Database {
            inner: Arc::new(Mutex::new(conn)),
        })
    }

    /// Run `f` with exclusive access to the connection.
    pub fn with_conn<T>(&self, f: impl FnOnce(&Connection) -> WolfResult<T>) -> WolfResult<T> {
        let guard = self.inner.lock().map_err(|_| {
            WolfError::internal("The local database lock was poisoned by an earlier error.")
        })?;
        f(&guard)
    }
}

/// Default location of the Wolf database: `$XDG_CONFIG_HOME/wolf/wolf.db`
/// (which is `~/.config/wolf/wolf.db` unless the user overrides XDG).
pub fn default_database_path() -> WolfResult<PathBuf> {
    let base = config_dir()?;
    Ok(base.join("wolf").join("wolf.db"))
}

/// Resolve the user's configuration directory without hard-coding a username.
pub fn config_dir() -> WolfResult<PathBuf> {
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        if !xdg.trim().is_empty() {
            return Ok(PathBuf::from(xdg));
        }
    }
    match std::env::var("HOME") {
        Ok(home) if !home.trim().is_empty() => Ok(PathBuf::from(home).join(".config")),
        _ => Err(WolfError::internal(
            "Wolf could not determine your home directory. Set HOME or XDG_CONFIG_HOME.",
        )),
    }
}
