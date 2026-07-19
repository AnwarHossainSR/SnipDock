use snipdock_lib::{
    error::{AppError, ErrorCode},
    security::sha256_hex,
    state::AppState,
};

#[test]
fn sha256_digest_has_stable_lowercase_hex_output() {
    assert_eq!(
        sha256_hex(b"abc"),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
}

#[test]
fn startup_errors_have_stable_serialized_codes_and_messages() {
    let error = AppError::new(ErrorCode::Startup, "window initialization failed");

    assert_eq!(
        error.to_string(),
        "startup: window initialization failed"
    );
    assert_eq!(
        serde_json::to_value(error).unwrap(),
        serde_json::json!({
            "code": "startup",
            "message": "window initialization failed",
        })
    );
}

#[test]
fn application_state_can_be_shared_by_tauri() {
    fn assert_send_sync<T: Send + Sync>() {}

    assert_send_sync::<AppState>();
}
