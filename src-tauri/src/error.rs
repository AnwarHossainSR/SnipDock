use serde::Serialize;
use std::fmt;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    Startup,
    Validation,
    NotFound,
    Storage,
    Clipboard,
    /// The user typed a regex the backend could not compile. The frontend
    /// uses this code to show the inline "invalid pattern" error in the
    /// search box without re-purposing the generic validation path.
    InvalidRegex,
    Internal,
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Startup => formatter.write_str("startup"),
            Self::Validation => formatter.write_str("validation"),
            Self::NotFound => formatter.write_str("not_found"),
            Self::Storage => formatter.write_str("storage"),
            Self::Clipboard => formatter.write_str("clipboard"),
            Self::InvalidRegex => formatter.write_str("invalid_regex"),
            Self::Internal => formatter.write_str("internal"),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
}

impl AppError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

/// A Quick Paste transform failed on the input it was given. Reported to the
/// UI as a validation error so the user can see the cause and nothing is
/// written to the clipboard.
impl From<crate::features::formatting::TransformError> for AppError {
    fn from(error: crate::features::formatting::TransformError) -> Self {
        Self::new(ErrorCode::Validation, error.to_string())
    }
}
