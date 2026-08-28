use super::{Repository, RepositoryError, RepositoryResult};
use crate::models::{CloudProvider, Settings, SettingsPatch};

impl Repository {
    pub async fn get_settings(&self) -> RepositoryResult<Settings> {
        let row: Option<(String,)> = sqlx::query_as("SELECT data FROM app_settings WHERE id = 1")
            .fetch_optional(&self.pool)
            .await?;
        match row {
            Some((data,)) => serde_json::from_str(&data)
                .map_err(|_| RepositoryError::CorruptData("stored settings are invalid")),
            None => Ok(Settings::default()),
        }
    }

    pub async fn save_settings(&self, patch: SettingsPatch) -> RepositoryResult<Settings> {
        self.ensure_settings_table().await?;
        let current = self.get_settings().await?;
        let mut value = serde_json::to_value(&current)
            .map_err(|_| RepositoryError::CorruptData("stored settings are invalid"))?;
        if let Some(object) = value.as_object_mut() {
            for (key, patch_value) in patch.values {
                object.insert(key, patch_value);
            }
        }
        let updated: Settings = serde_json::from_value(value)
            .map_err(|_| RepositoryError::Validation("settings contain an invalid value"))?;
        validate_settings(&updated)?;

        let data = serde_json::to_string(&updated)
            .map_err(|_| RepositoryError::CorruptData("stored settings are invalid"))?;
        sqlx::query(
            "INSERT INTO app_settings (id, data) VALUES (1, ?) \
             ON CONFLICT(id) DO UPDATE SET data = excluded.data",
        )
        .bind(&data)
        .execute(&self.pool)
        .await?;

        Ok(updated)
    }

    async fn ensure_settings_table(&self) -> RepositoryResult<()> {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS app_settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)",
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

fn validate_settings(settings: &Settings) -> RepositoryResult<()> {
    if !(1..=365).contains(&settings.history_days) {
        return Err(RepositoryError::Validation("history_days must be 1 to 365"));
    }
    if !(10..=10_000).contains(&settings.max_items) {
        return Err(RepositoryError::Validation("max_items must be 10 to 10,000"));
    }
    if !(1..=8).contains(&settings.formatter_indent) {
        return Err(RepositoryError::Validation("formatter_indent must be 1 to 8"));
    }
    if !matches!(settings.theme.as_str(), "system" | "light" | "dark") {
        return Err(RepositoryError::Validation("theme must be system, light, or dark"));
    }
    // The repository clamps a search to 200 rows, so a larger page would
    // silently return fewer items than the pager says it is showing.
    if !(10..=200).contains(&settings.clipboard_page_size) {
        return Err(RepositoryError::Validation(
            "clipboard_page_size must be 10 to 200",
        ));
    }
    for pattern in &settings.ignored_patterns {
        if regex::Regex::new(pattern).is_err() {
            return Err(RepositoryError::Validation(
                "ignored_patterns must all be valid regular expressions",
            ));
        }
    }
    validate_backup(settings)?;
    Ok(())
}

fn validate_backup(settings: &Settings) -> RepositoryResult<()> {
    let backup = &settings.backup;
    if !(1..=100).contains(&backup.keep) {
        return Err(RepositoryError::Validation(
            "backup keep must be 1 to 100",
        ));
    }
    let cloud = &backup.cloud;
    if cloud.provider == CloudProvider::None {
        // Half-filled credentials are normal while the form is being typed
        // into; only an armed provider has to be complete.
        return Ok(());
    }
    if !backup.local && cloud.provider == CloudProvider::None {
        return Err(RepositoryError::Validation(
            "a backup needs at least one destination",
        ));
    }
    if cloud.bucket.trim().is_empty() {
        return Err(RepositoryError::Validation("backup bucket is required"));
    }
    if cloud.access_key_id.trim().is_empty() || cloud.secret_access_key.is_empty() {
        return Err(RepositoryError::Validation(
            "backup access key and secret are required",
        ));
    }
    // Uploads are sealed before they leave the machine, so there is no way to
    // arm one without a passphrase to seal it with.
    if cloud.passphrase.is_empty() {
        return Err(RepositoryError::Validation(
            "a backup password is required before backups can be uploaded",
        ));
    }
    if cloud.provider == CloudProvider::R2 && cloud.endpoint.trim().is_empty() {
        return Err(RepositoryError::Validation(
            "R2 needs the account endpoint, https://<account>.r2.cloudflarestorage.com",
        ));
    }
    if cloud.provider == CloudProvider::S3
        && cloud.endpoint.trim().is_empty()
        && cloud.region.trim().is_empty()
    {
        return Err(RepositoryError::Validation(
            "S3 needs a region when no endpoint is given",
        ));
    }
    if !cloud.endpoint.trim().is_empty() && !cloud.endpoint.starts_with("https://") {
        return Err(RepositoryError::Validation(
            "backup endpoint must start with https://",
        ));
    }
    Ok(())
}
