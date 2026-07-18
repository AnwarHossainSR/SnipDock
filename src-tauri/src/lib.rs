pub mod app;
pub mod commands;
pub mod error;
pub mod features;
pub mod models;
pub mod platform;
pub mod storage;

pub use app::run;
pub use app::state;
pub use features::clipboard;
pub use features::{ai, detection, formatting, security, sync, templates, tools, transfer};
pub use platform::windows as os;
pub use storage as repository;
pub use storage::database as db;
