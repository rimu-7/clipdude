use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::Serialize;

use crate::privacy;

pub const DB_FILE_NAME: &str = "clipboard.db";
const SCHEMA_VERSION: i64 = 3;
const PREVIEW_CHARS: i64 = 400;
const MAX_SEARCH_TERMS: usize = 8;
const DAY_MS: i64 = 24 * 60 * 60 * 1000;

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn days_ago_ms(days: u32) -> i64 {
    now_ms() - i64::from(days) * DAY_MS
}

#[derive(Debug, Clone, Serialize)]
pub struct ClipSummary {
    pub id: i64,
    /// The first few hundred characters, masked when the clip is sensitive.
    pub preview: String,
    pub length: i64,
    pub is_pinned: bool,
    pub is_sensitive: bool,
    pub source_app: String,
    /// Unix time in milliseconds of the last copy.
    pub last_used: i64,
}

#[derive(Debug, Serialize)]
pub struct ClipPage {
    pub clips: Vec<ClipSummary>,
    pub has_more: bool,
}

#[derive(Debug, Default, Serialize)]
pub struct Stats {
    pub total: i64,
    pub pinned: i64,
}

pub struct Database {
    conn: Connection,
    path: PathBuf,
}

impl Database {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        conn.busy_timeout(Duration::from_secs(5))?;
        // A single rollback-journal file stays consistent in folders that sync services
        // (iCloud, Dropbox) copy file by file; WAL's extra files do not.
        conn.pragma_update_and_check(None, "journal_mode", "DELETE", |row| row.get::<_, String>(0))?;
        conn.pragma_update(None, "synchronous", "FULL")?;
        // Overwrite deleted clips on disk so cleared secrets do not linger in free pages.
        conn.pragma_update(None, "secure_delete", "ON")?;
        conn.pragma_update(None, "temp_store", "MEMORY")?;

        let db = Self {
            conn,
            path: path.to_path_buf(),
        };
        db.migrate()?;
        Ok(db)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn migrate(&self) -> rusqlite::Result<()> {
        let conn = &self.conn;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS clips (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT UNIQUE,
                is_pinned INTEGER DEFAULT 0,
                source_app TEXT DEFAULT '',
                is_sensitive INTEGER DEFAULT 0,
                content_type TEXT DEFAULT 'text',
                tags TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_used INTEGER NOT NULL DEFAULT 0
            );",
        )?;

        let columns: HashSet<String> = conn
            .prepare("PRAGMA table_info(clips)")?
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<rusqlite::Result<_>>()?;
        let added_columns = [
            ("source_app", "ALTER TABLE clips ADD COLUMN source_app TEXT DEFAULT ''"),
            ("is_sensitive", "ALTER TABLE clips ADD COLUMN is_sensitive INTEGER DEFAULT 0"),
            ("content_type", "ALTER TABLE clips ADD COLUMN content_type TEXT DEFAULT 'text'"),
            ("tags", "ALTER TABLE clips ADD COLUMN tags TEXT DEFAULT ''"),
            ("last_used", "ALTER TABLE clips ADD COLUMN last_used INTEGER NOT NULL DEFAULT 0"),
        ];
        for (column, ddl) in added_columns {
            if !columns.contains(column) {
                conn.execute(ddl, [])?;
            }
        }

        let version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
        // Must run before any UPDATE below, which would fire the legacy triggers.
        let dropped_legacy_index = version < 3 && self.drop_legacy_search_index()?;
        if version < 2 {
            conn.execute_batch(
                "BEGIN;
                 UPDATE clips
                    SET last_used = COALESCE(CAST(strftime('%s', created_at) AS INTEGER),
                                             CAST(strftime('%s', 'now') AS INTEGER)) * 1000
                  WHERE last_used = 0;
                 DROP INDEX IF EXISTS idx_clips_retention;
                 DROP INDEX IF EXISTS idx_clips_history;
                 COMMIT;",
            )?;
        }
        conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_clips_recent ON clips (is_pinned, last_used DESC);",
        )?;
        if version < SCHEMA_VERSION {
            conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
        }
        if dropped_legacy_index {
            // The old index was usually most of the file; give that space back.
            if let Err(error) = conn.execute_batch("VACUUM;") {
                eprintln!("Could not compact the database after removing the old index: {error}");
            }
        }
        Ok(())
    }

    /// Older ClipDude builds kept an external-content FTS5 index in sync through
    /// triggers. Once it drifts out of sync, every write to `clips` fails with
    /// "database disk image is malformed". Search no longer uses it, so drop it.
    /// Returns whether anything was removed.
    fn drop_legacy_search_index(&self) -> rusqlite::Result<bool> {
        let conn = &self.conn;
        let triggers: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'clips'")?
            .query_map([], |row| row.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        let has_fts: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'clips_fts')",
            [],
            |row| row.get(0),
        )?;
        if triggers.is_empty() && !has_fts {
            return Ok(false);
        }
        let mut sql = String::from("BEGIN;");
        for trigger in &triggers {
            sql.push_str(&format!("DROP TRIGGER IF EXISTS \"{}\";", trigger.replace('"', "\"\"")));
        }
        sql.push_str("DROP TABLE IF EXISTS clips_fts; COMMIT;");
        conn.execute_batch(&sql)?;
        Ok(true)
    }

    /// Inserts a clip, or moves an existing identical clip to the top of the history.
    pub fn record(&self, content: &str, source_app: &str, sensitive: bool) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO clips (content, source_app, is_sensitive, last_used, created_at)
             VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
             ON CONFLICT(content) DO UPDATE SET
                last_used = excluded.last_used,
                created_at = CURRENT_TIMESTAMP,
                source_app = CASE WHEN excluded.source_app <> '' THEN excluded.source_app
                                  ELSE clips.source_app END,
                is_sensitive = excluded.is_sensitive",
            params![content, source_app, sensitive, now_ms()],
        )?;
        Ok(())
    }

    pub fn touch(&self, id: i64) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE clips SET last_used = ?1, created_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![now_ms(), id],
        )?;
        Ok(())
    }

    pub fn content(&self, id: i64) -> rusqlite::Result<Option<String>> {
        self.conn
            .query_row("SELECT content FROM clips WHERE id = ?1", [id], |row| {
                row.get::<_, Option<String>>(0)
            })
            .optional()
            .map(Option::flatten)
    }

    pub fn list(&self, query: &str, pinned_only: bool, offset: u32, limit: u32) -> rusqlite::Result<ClipPage> {
        let patterns: Vec<String> = query
            .split_whitespace()
            .take(MAX_SEARCH_TERMS)
            .map(|term| format!("%{}%", escape_like(term)))
            .collect();

        let mut sql = format!(
            "SELECT id, substr(COALESCE(content, ''), 1, {PREVIEW_CHARS}), length(content),
                    COALESCE(is_pinned, 0), COALESCE(is_sensitive, 0),
                    COALESCE(source_app, ''), last_used
               FROM clips WHERE content IS NOT NULL"
        );
        if pinned_only {
            sql.push_str(" AND is_pinned = 1");
        }
        for index in 1..=patterns.len() {
            sql.push_str(&format!(" AND content LIKE ?{index} ESCAPE '\\'"));
        }
        sql.push_str(&format!(
            " ORDER BY is_pinned DESC, last_used DESC, id DESC LIMIT {} OFFSET {offset}",
            u64::from(limit) + 1
        ));

        let mut clips = self
            .conn
            .prepare(&sql)?
            .query_map(params_from_iter(patterns.iter()), |row| {
                Ok(ClipSummary {
                    id: row.get(0)?,
                    preview: row.get(1)?,
                    length: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                    is_pinned: row.get::<_, i64>(3)? != 0,
                    is_sensitive: row.get::<_, i64>(4)? != 0,
                    source_app: row.get(5)?,
                    last_used: row.get(6)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let has_more = clips.len() > limit as usize;
        clips.truncate(limit as usize);
        for clip in clips.iter_mut().filter(|clip| clip.is_sensitive) {
            clip.preview = privacy::mask(&clip.preview);
        }
        Ok(ClipPage { clips, has_more })
    }

    pub fn stats(&self) -> rusqlite::Result<Stats> {
        self.conn.query_row(
            "SELECT COUNT(*), COALESCE(SUM(is_pinned = 1), 0) FROM clips",
            [],
            |row| {
                Ok(Stats {
                    total: row.get(0)?,
                    pinned: row.get(1)?,
                })
            },
        )
    }

    pub fn toggle_pin(&self, id: i64) -> rusqlite::Result<bool> {
        self.conn.query_row(
            "UPDATE clips SET is_pinned = CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END
              WHERE id = ?1 RETURNING is_pinned",
            [id],
            |row| Ok(row.get::<_, i64>(0)? == 1),
        )
    }

    pub fn delete(&self, id: i64) -> rusqlite::Result<usize> {
        self.conn.execute("DELETE FROM clips WHERE id = ?1", [id])
    }

    /// Deletes unpinned clips that were last copied before `cutoff_ms`.
    pub fn delete_unused_since(&self, cutoff_ms: i64) -> rusqlite::Result<usize> {
        self.conn.execute(
            "DELETE FROM clips WHERE is_pinned = 0 AND last_used < ?1",
            [cutoff_ms],
        )
    }

    /// Keeps only the `max` most recently used unpinned clips.
    pub fn enforce_max(&self, max: u32) -> rusqlite::Result<usize> {
        self.conn.execute(
            "DELETE FROM clips WHERE id IN (
                SELECT id FROM clips WHERE is_pinned = 0
                 ORDER BY last_used DESC, id DESC LIMIT -1 OFFSET ?1)",
            [max],
        )
    }

    /// Applies both retention rules. A value of 0 disables that rule.
    pub fn apply_retention(&self, retention_days: u32, max_items: u32) -> rusqlite::Result<usize> {
        let mut removed = 0;
        if retention_days > 0 {
            removed += self.delete_unused_since(days_ago_ms(retention_days))?;
        }
        if max_items > 0 {
            removed += self.enforce_max(max_items)?;
        }
        Ok(removed)
    }

    /// Counts how many clips `apply_retention` would delete with these values.
    pub fn retention_impact(&self, retention_days: u32, max_items: u32) -> rusqlite::Result<i64> {
        let cutoff = if retention_days > 0 { days_ago_ms(retention_days) } else { i64::MIN };
        let offset = if max_items > 0 { i64::from(max_items) } else { i64::MAX };
        self.conn.query_row(
            "SELECT COUNT(*) FROM clips WHERE is_pinned = 0 AND (
                last_used < ?1 OR id IN (
                    SELECT id FROM clips WHERE is_pinned = 0
                     ORDER BY last_used DESC, id DESC LIMIT -1 OFFSET ?2))",
            params![cutoff, offset],
            |row| row.get(0),
        )
    }

    pub fn clear(&self, include_pinned: bool) -> rusqlite::Result<usize> {
        let sql = if include_pinned {
            "DELETE FROM clips"
        } else {
            "DELETE FROM clips WHERE is_pinned = 0"
        };
        self.conn.execute(sql, [])
    }

    /// Rebuilds the file to reclaim space left by deleted clips.
    pub fn optimize(&self) -> rusqlite::Result<()> {
        self.conn.execute_batch("VACUUM; PRAGMA optimize;")
    }

    /// Writes a compact, consistent copy of the database to `dest`.
    pub fn copy_to(&self, dest: &Path) -> rusqlite::Result<()> {
        self.conn
            .execute("VACUUM INTO ?1", [dest.to_string_lossy()])
            .map(|_| ())
    }

    pub fn size_bytes(&self) -> u64 {
        ["", "-wal"]
            .iter()
            .filter_map(|suffix| {
                let mut name = self.path.as_os_str().to_owned();
                name.push(suffix);
                std::fs::metadata(PathBuf::from(name)).ok()
            })
            .map(|meta| meta.len())
            .sum()
    }
}

fn escape_like(term: &str) -> String {
    let mut escaped = String::with_capacity(term.len());
    for ch in term.chars() {
        if matches!(ch, '\\' | '%' | '_') {
            escaped.push('\\');
        }
        escaped.push(ch);
    }
    escaped
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db(name: &str) -> (Database, PathBuf) {
        let dir = std::env::temp_dir().join(format!("clipdude-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(DB_FILE_NAME);
        (Database::open(&path).unwrap(), dir)
    }

    #[test]
    fn migrates_legacy_schema_and_backfills_last_used() {
        let dir = std::env::temp_dir().join(format!("clipdude-test-legacy-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(DB_FILE_NAME);
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(
                "CREATE TABLE clips (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT UNIQUE,
                   is_pinned INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
                 INSERT INTO clips (content, created_at) VALUES ('old', '2020-01-01 00:00:00');
                 INSERT INTO clips (content) VALUES ('new');",
            )
            .unwrap();
        }
        let db = Database::open(&path).unwrap();
        assert_eq!(db.stats().unwrap().total, 2);
        // The 2020 clip is older than any retention window; the fresh one is not.
        assert_eq!(db.apply_retention(30, 0).unwrap(), 1);
        let page = db.list("", false, 0, 10).unwrap();
        assert_eq!(page.clips.len(), 1);
        assert_eq!(page.clips[0].preview, "new");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn drops_out_of_sync_legacy_fts_index() {
        let dir = std::env::temp_dir().join(format!("clipdude-test-fts-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(DB_FILE_NAME);
        {
            // Rows inserted before the triggers existed are missing from the index,
            // which is how real databases drifted out of sync.
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(
                "CREATE TABLE clips (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT UNIQUE,
                   is_pinned INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
                 INSERT INTO clips (content) VALUES ('first'), ('second');
                 CREATE VIRTUAL TABLE clips_fts USING fts5(content, content='clips', content_rowid='id');
                 CREATE TRIGGER clips_ad AFTER DELETE ON clips BEGIN
                   INSERT INTO clips_fts(clips_fts, rowid, content) VALUES('delete', old.id, old.content);
                 END;
                 CREATE TRIGGER clips_au AFTER UPDATE ON clips BEGIN
                   INSERT INTO clips_fts(clips_fts, rowid, content) VALUES('delete', old.id, old.content);
                   INSERT INTO clips_fts(rowid, content) VALUES (new.id, new.content);
                 END;",
            )
            .unwrap();
            assert!(conn.execute("DELETE FROM clips", []).is_err(), "fixture should be broken");
        }
        let db = Database::open(&path).unwrap();
        assert_eq!(db.stats().unwrap().total, 2);
        assert_eq!(db.clear(false).unwrap(), 2);
        let leftovers: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'clips_fts%' OR type = 'trigger'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(leftovers, 0);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn record_dedupes_and_bumps_to_top() {
        let (db, dir) = temp_db("dedupe");
        db.record("a", "", false).unwrap();
        std::thread::sleep(Duration::from_millis(5));
        db.record("b", "", false).unwrap();
        std::thread::sleep(Duration::from_millis(5));
        db.record("a", "app", false).unwrap();
        let page = db.list("", false, 0, 10).unwrap();
        let previews: Vec<_> = page.clips.iter().map(|c| c.preview.as_str()).collect();
        assert_eq!(previews, ["a", "b"]);
        assert_eq!(page.clips[0].source_app, "app");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn retention_keeps_pinned_clips_and_respects_max() {
        let (db, dir) = temp_db("retention");
        for i in 0..10 {
            db.record(&format!("clip {i}"), "", false).unwrap();
        }
        let first = db.list("clip 0", false, 0, 1).unwrap().clips[0].id;
        assert!(db.toggle_pin(first).unwrap());
        assert_eq!(db.retention_impact(0, 3).unwrap(), 6);
        assert_eq!(db.apply_retention(0, 3).unwrap(), 6);
        let stats = db.stats().unwrap();
        assert_eq!((stats.total, stats.pinned), (4, 1));
        assert_eq!(db.clear(false).unwrap(), 3);
        assert_eq!(db.clear(true).unwrap(), 1);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn search_matches_all_terms_literally() {
        let (db, dir) = temp_db("search");
        db.record("hello big world", "", false).unwrap();
        db.record("hello there", "", false).unwrap();
        db.record("100% sure", "", false).unwrap();
        assert_eq!(db.list("world hello", false, 0, 10).unwrap().clips.len(), 1);
        assert_eq!(db.list("HELLO", false, 0, 10).unwrap().clips.len(), 2);
        assert_eq!(db.list("0%", false, 0, 10).unwrap().clips.len(), 1);
        assert_eq!(db.list("%", false, 0, 10).unwrap().clips.len(), 1);
        let page = db.list("", false, 0, 2).unwrap();
        assert!(page.has_more);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn copy_to_produces_a_usable_database() {
        let (db, dir) = temp_db("copy");
        db.record("keep me", "", false).unwrap();
        let dest = dir.join("moved.db");
        db.copy_to(&dest).unwrap();
        let moved = Database::open(&dest).unwrap();
        assert_eq!(moved.stats().unwrap().total, 1);
        std::fs::remove_dir_all(dir).ok();
    }
}
