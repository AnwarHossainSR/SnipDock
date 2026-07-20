mod support;

use snipdock_lib::{
    commands::actions,
    db::Database,
    models::SettingsPatch,
    os::WindowPreferences,
    repository::Repository,
};
use std::collections::BTreeMap;

#[tokio::test]
async fn saving_minimize_to_tray_updates_runtime_preference() {
    let path = std::env::temp_dir().join(format!(
        "snipdock-settings-{}.sqlite",
        uuid::Uuid::new_v4()
    ));
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());
    let preferences = WindowPreferences::new(true, true);
    let patch = SettingsPatch {
        values: BTreeMap::from([("minimize_to_tray".into(), false.into())]),
    };

    let saved = actions::save_settings(&repository, &preferences, patch)
        .await
        .unwrap();

    assert!(!saved.minimize_to_tray);
    assert!(!preferences.minimize_to_tray());
    support::remove_database(database, path).await;
}
