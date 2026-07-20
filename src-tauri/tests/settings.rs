mod support;

use snipdock_lib::{
    clipboard::{CapturePolicy, CaptureSettings, ClipboardMonitor, TextClipboard},
    commands::actions,
    db::Database,
    models::SettingsPatch,
    os::WindowPreferences,
    repository::Repository,
};
use std::{collections::BTreeMap, sync::Arc, time::Duration};

struct EmptyClipboard;

impl TextClipboard for EmptyClipboard {
    fn read_text(&self) -> Option<String> {
        None
    }
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
    let patch = SettingsPatch {
        values: BTreeMap::from([
            ("minimize_to_tray".into(), false.into()),
            ("clipboard_tracking".into(), false.into()),
            ("max_items".into(), 42.into()),
            ("ignored_patterns".into(), vec!["blocked"].into()),
        ]),
    };

    let saved = actions::save_settings(&repository, &preferences, &monitor, &policy, patch)
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
    assert!(actions::save_settings(&repository, &preferences, &monitor, &policy, invalid)
        .await
        .is_err());
    assert_eq!(policy.settings().max_items, 42);
    assert!(monitor.is_paused());
    support::remove_database(database, path).await;
}
