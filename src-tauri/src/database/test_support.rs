use super::Database;

/// Open an in-memory database for tests. Available under `#[cfg(test)]` and to
/// integration tests through the public re-export in `wolf_lib`.
pub fn test_db() -> Database {
    Database::open_in_memory().expect("in-memory database")
}
