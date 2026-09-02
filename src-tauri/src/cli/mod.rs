//! Localhost HTTP endpoint the SnipDock CLI talks to. Bound to `127.0.0.1`
//! on a random 16-bit port and gated by a per-launch token; the CLI reads
//! both from files in the data directory on every invocation, so the token
//! rotates every time the app starts without the user having to refresh a
//! secret in their shell.
//!
//! The server is intentionally a thin pass-through over the existing
//! `commands::actions` and repository methods. New business logic does not
//! live here; the route handler just maps an HTTP request to the same call
//! the Tauri command would make.
pub mod server;
