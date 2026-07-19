use snipdock_lib::db::Database;
use std::{path::PathBuf, time::Duration};

pub async fn remove_database(database: Database, path: PathBuf) {
    database.close().await;

    for attempt in 0..10 {
        match std::fs::remove_file(&path) {
            Ok(()) => return,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
            Err(error) if attempt == 9 => panic!("failed to remove {}: {error}", path.display()),
            Err(_) => tokio::time::sleep(Duration::from_millis(10)).await,
        }
    }
}
