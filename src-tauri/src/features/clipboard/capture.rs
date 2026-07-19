use crate::{
    models::{ContentType, LibraryItem},
    os::ForegroundApp,
    repository::{Repository, RepositoryResult},
};
use regex::Regex;
use std::borrow::Cow;

#[derive(Clone, Debug)]
pub struct CaptureSettings {
    pub history_days: u32,
    pub max_items: u32,
    pub ignored_apps: Vec<String>,
    pub ignored_patterns: Vec<String>,
    pub ignored_content_types: Vec<ContentType>,
}

impl Default for CaptureSettings {
    fn default() -> Self {
        Self {
            history_days: 30,
            max_items: 1_000,
            ignored_apps: Vec::new(),
            ignored_patterns: Vec::new(),
            ignored_content_types: Vec::new(),
        }
    }
}

pub struct CapturePolicy {
    settings: CaptureSettings,
    ignored_patterns: Vec<Regex>,
}

impl CapturePolicy {
    pub fn new(mut settings: CaptureSettings) -> Result<Self, regex::Error> {
        settings.history_days = settings.history_days.max(1);
        settings.max_items = settings.max_items.max(1);
        let ignored_patterns = settings
            .ignored_patterns
            .iter()
            .map(|pattern| Regex::new(pattern))
            .collect::<Result<_, _>>()?;
        Ok(Self {
            settings,
            ignored_patterns,
        })
    }

    fn ignore_reason(
        &self,
        text: &str,
        source_app: Option<&str>,
        content_type: &ContentType,
    ) -> Option<CaptureIgnoreReason> {
        if text.trim().is_empty() {
            return Some(CaptureIgnoreReason::Empty);
        }
        if source_app.is_some_and(|source| {
            self.settings
                .ignored_apps
                .iter()
                .any(|ignored| ignored.eq_ignore_ascii_case(source))
        }) {
            return Some(CaptureIgnoreReason::Application);
        }
        if self
            .ignored_patterns
            .iter()
            .any(|pattern| pattern.is_match(text))
        {
            return Some(CaptureIgnoreReason::Pattern);
        }
        if self.settings.ignored_content_types.contains(content_type) {
            return Some(CaptureIgnoreReason::ContentType);
        }
        // High-risk secrets (keys, tokens, passwords, connection strings)
        // are excluded from history by default. The reason carries no
        // matched value, so nothing sensitive can reach a log line.
        if crate::detection::contains_high_risk_secret(text) {
            return Some(CaptureIgnoreReason::Sensitive);
        }
        None
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CaptureIgnoreReason {
    Empty,
    Duplicate,
    Application,
    Pattern,
    ContentType,
    Sensitive,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CaptureOutcome {
    Stored(LibraryItem),
    Ignored(CaptureIgnoreReason),
}

pub struct ClipboardCapture<A> {
    repository: Repository,
    foreground_app: A,
    policy: CapturePolicy,
}

impl<A: ForegroundApp> ClipboardCapture<A> {
    pub fn new(repository: Repository, foreground_app: A, policy: CapturePolicy) -> Self {
        Self {
            repository,
            foreground_app,
            policy,
        }
    }

    pub async fn capture(
        &self,
        text: String,
        content_type: ContentType,
    ) -> RepositoryResult<CaptureOutcome> {
        // Callers pass PlainText for raw clipboard text; upgrade it to the
        // detected type (and language, for code) while keeping the raw
        // content untouched. An explicit non-plain type is respected as-is.
        let (content_type, language) = if content_type == ContentType::PlainText {
            crate::detection::detect(&text)
        } else {
            (content_type, None)
        };

        let source_app = self.foreground_app.executable_name();
        if let Some(reason) =
            self.policy
                .ignore_reason(&text, source_app.as_deref(), &content_type)
        {
            return Ok(CaptureOutcome::Ignored(reason));
        }

        if let Some(previous) = self.repository.latest_clipboard_content().await? {
            if normalize_line_endings(&previous) == normalize_line_endings(&text) {
                return Ok(CaptureOutcome::Ignored(CaptureIgnoreReason::Duplicate));
            }
        }

        let item = self
            .repository
            .save_clipboard_item(text, content_type)
            .await?;
        let item = if let Some(language) = language {
            self.repository.set_item_language(&item.id, &language).await?
        } else {
            item
        };
        self.repository
            .prune_clipboard_history(
                self.policy.settings.max_items,
                self.policy.settings.history_days,
            )
            .await?;
        Ok(CaptureOutcome::Stored(item))
    }
}

fn normalize_line_endings(text: &str) -> Cow<'_, str> {
    if text.contains('\r') {
        Cow::Owned(text.replace("\r\n", "\n").replace('\r', "\n"))
    } else {
        Cow::Borrowed(text)
    }
}
