//! Environment variable sets and the variables in them.
//!
//! Parsing `.env` and JSON text happens in the frontend, where the preview is
//! shown; this layer only validates what it is handed and writes it, so a bulk
//! import is one transaction that either lands whole or not at all.

use super::{map_unique, Repository, RepositoryError, RepositoryResult};
use crate::models::{
    EnvGroup, EnvVar, EnvVarEntry, ImportEnvReport, ImportEnvVarsInput, SaveEnvGroupInput,
    SaveEnvVarInput,
};
use sqlx::FromRow;
use uuid::Uuid;

const MAX_GROUP_NAME_CHARS: usize = 80;
const MAX_DESCRIPTION_CHARS: usize = 500;
const MAX_KEY_CHARS: usize = 256;
/// The same ceiling a saved item has (`validate_item_input`).
const MAX_VALUE_BYTES: usize = 1_000_000;
const MAX_NOTE_CHARS: usize = 500;
/// Far beyond any real `.env` file, and low enough that a pasted log cannot
/// turn into one transaction of a million inserts.
const MAX_IMPORT_ENTRIES: usize = 5_000;

const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

const GROUP_COLUMNS: &str = "id, project_id, name, description, position, \
    (SELECT COUNT(*) FROM env_vars WHERE group_id = env_groups.id) AS var_count, \
    (SELECT COUNT(*) FROM env_vars WHERE group_id = env_groups.id AND secret = 1) AS secret_count, \
    created_at, updated_at";

const VAR_COLUMNS: &str =
    "id, group_id, key, value, secret, note, position, created_at, updated_at";

const DUPLICATE_GROUP: &str = "this project already has a set with that name";
const DUPLICATE_KEY: &str = "this set already has a variable with that key";

fn validate_group_name(name: &str) -> RepositoryResult<&str> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > MAX_GROUP_NAME_CHARS {
        return Err(RepositoryError::Validation(
            "name must contain 1 to 80 characters",
        ));
    }
    Ok(name)
}

fn validate_description(description: Option<&str>) -> RepositoryResult<Option<&str>> {
    let description = description.map(str::trim).filter(|value| !value.is_empty());
    if description.is_some_and(|value| value.chars().count() > MAX_DESCRIPTION_CHARS) {
        return Err(RepositoryError::Validation(
            "description must not exceed 500 characters",
        ));
    }
    Ok(description)
}

/// Lenient on purpose: Spring's `server.port`, Windows' `ProgramFiles(x86)`
/// and Kubernetes' dashed names are all real variables. What no platform
/// accepts - `=`, whitespace, control characters - is refused.
pub fn validate_env_key(key: &str) -> RepositoryResult<&str> {
    let key = key.trim();
    if key.is_empty() || key.chars().count() > MAX_KEY_CHARS {
        return Err(RepositoryError::Validation(
            "key must contain 1 to 256 characters",
        ));
    }
    if key
        .chars()
        .any(|character| character == '=' || character.is_whitespace() || character.is_control())
    {
        return Err(RepositoryError::Validation(
            "key cannot contain spaces, '=' or control characters",
        ));
    }
    // A `.env` line that starts with `#` is a comment: such a key could be
    // stored but never exported and read back.
    if key.starts_with('#') {
        return Err(RepositoryError::Validation("key cannot start with '#'"));
    }
    Ok(key)
}

/// A value is stored exactly as given - leading spaces and trailing newlines
/// can be the point of it - so it is checked, never trimmed.
fn validate_value(value: &str) -> RepositoryResult<()> {
    if value.len() > MAX_VALUE_BYTES {
        return Err(RepositoryError::Validation("value must not exceed 1 MB"));
    }
    // No process environment can hold one, so no export could carry it.
    if value.contains('\0') {
        return Err(RepositoryError::Validation(
            "value cannot contain a NUL character",
        ));
    }
    Ok(())
}

fn validate_note(note: Option<&str>) -> RepositoryResult<Option<&str>> {
    let note = note.map(str::trim).filter(|value| !value.is_empty());
    if note.is_some_and(|value| value.chars().count() > MAX_NOTE_CHARS) {
        return Err(RepositoryError::Validation(
            "note must not exceed 500 characters",
        ));
    }
    Ok(note)
}

fn validate_entry(entry: &EnvVarEntry) -> RepositoryResult<&str> {
    let key = validate_env_key(&entry.key)?;
    validate_value(&entry.value)?;
    Ok(key)
}

impl Repository {
    pub async fn list_env_groups(&self) -> RepositoryResult<Vec<EnvGroup>> {
        let sql = format!(
            "SELECT {GROUP_COLUMNS} FROM env_groups ORDER BY position, name COLLATE NOCASE"
        );
        let rows = sqlx::query_as::<_, EnvGroupRow>(&sql)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn get_env_group(&self, id: &str) -> RepositoryResult<EnvGroup> {
        let sql = format!("SELECT {GROUP_COLUMNS} FROM env_groups WHERE id = ?");
        sqlx::query_as::<_, EnvGroupRow>(&sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?
            .map(Into::into)
            .ok_or(RepositoryError::NotFound)
    }

    pub async fn save_env_group(&self, input: SaveEnvGroupInput) -> RepositoryResult<EnvGroup> {
        let name = validate_group_name(&input.name)?;
        let description = validate_description(input.description.as_deref())?;
        self.require_project(input.project_id.as_deref()).await?;

        let id = match input.id {
            Some(id) => {
                let result = sqlx::query(&format!(
                    "UPDATE env_groups SET project_id = ?, name = ?, description = ?, updated_at = {NOW} \
                     WHERE id = ?"
                ))
                .bind(&input.project_id)
                .bind(name)
                .bind(description)
                .bind(&id)
                .execute(&self.pool)
                .await
                .map_err(|error| map_unique(error, DUPLICATE_GROUP))?;
                if result.rows_affected() == 0 {
                    return Err(RepositoryError::NotFound);
                }
                id
            }
            None => {
                let id = Uuid::new_v4().to_string();
                sqlx::query(&format!(
                    "INSERT INTO env_groups (id, project_id, name, description, position, created_at, updated_at) \
                     VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM env_groups), {NOW}, {NOW})"
                ))
                .bind(&id)
                .bind(&input.project_id)
                .bind(name)
                .bind(description)
                .execute(&self.pool)
                .await
                .map_err(|error| map_unique(error, DUPLICATE_GROUP))?;
                id
            }
        };

        self.get_env_group(&id).await
    }

    /// Deletes the set and, by cascade, every variable in it.
    pub async fn delete_env_group(&self, id: &str) -> RepositoryResult<()> {
        let result = sqlx::query("DELETE FROM env_groups WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            return Err(RepositoryError::NotFound);
        }
        Ok(())
    }

    /// Copies a set and all its variables under a new name, in the same
    /// project - the usual way a staging set is started from production.
    pub async fn duplicate_env_group(&self, id: &str, name: &str) -> RepositoryResult<EnvGroup> {
        let name = validate_group_name(name)?;
        let mut transaction = self.pool.begin().await?;

        let source: Option<(Option<String>, Option<String>)> =
            sqlx::query_as("SELECT project_id, description FROM env_groups WHERE id = ?")
                .bind(id)
                .fetch_optional(&mut *transaction)
                .await?;
        let Some((project_id, description)) = source else {
            return Err(RepositoryError::NotFound);
        };

        let copy_id = Uuid::new_v4().to_string();
        sqlx::query(&format!(
            "INSERT INTO env_groups (id, project_id, name, description, position, created_at, updated_at) \
             VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM env_groups), {NOW}, {NOW})"
        ))
        .bind(&copy_id)
        .bind(&project_id)
        .bind(name)
        .bind(description)
        .execute(&mut *transaction)
        .await
        .map_err(|error| map_unique(error, DUPLICATE_GROUP))?;

        let variables = sqlx::query_as::<_, EnvVarRow>(&format!(
            "SELECT {VAR_COLUMNS} FROM env_vars WHERE group_id = ? ORDER BY position, key"
        ))
        .bind(id)
        .fetch_all(&mut *transaction)
        .await?;
        for variable in variables {
            sqlx::query(&format!(
                "INSERT INTO env_vars (id, group_id, key, value, secret, note, position, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, {NOW}, {NOW})"
            ))
            .bind(Uuid::new_v4().to_string())
            .bind(&copy_id)
            .bind(&variable.key)
            .bind(&variable.value)
            .bind(variable.secret)
            .bind(&variable.note)
            .bind(variable.position)
            .execute(&mut *transaction)
            .await?;
        }

        transaction.commit().await?;
        self.get_env_group(&copy_id).await
    }

    /// A set can only be filed under a project that exists. Checked up front
    /// so the answer is "not found" rather than a foreign-key failure.
    async fn require_project(&self, project_id: Option<&str>) -> RepositoryResult<()> {
        let Some(project_id) = project_id else {
            return Ok(());
        };
        let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM projects WHERE id = ?")
            .bind(project_id)
            .fetch_optional(&self.pool)
            .await?;
        exists.map(|_| ()).ok_or(RepositoryError::NotFound)
    }

    pub async fn list_env_vars(&self, group_id: &str) -> RepositoryResult<Vec<EnvVar>> {
        // A set that has gone - deleted in another window, say - is reported
        // as missing rather than as empty, so the page can drop it.
        self.get_env_group(group_id).await?;
        let rows = sqlx::query_as::<_, EnvVarRow>(&format!(
            "SELECT {VAR_COLUMNS} FROM env_vars WHERE group_id = ? ORDER BY position, key"
        ))
        .bind(group_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn get_env_var(&self, id: &str) -> RepositoryResult<EnvVar> {
        sqlx::query_as::<_, EnvVarRow>(&format!("SELECT {VAR_COLUMNS} FROM env_vars WHERE id = ?"))
            .bind(id)
            .fetch_optional(&self.pool)
            .await?
            .map(Into::into)
            .ok_or(RepositoryError::NotFound)
    }

    pub async fn save_env_var(&self, input: SaveEnvVarInput) -> RepositoryResult<EnvVar> {
        let key = validate_env_key(&input.key)?;
        validate_value(&input.value)?;
        let note = validate_note(input.note.as_deref())?;
        let mut transaction = self.pool.begin().await?;

        let (id, group_id) = match input.id {
            Some(id) => {
                let group_id: Option<String> =
                    sqlx::query_scalar("SELECT group_id FROM env_vars WHERE id = ?")
                        .bind(&id)
                        .fetch_optional(&mut *transaction)
                        .await?;
                let group_id = group_id.ok_or(RepositoryError::NotFound)?;
                sqlx::query(&format!(
                    "UPDATE env_vars SET key = ?, value = ?, secret = ?, note = ?, updated_at = {NOW} \
                     WHERE id = ?"
                ))
                .bind(key)
                .bind(&input.value)
                .bind(input.secret)
                .bind(note)
                .bind(&id)
                .execute(&mut *transaction)
                .await
                .map_err(|error| map_unique(error, DUPLICATE_KEY))?;
                (id, group_id)
            }
            None => {
                let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM env_groups WHERE id = ?")
                    .bind(&input.group_id)
                    .fetch_optional(&mut *transaction)
                    .await?;
                if exists.is_none() {
                    return Err(RepositoryError::NotFound);
                }
                let id = Uuid::new_v4().to_string();
                sqlx::query(&format!(
                    "INSERT INTO env_vars (id, group_id, key, value, secret, note, position, created_at, updated_at) \
                     VALUES (?, ?, ?, ?, ?, ?, \
                        (SELECT COALESCE(MAX(position), -1) + 1 FROM env_vars WHERE group_id = ?), {NOW}, {NOW})"
                ))
                .bind(&id)
                .bind(&input.group_id)
                .bind(key)
                .bind(&input.value)
                .bind(input.secret)
                .bind(note)
                .bind(&input.group_id)
                .execute(&mut *transaction)
                .await
                .map_err(|error| map_unique(error, DUPLICATE_KEY))?;
                (id, input.group_id)
            }
        };

        touch_group(&mut transaction, &group_id).await?;
        transaction.commit().await?;
        self.get_env_var(&id).await
    }

    /// Puts a deleted variable back exactly as it was - same id, place in its
    /// set and creation time - which is what Undo promises. Saving it as new
    /// would move it to the end of the set and of every export.
    pub async fn restore_env_var(&self, variable: EnvVar) -> RepositoryResult<EnvVar> {
        let key = validate_env_key(&variable.key)?;
        validate_value(&variable.value)?;
        let note = validate_note(variable.note.as_deref())?;
        let mut transaction = self.pool.begin().await?;
        let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM env_groups WHERE id = ?")
            .bind(&variable.group_id)
            .fetch_optional(&mut *transaction)
            .await?;
        if exists.is_none() {
            return Err(RepositoryError::NotFound);
        }
        // A variable added since the delete can hold the freed position (the
        // next one after a deleted last row is that same number). Make room,
        // or the tie falls back to key order and Undo reorders the set.
        sqlx::query("UPDATE env_vars SET position = position + 1 WHERE group_id = ? AND position >= ?")
            .bind(&variable.group_id)
            .bind(variable.position)
            .execute(&mut *transaction)
            .await?;
        sqlx::query(&format!(
            "INSERT INTO env_vars (id, group_id, key, value, secret, note, position, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, {NOW})"
        ))
        .bind(&variable.id)
        .bind(&variable.group_id)
        .bind(key)
        .bind(&variable.value)
        .bind(variable.secret)
        .bind(note)
        .bind(variable.position)
        .bind(&variable.created_at)
        .execute(&mut *transaction)
        .await
        .map_err(|error| map_unique(error, DUPLICATE_KEY))?;
        touch_group(&mut transaction, &variable.group_id).await?;
        transaction.commit().await?;
        self.get_env_var(&variable.id).await
    }

    pub async fn delete_env_var(&self, id: &str) -> RepositoryResult<()> {
        let mut transaction = self.pool.begin().await?;
        let group_id: Option<String> =
            sqlx::query_scalar("DELETE FROM env_vars WHERE id = ? RETURNING group_id")
                .bind(id)
                .fetch_optional(&mut *transaction)
                .await?;
        let group_id = group_id.ok_or(RepositoryError::NotFound)?;
        touch_group(&mut transaction, &group_id).await?;
        transaction.commit().await?;
        Ok(())
    }

    /// Writes a parsed `.env` or JSON file into a set. Every entry is checked
    /// before anything is written, and the writes share one transaction, so a
    /// bad line leaves the set exactly as it was.
    ///
    /// A key the set already has is replaced only with `overwrite`. Replacing
    /// one can mark it secret but never unmarks it: the import's guess at what
    /// is secret must not unmask a value the user chose to hide.
    pub async fn import_env_vars(
        &self,
        input: ImportEnvVarsInput,
    ) -> RepositoryResult<ImportEnvReport> {
        if input.entries.len() > MAX_IMPORT_ENTRIES {
            return Err(RepositoryError::Validation(
                "an import can hold at most 5,000 variables",
            ));
        }
        let mut keys = Vec::with_capacity(input.entries.len());
        for entry in &input.entries {
            keys.push(validate_entry(entry)?);
        }

        let mut transaction = self.pool.begin().await?;
        let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM env_groups WHERE id = ?")
            .bind(&input.group_id)
            .fetch_optional(&mut *transaction)
            .await?;
        if exists.is_none() {
            return Err(RepositoryError::NotFound);
        }
        let mut position: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM env_vars WHERE group_id = ?",
        )
        .bind(&input.group_id)
        .fetch_one(&mut *transaction)
        .await?;

        let mut report = ImportEnvReport::default();
        for (entry, key) in input.entries.iter().zip(keys) {
            let existing: Option<String> =
                sqlx::query_scalar("SELECT id FROM env_vars WHERE group_id = ? AND key = ?")
                    .bind(&input.group_id)
                    .bind(key)
                    .fetch_optional(&mut *transaction)
                    .await?;
            match existing {
                Some(id) if input.overwrite => {
                    sqlx::query(&format!(
                        "UPDATE env_vars SET value = ?, secret = MAX(secret, ?), updated_at = {NOW} \
                         WHERE id = ?"
                    ))
                    .bind(&entry.value)
                    .bind(entry.secret)
                    .bind(&id)
                    .execute(&mut *transaction)
                    .await?;
                    report.updated += 1;
                }
                Some(_) => report.skipped += 1,
                None => {
                    sqlx::query(&format!(
                        "INSERT INTO env_vars (id, group_id, key, value, secret, note, position, created_at, updated_at) \
                         VALUES (?, ?, ?, ?, ?, NULL, ?, {NOW}, {NOW})"
                    ))
                    .bind(Uuid::new_v4().to_string())
                    .bind(&input.group_id)
                    .bind(key)
                    .bind(&entry.value)
                    .bind(entry.secret)
                    .bind(position)
                    .execute(&mut *transaction)
                    .await?;
                    position += 1;
                    report.added += 1;
                }
            }
        }

        if report.added + report.updated > 0 {
            touch_group(&mut transaction, &input.group_id).await?;
        }
        transaction.commit().await?;
        Ok(report)
    }
}

/// A set's `updated_at` follows its variables, so "edited 2 minutes ago" on
/// the set is true when only a value changed.
async fn touch_group(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    group_id: &str,
) -> RepositoryResult<()> {
    sqlx::query(&format!("UPDATE env_groups SET updated_at = {NOW} WHERE id = ?"))
        .bind(group_id)
        .execute(&mut **transaction)
        .await?;
    Ok(())
}

#[derive(FromRow)]
struct EnvGroupRow {
    id: String,
    project_id: Option<String>,
    name: String,
    description: Option<String>,
    position: i64,
    var_count: i64,
    secret_count: i64,
    created_at: String,
    updated_at: String,
}

impl From<EnvGroupRow> for EnvGroup {
    fn from(row: EnvGroupRow) -> Self {
        Self {
            id: row.id,
            project_id: row.project_id,
            name: row.name,
            description: row.description,
            position: row.position,
            var_count: row.var_count,
            secret_count: row.secret_count,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(FromRow)]
struct EnvVarRow {
    id: String,
    group_id: String,
    key: String,
    value: String,
    secret: bool,
    note: Option<String>,
    position: i64,
    created_at: String,
    updated_at: String,
}

impl From<EnvVarRow> for EnvVar {
    fn from(row: EnvVarRow) -> Self {
        Self {
            id: row.id,
            group_id: row.group_id,
            key: row.key,
            value: row.value,
            secret: row.secret,
            note: row.note,
            position: row.position,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_allow_real_world_shapes() {
        for key in ["DATABASE_URL", "server.port", "ProgramFiles(x86)", "my-key", "  PADDED  "] {
            assert!(validate_env_key(key).is_ok(), "{key} was refused");
        }
        assert_eq!(validate_env_key("  PADDED  ").unwrap(), "PADDED");
    }

    #[test]
    fn keys_refuse_what_no_platform_accepts() {
        for key in ["", "   ", "A=B", "TWO WORDS", "TAB\tKEY", "NEW\nLINE", "#COMMENT", "C1\u{85}KEY"] {
            assert!(validate_env_key(key).is_err(), "{key:?} was accepted");
        }
        assert!(validate_env_key(&"K".repeat(257)).is_err());
        assert!(validate_env_key(&"K".repeat(256)).is_ok());
    }

    #[test]
    fn values_are_checked_not_trimmed() {
        assert!(validate_value("").is_ok());
        assert!(validate_value("  spaced \n").is_ok());
        assert!(validate_value("{\"nested\": [1, 2]}").is_ok());
        assert!(validate_value("nul\0byte").is_err());
        assert!(validate_value(&"x".repeat(MAX_VALUE_BYTES + 1)).is_err());
    }
}
