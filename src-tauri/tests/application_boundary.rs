use snipdock_lib::{
    error::{AppError, ErrorCode},
    state::AppState,
};

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
