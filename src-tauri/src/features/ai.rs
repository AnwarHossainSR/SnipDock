use crate::{
    error::{AppError, ErrorCode},
    models::{AiRequest, AiResult},
};

pub fn run(request: AiRequest) -> Result<AiResult, AppError> {
    if !request.consent {
        return Err(AppError::new(
            ErrorCode::Validation,
            "AI actions require per-request consent",
        ));
    }
    if request.content.trim().is_empty() {
        return Err(AppError::new(ErrorCode::Validation, "content is required"));
    }
    Ok(AiResult {
        output: format!(
            "[fake provider disabled by default]\nAction: {}\nPreview:\n{}",
            request.action,
            redact(&request.content)
        ),
        warnings: vec!["No network call was made. Configure a provider later.".into()],
    })
}

fn redact(text: &str) -> String {
    text.split_whitespace()
        .map(|word| {
            if word.len() > 24 || word.contains("sk-") || word.contains("token") {
                "[redacted]"
            } else {
                word
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
