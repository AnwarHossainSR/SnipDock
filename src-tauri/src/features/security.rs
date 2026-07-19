use crate::error::{AppError, ErrorCode};
use sha2::{Digest, Sha256};

pub fn protect_text(text: &str) -> String {
    format!("snipdock:v1:{}", sha256_hex(text.as_bytes()))
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn reject_private(private: bool) -> Result<(), AppError> {
    if private {
        Err(AppError::new(
            ErrorCode::Validation,
            "private records cannot leave the local security boundary",
        ))
    } else {
        Ok(())
    }
}
