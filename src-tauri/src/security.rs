use crate::{
    error::{AppError, ErrorCode},
    models::{UnlockRequest, UnlockResult},
};
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, Ordering};

static LOCKED: AtomicBool = AtomicBool::new(false);

pub fn lock() {
    LOCKED.store(true, Ordering::SeqCst);
}

pub fn unlock(request: UnlockRequest) -> Result<UnlockResult, AppError> {
    if request.use_biometric {
        return Ok(UnlockResult {
            unlocked: false,
            retry_after_seconds: None,
        });
    }
    let pin = request.pin.unwrap_or_default();
    if pin.len() < 4 {
        return Ok(UnlockResult {
            unlocked: false,
            retry_after_seconds: Some(5),
        });
    }
    let _pin_hash = Sha256::digest(pin.as_bytes());
    LOCKED.store(false, Ordering::SeqCst);
    Ok(UnlockResult {
        unlocked: true,
        retry_after_seconds: None,
    })
}

pub fn protect_text(text: &str) -> String {
    format!("snipdock:v1:{}", hex(Sha256::digest(text.as_bytes()).as_slice()))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
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
