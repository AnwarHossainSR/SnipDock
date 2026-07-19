mod support;

use support::remove_database;
use snipdock_lib::{
    clipboard::{
        CaptureIgnoreReason, CaptureOutcome, CapturePolicy, CaptureSettings, ClipboardCapture,
    },
    db::Database,
    models::ContentType,
    os::ForegroundApp,
    repository::Repository,
};
use sqlx::{query, query_scalar};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT_DATABASE: AtomicU64 = AtomicU64::new(0);

struct FakeForegroundApp(Option<String>);

impl ForegroundApp for FakeForegroundApp {
    fn executable_name(&self) -> Option<String> {
        self.0.clone()
    }
}

fn database_path(test_name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "snipdock-policy-{test_name}-{}-{}.sqlite",
        std::process::id(),
        NEXT_DATABASE.fetch_add(1, Ordering::Relaxed)
    ))
}

fn settings() -> CaptureSettings {
    CaptureSettings {
        history_days: 30,
        max_items: 100,
        ignored_apps: Vec::new(),
        ignored_patterns: Vec::new(),
        ignored_content_types: Vec::new(),
    }
}

async fn cleanup(database: Database, path: PathBuf) {
    remove_database(database, path).await;
}

#[tokio::test]
async fn eligible_text_is_persisted_without_changing_whitespace() {
    let path = database_path("eligible");
    let database = Database::open(&path).await.unwrap();
    let capture = ClipboardCapture::new(
        Repository::new(database.pool().clone()),
        FakeForegroundApp(None),
        CapturePolicy::new(settings()).unwrap(),
    );

    let outcome = capture
        .capture("  fn main() {\r\n}\r\n".into(), ContentType::Code)
        .await
        .unwrap();

    let CaptureOutcome::Stored(item) = outcome else {
        panic!("eligible text was ignored");
    };
    assert_eq!(item.content, "  fn main() {\r\n}\r\n");
    assert_eq!(item.content_type, ContentType::Code);

    cleanup(database, path).await;
}

#[tokio::test]
async fn empty_app_pattern_and_content_type_exclusions_are_applied() {
    let path = database_path("ignored");
    let database = Database::open(&path).await.unwrap();
    let mut config = settings();
    config.ignored_apps = vec!["KeePass.exe".into()];
    config.ignored_patterns = vec![r"(?i)password\s*=".into()];
    config.ignored_content_types = vec![ContentType::Json];
    let capture = ClipboardCapture::new(
        Repository::new(database.pool().clone()),
        FakeForegroundApp(Some("keepass.EXE".into())),
        CapturePolicy::new(config).unwrap(),
    );

    assert_eq!(
        capture
            .capture("   ".into(), ContentType::PlainText)
            .await
            .unwrap(),
        CaptureOutcome::Ignored(CaptureIgnoreReason::Empty)
    );
    assert_eq!(
        capture
            .capture("ordinary".into(), ContentType::PlainText)
            .await
            .unwrap(),
        CaptureOutcome::Ignored(CaptureIgnoreReason::Application)
    );

    let mut pattern_config = settings();
    pattern_config.ignored_patterns = vec![r"(?i)password\s*=".into()];
    pattern_config.ignored_content_types = vec![ContentType::Json];
    let pattern_capture = ClipboardCapture::new(
        Repository::new(database.pool().clone()),
        FakeForegroundApp(None),
        CapturePolicy::new(pattern_config).unwrap(),
    );
    assert_eq!(
        pattern_capture
            .capture("password = secret".into(), ContentType::PlainText)
            .await
            .unwrap(),
        CaptureOutcome::Ignored(CaptureIgnoreReason::Pattern)
    );
    assert_eq!(
        pattern_capture
            .capture("{\"ok\":true}".into(), ContentType::Json)
            .await
            .unwrap(),
        CaptureOutcome::Ignored(CaptureIgnoreReason::ContentType)
    );
    assert_eq!(
        query_scalar::<_, i64>("SELECT COUNT(*) FROM items")
            .fetch_one(database.pool())
            .await
            .unwrap(),
        0
    );

    drop(pattern_capture);
    cleanup(database, path).await;
}

#[tokio::test]
async fn consecutive_duplicates_normalize_only_line_endings() {
    let path = database_path("duplicate");
    let database = Database::open(&path).await.unwrap();
    let capture = ClipboardCapture::new(
        Repository::new(database.pool().clone()),
        FakeForegroundApp(None),
        CapturePolicy::new(settings()).unwrap(),
    );

    capture
        .capture("line 1\r\n  line 2".into(), ContentType::PlainText)
        .await
        .unwrap();
    assert_eq!(
        capture
            .capture("line 1\n  line 2".into(), ContentType::PlainText)
            .await
            .unwrap(),
        CaptureOutcome::Ignored(CaptureIgnoreReason::Duplicate)
    );
    assert_eq!(
        query_scalar::<_, String>("SELECT CAST(content AS TEXT) FROM items")
            .fetch_one(database.pool())
            .await
            .unwrap(),
        "line 1\r\n  line 2"
    );

    cleanup(database, path).await;
}

#[tokio::test]
async fn capture_prunes_items_over_count_and_age_limits() {
    let path = database_path("retention");
    let database = Database::open(&path).await.unwrap();
    let mut config = settings();
    config.max_items = 2;
    config.history_days = 7;
    let capture = ClipboardCapture::new(
        Repository::new(database.pool().clone()),
        FakeForegroundApp(None),
        CapturePolicy::new(config).unwrap(),
    );

    for text in ["first", "second", "third"] {
        capture
            .capture(text.into(), ContentType::PlainText)
            .await
            .unwrap();
    }
    assert_eq!(
        query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM items WHERE kind = 'clipboard' AND deleted_at IS NULL",
        )
        .fetch_one(database.pool())
        .await
        .unwrap(),
        2
    );

    query("UPDATE items SET created_at = '2000-01-01T00:00:00Z' WHERE content = X'7365636F6E64'")
        .execute(database.pool())
        .await
        .unwrap();
    capture
        .capture("fourth".into(), ContentType::PlainText)
        .await
        .unwrap();
    let remaining: Vec<String> = query_scalar(
        "SELECT CAST(content AS TEXT) FROM items WHERE kind = 'clipboard' ORDER BY rowid",
    )
    .fetch_all(database.pool())
    .await
    .unwrap();
    assert_eq!(remaining, vec!["third", "fourth"]);

    cleanup(database, path).await;
}
