mod support;

use snipdock_lib::{
    commands::actions,
    db::Database,
    error::ErrorCode,
    models::{EnvVarEntry, ImportEnvVarsInput, SaveEnvGroupInput, SaveEnvVarInput},
    repository::Repository,
};
use sqlx::query_scalar;
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
use support::remove_database;

static NEXT_DATABASE: AtomicU64 = AtomicU64::new(0);

fn database_path(test_name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "snipdock-env-{test_name}-{}-{}.sqlite",
        std::process::id(),
        NEXT_DATABASE.fetch_add(1, Ordering::Relaxed)
    ))
}

fn group(name: &str) -> SaveEnvGroupInput {
    SaveEnvGroupInput {
        id: None,
        name: name.into(),
        description: None,
    }
}

fn variable(group_id: &str, key: &str, value: &str, secret: bool) -> SaveEnvVarInput {
    SaveEnvVarInput {
        id: None,
        group_id: group_id.into(),
        key: key.into(),
        value: value.into(),
        secret,
        note: None,
    }
}

fn entry(key: &str, value: &str, secret: bool) -> EnvVarEntry {
    EnvVarEntry {
        key: key.into(),
        value: value.into(),
        secret,
    }
}

#[tokio::test]
async fn sets_hold_variables_of_any_shape_in_the_order_they_were_added() {
    let path = database_path("lifecycle");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let production = actions::save_env_group(&repository, group("  acme · production  "))
        .await
        .unwrap();
    assert_eq!(production.name, "acme · production");
    assert_eq!(production.var_count, 0);

    let json = "{\n  \"retries\": 3,\n  \"hosts\": [\"a\", \"b\"]\n}";
    let pem = "-----BEGIN KEY-----\nabc\n-----END KEY-----\n";
    for (key, value, secret) in [
        ("PORT", "8080", false),
        ("FEATURE_FLAGS", json, false),
        ("TLS_KEY", pem, true),
        ("EMPTY", "", false),
    ] {
        actions::save_env_var(&repository, variable(&production.id, key, value, secret))
            .await
            .unwrap();
    }

    let listed = actions::list_env_vars(&repository, &production.id).await.unwrap();
    let keys: Vec<&str> = listed.iter().map(|var| var.key.as_str()).collect();
    assert_eq!(keys, ["PORT", "FEATURE_FLAGS", "TLS_KEY", "EMPTY"]);
    // Stored exactly: no trimming of the trailing newline, no reformatting.
    assert_eq!(listed[1].value, json);
    assert_eq!(listed[2].value, pem);
    assert!(listed[2].secret);

    let groups = actions::list_env_groups(&repository).await.unwrap();
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].var_count, 4);
    assert_eq!(groups[0].secret_count, 1);

    remove_database(database, path).await;
}

#[tokio::test]
async fn keys_are_unique_within_a_set_but_not_across_sets() {
    let path = database_path("unique");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let staging = actions::save_env_group(&repository, group("staging")).await.unwrap();
    let production = actions::save_env_group(&repository, group("production")).await.unwrap();
    actions::save_env_var(&repository, variable(&staging.id, "DATABASE_URL", "postgres://s", false))
        .await
        .unwrap();
    actions::save_env_var(&repository, variable(&production.id, "DATABASE_URL", "postgres://p", true))
        .await
        .unwrap();

    let duplicate = actions::save_env_var(&repository, variable(&staging.id, "DATABASE_URL", "x", false))
        .await
        .unwrap_err();
    assert_eq!(duplicate.code, ErrorCode::Validation);

    let same_name = actions::save_env_group(&repository, group("STAGING")).await.unwrap_err();
    assert_eq!(same_name.code, ErrorCode::Validation);

    remove_database(database, path).await;
}

#[tokio::test]
async fn editing_a_variable_keeps_its_identity_and_refuses_bad_input() {
    let path = database_path("edit");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let set = actions::save_env_group(&repository, group("local")).await.unwrap();
    let created = actions::save_env_var(&repository, variable(&set.id, "API_URL", "http://a", false))
        .await
        .unwrap();

    let mut edit = variable(&set.id, "API_BASE_URL", "http://b", true);
    edit.id = Some(created.id.clone());
    edit.note = Some("  moved behind the gateway  ".into());
    let updated = actions::save_env_var(&repository, edit).await.unwrap();
    assert_eq!(updated.id, created.id);
    assert_eq!(updated.key, "API_BASE_URL");
    assert_eq!(updated.value, "http://b");
    assert!(updated.secret);
    assert_eq!(updated.note.as_deref(), Some("moved behind the gateway"));
    assert_eq!(updated.created_at, created.created_at);

    for key in ["", "HAS SPACE", "A=B", "#COMMENT"] {
        let error = actions::save_env_var(&repository, variable(&set.id, key, "v", false))
            .await
            .unwrap_err();
        assert_eq!(error.code, ErrorCode::Validation, "{key:?} was accepted");
    }

    let missing = actions::save_env_var(&repository, variable("no-such-set", "KEY", "v", false))
        .await
        .unwrap_err();
    assert_eq!(missing.code, ErrorCode::NotFound);

    actions::delete_env_var(&repository, &created.id).await.unwrap();
    assert!(actions::list_env_vars(&repository, &set.id).await.unwrap().is_empty());
    let gone = actions::delete_env_var(&repository, &created.id).await.unwrap_err();
    assert_eq!(gone.code, ErrorCode::NotFound);

    remove_database(database, path).await;
}

#[tokio::test]
async fn restoring_a_deleted_variable_puts_it_back_where_it_was() {
    let path = database_path("restore");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let set = actions::save_env_group(&repository, group("api")).await.unwrap();
    for key in ["FIRST", "SECOND", "THIRD"] {
        actions::save_env_var(&repository, variable(&set.id, key, "v", false))
            .await
            .unwrap();
    }
    let second = actions::list_env_vars(&repository, &set.id).await.unwrap()[1].clone();
    actions::delete_env_var(&repository, &second.id).await.unwrap();
    actions::save_env_var(&repository, variable(&set.id, "FOURTH", "v", false))
        .await
        .unwrap();

    let restored = actions::restore_env_var(&repository, second.clone()).await.unwrap();
    assert_eq!(restored.id, second.id);
    assert_eq!(restored.created_at, second.created_at);
    let keys: Vec<String> = actions::list_env_vars(&repository, &set.id)
        .await
        .unwrap()
        .into_iter()
        .map(|var| var.key)
        .collect();
    assert_eq!(keys, ["FIRST", "SECOND", "THIRD", "FOURTH"]);

    // The key was taken back in the meantime: the restore is refused, not doubled.
    let taken = actions::restore_env_var(&repository, second).await.unwrap_err();
    assert_eq!(taken.code, ErrorCode::Validation);

    remove_database(database, path).await;
}

#[tokio::test]
async fn restoring_the_last_variable_keeps_it_ahead_of_one_added_since() {
    let path = database_path("restore-last");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let set = actions::save_env_group(&repository, group("api")).await.unwrap();
    for key in ["ALPHA", "ZULU"] {
        actions::save_env_var(&repository, variable(&set.id, key, "v", false))
            .await
            .unwrap();
    }
    // Deleting the last row frees its position, and the next variable takes
    // that same number. Without making room, the tie sorted by key and put
    // "MIKE" ahead of the restored "ZULU".
    let last = actions::list_env_vars(&repository, &set.id).await.unwrap()[1].clone();
    actions::delete_env_var(&repository, &last.id).await.unwrap();
    actions::save_env_var(&repository, variable(&set.id, "MIKE", "v", false))
        .await
        .unwrap();
    actions::restore_env_var(&repository, last).await.unwrap();

    let keys: Vec<String> = actions::list_env_vars(&repository, &set.id)
        .await
        .unwrap()
        .into_iter()
        .map(|var| var.key)
        .collect();
    assert_eq!(keys, ["ALPHA", "ZULU", "MIKE"]);

    remove_database(database, path).await;
}

#[tokio::test]
async fn import_adds_new_keys_and_overwrites_only_when_asked() {
    let path = database_path("import");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let set = actions::save_env_group(&repository, group("api")).await.unwrap();
    actions::save_env_var(&repository, variable(&set.id, "TOKEN", "old", true))
        .await
        .unwrap();

    let entries = vec![
        entry("PORT", "3000", false),
        // The parser guessed "not secret"; the user's own choice must stand.
        entry("TOKEN", "new", false),
        entry("NODE_ENV", "production", false),
    ];
    let kept = actions::import_env_vars(
        &repository,
        ImportEnvVarsInput {
            group_id: set.id.clone(),
            entries: entries.clone(),
            overwrite: false,
        },
    )
    .await
    .unwrap();
    assert_eq!((kept.added, kept.updated, kept.skipped), (2, 0, 1));
    let token = |vars: &[snipdock_lib::models::EnvVar]| {
        vars.iter().find(|var| var.key == "TOKEN").cloned().unwrap()
    };
    let listed = actions::list_env_vars(&repository, &set.id).await.unwrap();
    assert_eq!(token(&listed).value, "old");

    let replaced = actions::import_env_vars(
        &repository,
        ImportEnvVarsInput {
            group_id: set.id.clone(),
            entries,
            overwrite: true,
        },
    )
    .await
    .unwrap();
    assert_eq!((replaced.added, replaced.updated, replaced.skipped), (0, 3, 0));
    let listed = actions::list_env_vars(&repository, &set.id).await.unwrap();
    assert_eq!(token(&listed).value, "new");
    assert!(token(&listed).secret, "an import unmasked a secret");
    let keys: Vec<&str> = listed.iter().map(|var| var.key.as_str()).collect();
    assert_eq!(keys, ["TOKEN", "PORT", "NODE_ENV"]);

    remove_database(database, path).await;
}

#[tokio::test]
async fn an_import_with_one_bad_entry_writes_nothing() {
    let path = database_path("atomic");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let set = actions::save_env_group(&repository, group("api")).await.unwrap();
    let error = actions::import_env_vars(
        &repository,
        ImportEnvVarsInput {
            group_id: set.id.clone(),
            entries: vec![entry("GOOD", "1", false), entry("BAD KEY", "2", false)],
            overwrite: false,
        },
    )
    .await
    .unwrap_err();
    assert_eq!(error.code, ErrorCode::Validation);
    assert!(actions::list_env_vars(&repository, &set.id).await.unwrap().is_empty());

    remove_database(database, path).await;
}

#[tokio::test]
async fn duplicating_a_set_copies_its_variables_and_deleting_cascades() {
    let path = database_path("duplicate");
    let database = Database::open(&path).await.unwrap();
    let repository = Repository::new(database.pool().clone());

    let production = actions::save_env_group(&repository, group("production")).await.unwrap();
    actions::save_env_var(&repository, variable(&production.id, "HOST", "prod.example", false))
        .await
        .unwrap();
    actions::save_env_var(&repository, variable(&production.id, "SECRET", "s3cr3t", true))
        .await
        .unwrap();

    let staging = actions::duplicate_env_group(&repository, &production.id, "staging")
        .await
        .unwrap();
    assert_ne!(staging.id, production.id);
    assert_eq!(staging.var_count, 2);
    assert_eq!(staging.secret_count, 1);

    let taken = actions::duplicate_env_group(&repository, &production.id, "Production")
        .await
        .unwrap_err();
    assert_eq!(taken.code, ErrorCode::Validation);

    actions::delete_env_group(&repository, &production.id).await.unwrap();
    let orphans: i64 = query_scalar("SELECT COUNT(*) FROM env_vars WHERE group_id = ?")
        .bind(&production.id)
        .fetch_one(database.pool())
        .await
        .unwrap();
    assert_eq!(orphans, 0);
    // The copy is independent of the set it came from.
    assert_eq!(actions::list_env_vars(&repository, &staging.id).await.unwrap().len(), 2);
    let missing = actions::list_env_vars(&repository, &production.id).await.unwrap_err();
    assert_eq!(missing.code, ErrorCode::NotFound);

    remove_database(database, path).await;
}
