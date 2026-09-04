mod support;

use snipdock_lib::{
    clipboard::{CapturePolicy, CaptureSettings, ClipboardMonitor, ClipboardSource},
    commands::actions,
    db::Database,
    models::SettingsPatch,
    os::WindowPreferences,
    repository::Repository,
};
use std::{collections::BTreeMap, sync::Arc, time::Duration};

struct EmptyClipboard;

impl ClipboardSource for EmptyClipboard {
    fn read_text(&self) -> Option<String> {
        None
    }
}

#[tokio::test]
async fn stored_settings_fill_fields_added_after_installation() {
    let path = std::env::temp_dir().join(format!(
        "snipdock-settings-defaults-{}.sqlite",
        uuid::Uuid::new_v4()
    ));
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS app_settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)",
    )
    .execute(database.pool())
    .await
    .unwrap();
    sqlx::query("INSERT INTO app_settings (id, data) VALUES (1, '{\"clipboard_tracking\":false}')")
        .execute(database.pool())
        .await
        .unwrap();

    let settings = repository.get_settings().await.unwrap();

    assert!(!settings.clipboard_tracking);
    assert_eq!(settings.history_days, 30);
    assert_eq!(settings.max_items, 500);
    // Accent shipped after the first release, so every existing install has a
    // row without it. It has to read back as the default rather than failing
    // the whole deserialisation and losing every other stored preference.
    assert_eq!(settings.accent, "teal");
    assert_eq!(settings.theme, "system");
    support::remove_database(database, path).await;
}

#[tokio::test]
async fn saving_minimize_to_tray_updates_runtime_preference() {
    let path = std::env::temp_dir().join(format!(
        "snipdock-settings-{}.sqlite",
        uuid::Uuid::new_v4()
    ));
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let preferences = WindowPreferences::new(true, true);
    let monitor = ClipboardMonitor::start(
        Arc::new(EmptyClipboard),
        Duration::from_secs(60),
        |_| {},
    );
    let policy = CapturePolicy::new(CaptureSettings::default()).unwrap();
    // The startup sweep is what gates the monitor at launch; these tests act
    // as if it has already finished, which is the state every save after
    // startup runs in.
    let startup_sweep_gate = Arc::new(std::sync::atomic::AtomicBool::new(true));
    let patch = SettingsPatch {
        values: BTreeMap::from([
            ("minimize_to_tray".into(), false.into()),
            ("clipboard_tracking".into(), false.into()),
            ("max_items".into(), 42.into()),
            ("ignored_patterns".into(), vec!["blocked"].into()),
        ]),
    };

    let saved = actions::save_settings(&repository, &preferences, &monitor, &policy, &startup_sweep_gate, patch)
        .await
        .unwrap();

    assert!(!saved.minimize_to_tray);
    assert!(!preferences.minimize_to_tray());
    assert!(monitor.is_paused());
    assert_eq!(policy.settings().max_items, 42);
    assert_eq!(policy.settings().ignored_patterns, vec!["blocked"]);

    let invalid = SettingsPatch {
        values: BTreeMap::from([("max_items".into(), 1.into())]),
    };
    assert!(actions::save_settings(&repository, &preferences, &monitor, &policy, &startup_sweep_gate, invalid)
        .await
        .is_err());
    assert_eq!(policy.settings().max_items, 42);
    assert!(monitor.is_paused());
    support::remove_database(database, path).await;
}

#[tokio::test]
async fn password_managers_are_ignored_by_default_but_a_cleared_list_stays_cleared() {
    let path = std::env::temp_dir().join(format!(
        "snipdock-settings-ignored-{}.sqlite",
        uuid::Uuid::new_v4()
    ));
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS app_settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)",
    )
    .execute(database.pool())
    .await
    .unwrap();

    // A fresh install records nothing a password manager copies, without the
    // user having to know the executable name to type in.
    let seeded = repository.get_settings().await.unwrap();
    assert!(
        seeded
            .ignored_apps
            .iter()
            .any(|app| app.to_lowercase().contains("keepass")),
        "expected the shipped ignore list to cover a password manager, got {:?}",
        seeded.ignored_apps
    );

    // And emptying it is a decision the app keeps, rather than one the next
    // launch's defaults quietly undo.
    repository
        .save_settings(SettingsPatch {
            values: BTreeMap::from([(
                "ignored_apps".to_string(),
                serde_json::json!(Vec::<String>::new()),
            )]),
        })
        .await
        .unwrap();

    assert!(repository.get_settings().await.unwrap().ignored_apps.is_empty());
    support::remove_database(database, path).await;
}
