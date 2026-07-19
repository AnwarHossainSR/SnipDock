use super::{Repository, RepositoryError, RepositoryResult};
use crate::models::{Settings, SettingsPatch};

impl Repository {
    pub async fn get_settings(&self) -> RepositoryResult<Settings> {
        self.ensure_settings_table().await?;
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
    if let Some(days) = settings.auto_delete_days {
        if !(1..=365).contains(&days) {
            return Err(RepositoryError::Validation("auto_delete_days must be 1 to 365"));
        }
    }
    if !(1..=8).contains(&settings.formatter_indent) {
        return Err(RepositoryError::Validation("formatter_indent must be 1 to 8"));
    }
    if !(1..=168).contains(&settings.backup_interval_hours) {
        return Err(RepositoryError::Validation("backup_interval_hours must be 1 to 168"));
    }
    if !(1..=100).contains(&settings.backup_retention) {
        return Err(RepositoryError::Validation("backup_retention must be 1 to 100"));
    }
    if let Some(seconds) = settings.auto_clear_secret_seconds {
        if !(5..=3_600).contains(&seconds) {
            return Err(RepositoryError::Validation(
                "auto_clear_secret_seconds must be 5 to 3,600",
            ));
        }
    }
    if let Some(minutes) = settings.lock_after_minutes {
        if !(1..=480).contains(&minutes) {
            return Err(RepositoryError::Validation("lock_after_minutes must be 1 to 480"));
        }
    }
    if !matches!(settings.theme.as_str(), "system" | "light" | "dark") {
        return Err(RepositoryError::Validation("theme must be system, light, or dark"));
    }
    for pattern in &settings.ignored_patterns {
        if regex::Regex::new(pattern).is_err() {
            return Err(RepositoryError::Validation(
                "ignored_patterns must all be valid regular expressions",
            ));
        }
    }
    if !is_shortcut(&settings.open_shortcut) || !is_shortcut(&settings.new_snippet_shortcut) {
        return Err(RepositoryError::Validation(
            "shortcuts must be modifier+key accelerators",
        ));
    }
    if settings.open_shortcut.eq_ignore_ascii_case(&settings.new_snippet_shortcut) {
        return Err(RepositoryError::Validation("shortcuts must not conflict"));
    }
    Ok(())
}

fn is_shortcut(value: &str) -> bool {
    let parts: Vec<&str> = value.split('+').collect();
    if parts.len() < 2 || parts.iter().any(|part| part.is_empty()) {
        return false;
    }
    let modifiers = &parts[..parts.len() - 1];
    modifiers.iter().all(|part| {
        matches!(
            part.to_ascii_lowercase().as_str(),
            "cmdorctrl" | "ctrl" | "cmd" | "alt" | "shift" | "super" | "meta"
        )
    })
}
