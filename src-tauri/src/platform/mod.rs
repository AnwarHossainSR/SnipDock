//! OS-specific desktop integration. `native` holds the per-platform
//! foreground-app lookup and direct-paste behavior behind `#[cfg(target_os)]`
//! branches; today Windows has full support and macOS/Linux fall back to
//! no-ops until their native implementations land.
pub mod native;
pub mod shortcuts;
