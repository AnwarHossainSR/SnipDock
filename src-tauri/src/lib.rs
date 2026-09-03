pub mod app;
/// The localhost CLI endpoint. Desktop only: `tiny_http` is not built
/// for Android, and the platform gives a backgrounded app no socket to keep.
#[cfg(desktop)]
pub mod cli;
pub mod commands;
pub mod error;
pub mod features;
pub mod models;
pub mod platform;
pub mod storage;

pub use app::run;
pub use app::state;
pub use features::clipboard;
pub use features::{backup, cloud, crypto, detection, formatting, images, security, transfer};
pub use platform::native as os;
pub use storage as repository;
pub use storage::database as db;
