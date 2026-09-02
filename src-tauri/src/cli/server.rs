use crate::{
    clipboard::ClipboardMonitor,
    commands::clipboard::{self, actions::ClipboardPayload},
    error::{AppError, ErrorCode},
    models::{
        CopyMode, ExportRequest, ItemFlags, LibraryItem, Page, SearchQuery, SortOrder,
        SaveTagInput, Tag,
    },
    repository::Repository,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    fmt,
    net::{SocketAddr, TcpListener},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

pub const CLI_TOKEN_FILE: &str = "cli-token";
pub const CLI_PORT_FILE: &str = "cli-port";

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RouteResponse {
    pub status: u16,
    pub body: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RouteRequest {
    pub method: Method,
    pub path: String,
    pub body: Vec<u8>,
    pub auth_header: Option<String>,
}

#[derive(Debug)]
pub enum ServerError {
    Io(std::io::Error),
    Http(String),
    NoFreePort,
}

impl fmt::Display for ServerError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "io: {error}"),
            Self::Http(error) => write!(formatter, "http: {error}"),
            Self::NoFreePort => formatter.write_str("no free port available"),
        }
    }
}

impl std::error::Error for ServerError {}

impl From<std::io::Error> for ServerError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

/// Hands a clipboard payload off to the OS so the CLI's `paste` route lands
/// the same content the in-app Quick Paste would have. Production wires this
/// to `clipboard::write_payload` against the live `AppHandle`; tests substitute
/// a `Vec<u8>`-capturing closure so they never touch the system clipboard.
pub type PayloadWriter = Arc<dyn Fn(ClipboardPayload<'_>) -> Result<(), String> + Send + Sync>;

/// Everything a route handler needs to do its work. Cheap to construct per
/// request because the inner `Repository` is itself an `Arc`.
#[derive(Clone)]
pub struct ServiceContext {
    pub token: String,
    pub repository: Repository,
    pub paste_writer: PayloadWriter,
    pub paste_format: crate::models::PasteFormat,
}

pub struct RouteContext {
    pub service: ServiceContext,
    pub data_dir: PathBuf,
    pub monitor: Arc<ClipboardMonitor>,
}

#[derive(Clone)]
pub struct ServerHandle {
    server: Option<Arc<Server>>,
    pub token: String,
    pub port: u16,
    pub data_dir: PathBuf,
}

impl Drop for ServerHandle {
    fn drop(&mut self) {
        if let Some(server) = self.server.take() {
            server.unblock();
        }
        let _ = std::fs::remove_file(self.data_dir.join(CLI_TOKEN_FILE));
        let _ = std::fs::remove_file(self.data_dir.join(CLI_PORT_FILE));
    }
}

/// Opens a `tiny_http` server on `127.0.0.1` with a free port, writes the
/// token + port to the data directory, and returns a handle the caller can
/// drop to stop it. The token is regenerated every launch and shared through
/// the file system so the CLI does not need a separate configuration.
pub fn start(
    data_dir: &Path,
    repository: Repository,
    monitor: Arc<ClipboardMonitor>,
    paste_writer: PayloadWriter,
    paste_format: crate::models::PasteFormat,
) -> Result<ServerHandle, ServerError> {
    std::fs::create_dir_all(data_dir)?;
    let token = generate_token();
    let port = pick_port()?;
    let address: SocketAddr = ([127, 0, 0, 1], port).into();
    let server = Arc::new(
        Server::http(address).map_err(|error| ServerError::Http(error.to_string()))?,
    );
    write_secret_file(&data_dir.join(CLI_TOKEN_FILE), &token)?;
    write_secret_file(&data_dir.join(CLI_PORT_FILE), &port.to_string())?;
    let service = ServiceContext {
        token: token.clone(),
        repository,
        paste_writer,
        paste_format,
    };
    let context = RouteContext {
        service,
        data_dir: data_dir.to_path_buf(),
        monitor,
    };
    let server_for_thread = Arc::clone(&server);
    thread::Builder::new()
        .name("snipdock-cli-server".into())
        .spawn(move || {
            for request in server_for_thread.incoming_requests() {
                if let Err(error) = handle_request(&context, request) {
                    eprintln!("CLI server request failed: {error}");
                }
            }
        })?;
    Ok(ServerHandle {
        server: Some(server),
        token,
        port,
        data_dir: data_dir.to_path_buf(),
    })
}

fn handle_request(context: &RouteContext, mut request: Request) -> Result<(), ServerError> {
    let method = request.method().clone();
    let path = request.url().to_owned();
    let auth_header = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Authorization"))
        .map(|header| header.value.as_str().to_owned());
    let mut body = Vec::new();
    request
        .as_reader()
        .read_to_end(&mut body)
        .map_err(ServerError::Io)?;
    let route_request = RouteRequest { method, path, body, auth_header };
    let response = tauri::async_runtime::block_on(route(context, &route_request));
    send_response(request, &response);
    Ok(())
}

fn send_response(request: Request, response: &RouteResponse) {
    let body = serde_json::to_vec(&response.body).unwrap_or_else(|_| b"{}".to_vec());
    let status = StatusCode(response.status);
    let mime = Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
    let length = Header::from_bytes(&b"Content-Length"[..], body.len().to_string().as_bytes())
        .unwrap();
    let response = Response::from_data(body)
        .with_status_code(status)
        .with_header(mime)
        .with_header(length);
    let _ = request.respond(response);
}

/// Routes a single request to the matching handler. Every public route
/// returns JSON; error paths use the standard `{ "error": { "code", "message" } }`
/// shape so the CLI can render a single line without parsing free text.
pub async fn route(context: &RouteContext, request: &RouteRequest) -> RouteResponse {
    if request.method != Method::Post {
        return error_response(
            StatusCode(404),
            "not_found",
            format!("no route for {} {}", request.method, request.path),
        );
    }
    if let Err(error) = authenticate(&context.service.token, request.auth_header.as_deref()) {
        return error_response(StatusCode(401), "unauthorized", error);
    }
    match request.path.as_str() {
        "/pin" => handle_pin(&context.service, &request.body).await,
        "/unpin" => handle_unpin(&context.service, &request.body).await,
        "/favorite" => handle_favorite(&context.service, &request.body).await,
        "/unfavorite" => handle_unfavorite(&context.service, &request.body).await,
        "/tag" => handle_tag(&context.service, &request.body).await,
        "/search" => handle_search(&context.service, &request.body).await,
        "/paste" => handle_paste(context, &request.body).await,
        "/export" => handle_export(&context.service, &request.body).await,
        _ => error_response(
            StatusCode(404),
            "not_found",
            format!("no route for POST {}", request.path),
        ),
    }
}

async fn handle_pin(service: &ServiceContext, body: &[u8]) -> RouteResponse {
    let request: ItemIdRequest = match parse_body(body) {
        Ok(value) => value,
        Err(response) => return response,
    };
    match service
        .repository
        .set_item_flags(
            &request.id,
            ItemFlags { pinned: Some(true), favorite: None, archived: None },
        )
        .await
    {
        Ok(updated) => ok_response(json!({ "item": updated })),
        Err(error) => map_repository_error(error),
    }
}

async fn handle_unpin(service: &ServiceContext, body: &[u8]) -> RouteResponse {
    let request: ItemIdRequest = match parse_body(body) {
        Ok(value) => value,
        Err(response) => return response,
    };
    match service
        .repository
        .set_item_flags(
            &request.id,
            ItemFlags { pinned: Some(false), favorite: None, archived: None },
        )
        .await
    {
        Ok(updated) => ok_response(json!({ "item": updated })),
        Err(error) => map_repository_error(error),
    }
}

async fn handle_favorite(service: &ServiceContext, body: &[u8]) -> RouteResponse {
    let request: ItemIdRequest = match parse_body(body) {
        Ok(value) => value,
        Err(response) => return response,
    };
    match service
        .repository
        .set_item_flags(
            &request.id,
            ItemFlags { pinned: None, favorite: Some(true), archived: None },
        )
        .await
    {
        Ok(updated) => ok_response(json!({ "item": updated })),
        Err(error) => map_repository_error(error),
    }
}

async fn handle_unfavorite(service: &ServiceContext, body: &[u8]) -> RouteResponse {
    let request: ItemIdRequest = match parse_body(body) {
        Ok(value) => value,
        Err(response) => return response,
    };
    match service
        .repository
        .set_item_flags(
            &request.id,
            ItemFlags { pinned: None, favorite: Some(false), archived: None },
        )
        .await
    {
        Ok(updated) => ok_response(json!({ "item": updated })),
        Err(error) => map_repository_error(error),
    }
}

async fn handle_tag(service: &ServiceContext, body: &[u8]) -> RouteResponse {
    let request: TagRequest = match parse_body(body) {
        Ok(value) => value,
        Err(response) => return response,
    };
    let tag = match resolve_or_create_tag(service, &request.tag).await {
        Ok(tag) => tag,
        Err(response) => return response,
    };
    match service
        .repository
        .set_item_tags(&request.id, &[tag.id.clone()])
        .await
    {
        Ok(item) => ok_response(json!({ "item": item, "tag": tag })),
        Err(error) => map_repository_error(error),
    }
}

async fn resolve_or_create_tag(service: &ServiceContext, name: &str) -> Result<Tag, RouteResponse> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(error_response(
            StatusCode(400),
            "validation",
            "tag must not be empty".to_string(),
        ));
    }
    let tags = service.repository.list_tags().await.map_err(map_repository_error)?;
    if let Some(existing) = tags.iter().find(|tag| tag.name == trimmed) {
        return Ok(existing.clone());
    }
    let input = SaveTagInput {
        id: None,
        name: trimmed.to_owned(),
        color: default_tag_color(trimmed),
    };
    service.repository.save_tag(input).await.map_err(map_repository_error)
}

fn default_tag_color(name: &str) -> String {
    let mut hash: u32 = 0;
    for byte in name.as_bytes() {
        hash = hash.wrapping_mul(31).wrapping_add(u32::from(*byte));
    }
    format!("#{:06x}", hash & 0xFFFFFF)
}

async fn handle_search(service: &ServiceContext, body: &[u8]) -> RouteResponse {
    let request: SearchRequest = match parse_body(body) {
        Ok(value) => value,
        Err(response) => return response,
    };
    let mut query = SearchQuery::default_search(request.query.as_deref());
    query.limit = request.limit.unwrap_or(50).clamp(1, 200);
    query.offset = request.offset.unwrap_or(0);
    match service.repository.search(query).await {
        Ok(page) => ok_response(search_response(&page)),
        Err(error) => map_repository_error(error),
    }
}

fn search_response(page: &Page<LibraryItem>) -> serde_json::Value {
    json!({
        "ids": page.items.iter().map(|item| item.id.clone()).collect::<Vec<_>>(),
        "total": page.total,
    })
}

async fn handle_paste(context: &RouteContext, body: &[u8]) -> RouteResponse {
    let request: ItemIdRequest = match parse_body(body) {
        Ok(value) => value,
        Err(response) => return response,
    };
    let writer = context.service.paste_writer.clone();
    let paste_format = context.service.paste_format;
    let result = clipboard::actions::copy_item(
        &context.service.repository,
        &context.monitor,
        &context.data_dir,
        &request.id,
        CopyMode::Raw,
        paste_format,
        None,
        move |payload| (writer)(payload),
    )
    .await;
    match result {
        Ok(receipt) => ok_response(json!({
            "item_id": receipt.item_id,
            "copied_at": receipt.copied_at,
        })),
        Err(error) => map_app_error(error),
    }
}

async fn handle_export(service: &ServiceContext, body: &[u8]) -> RouteResponse {
    let request: ExportWireRequest = match parse_body(body) {
        Ok(value) => value,
        Err(response) => return response,
    };
    let export = ExportRequest {
        format: request.format,
        item_ids: request.item_ids,
        project_ids: request.project_ids,
        path: request.path,
    };
    match crate::transfer::export_data(&service.repository, export).await {
        Ok(receipt) => ok_response(
            json!({ "path": receipt.path, "item_count": receipt.item_count, "warnings": receipt.warnings }),
        ),
        Err(error) => map_app_error(error),
    }
}

fn authenticate(expected: &str, header: Option<&str>) -> Result<(), String> {
    let header = header.ok_or_else(|| "missing Authorization header".to_owned())?;
    let token = header
        .strip_prefix("Bearer ")
        .ok_or_else(|| "Authorization header must use the Bearer scheme".to_owned())?;
    if !constant_time_eq(token.as_bytes(), expected.as_bytes()) {
        return Err("invalid token".to_owned());
    }
    Ok(())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn parse_body<T: for<'de> Deserialize<'de>>(body: &[u8]) -> Result<T, RouteResponse> {
    serde_json::from_slice(body).map_err(|error| {
        error_response(
            StatusCode(400),
            "validation",
            format!("invalid request body: {error}"),
        )
    })
}

fn map_repository_error(error: crate::repository::RepositoryError) -> RouteResponse {
    map_app_error(crate::commands::repository_error(error))
}

fn map_app_error(error: AppError) -> RouteResponse {
    let status = match error.code {
        ErrorCode::NotFound => StatusCode(404),
        ErrorCode::Validation | ErrorCode::InvalidRegex => StatusCode(400),
        ErrorCode::Startup | ErrorCode::Storage => StatusCode(500),
        ErrorCode::Clipboard | ErrorCode::Internal => StatusCode(500),
    };
    error_response(status, error_code_label(error.code), error.message)
}

fn error_code_label(code: ErrorCode) -> &'static str {
    match code {
        ErrorCode::NotFound => "not_found",
        ErrorCode::Validation => "validation",
        ErrorCode::InvalidRegex => "invalid_regex",
        ErrorCode::Startup => "startup",
        ErrorCode::Storage => "storage",
        ErrorCode::Clipboard => "clipboard",
        ErrorCode::Internal => "internal",
    }
}

fn error_response(status: StatusCode, code: &str, message: String) -> RouteResponse {
    RouteResponse {
        status: status.0,
        body: json!({ "error": { "code": code, "message": message } }),
    }
}

fn ok_response(body: serde_json::Value) -> RouteResponse {
    RouteResponse { status: 200, body }
}

pub fn generate_token() -> String {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes).expect("os rng available");
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn pick_port() -> Result<u16, ServerError> {
    for _ in 0..16 {
        let listener = TcpListener::bind(("127.0.0.1", 0))?;
        let port = listener.local_addr()?.port();
        drop(listener);
        if port != 0 {
            return Ok(port);
        }
    }
    Err(ServerError::NoFreePort)
}

fn write_secret_file(path: &Path, content: &str) -> Result<(), ServerError> {
    std::fs::write(path, content)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(path)?.permissions();
        permissions.set_mode(0o600);
        std::fs::set_permissions(path, permissions)?;
    }
    Ok(())
}

#[derive(Deserialize)]
struct ItemIdRequest {
    id: String,
}

#[derive(Deserialize)]
struct TagRequest {
    id: String,
    tag: String,
}

#[derive(Deserialize, Default)]
struct SearchRequest {
    #[serde(default)]
    query: Option<String>,
    #[serde(default)]
    limit: Option<u32>,
    #[serde(default)]
    offset: Option<u32>,
}

#[derive(Deserialize)]
struct ExportWireRequest {
    format: String,
    #[serde(default)]
    item_ids: Vec<String>,
    #[serde(default)]
    project_ids: Vec<String>,
    path: String,
}

trait SearchQueryDefaults {
    fn default_search(text: Option<&str>) -> SearchQuery;
}

impl SearchQueryDefaults for SearchQuery {
    fn default_search(text: Option<&str>) -> SearchQuery {
        SearchQuery {
            text: text.map(str::to_owned),
            kinds: Vec::new(),
            content_types: Vec::new(),
            languages: Vec::new(),
            project_ids: Vec::new(),
            category_ids: Vec::new(),
            tag_ids: Vec::new(),
            pinned: None,
            favorite: None,
            created_from: None,
            created_to: None,
            sort: SortOrder::Newest,
            limit: 50,
            offset: 0,
            source_apps: Vec::new(),
            regex: None,
            regex_case_insensitive: None,
            group_by: None,
        }
    }
}

/// Captures the bytes a route handed to the system clipboard so the test
/// suite can assert against them without touching the OS. Returned by
/// `capture_payload_writer`.
pub struct CapturedPayload {
    pub bytes: Mutex<Vec<u8>>,
}

impl CapturedPayload {
    pub fn new() -> Self {
        Self { bytes: Mutex::new(Vec::new()) }
    }
}

pub fn capture_payload_writer() -> (PayloadWriter, Arc<CapturedPayload>) {
    let captured = Arc::new(CapturedPayload::new());
    let writer = {
        let captured = Arc::clone(&captured);
        Arc::new(move |payload: ClipboardPayload<'_>| match payload {
            ClipboardPayload::Text(text) => {
                captured.bytes.lock().unwrap().extend_from_slice(text.as_bytes());
                Ok(())
            }
            ClipboardPayload::Image(image) => {
                let mut bytes = captured.bytes.lock().unwrap();
                bytes.extend_from_slice(&(image.width.to_le_bytes()));
                bytes.extend_from_slice(&(image.height.to_le_bytes()));
                bytes.extend_from_slice(&image.rgba);
                Ok(())
            }
        }) as PayloadWriter
    };
    (writer, captured)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clipboard::ClipboardSource;
    use crate::db::Database;
    use crate::models::{ItemKind, SaveItemInput};
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Duration;

    static NEXT: AtomicU64 = AtomicU64::new(0);

    #[derive(Default)]
    struct NullClipboard;

    impl ClipboardSource for NullClipboard {
        fn read_text(&self) -> Option<String> {
            None
        }
    }

    fn paused_monitor() -> Arc<ClipboardMonitor> {
        let monitor = ClipboardMonitor::start(
            Arc::new(NullClipboard),
            Duration::from_millis(5),
            |_| {},
        );
        monitor.pause();
        Arc::new(monitor)
    }

    async fn fixture() -> (tempfile::TempDir, Repository, RouteContext) {
        let dir = tempfile::tempdir().unwrap();
        let path: PathBuf = dir.path().join(format!(
            "cli-server-{}-{}.sqlite",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let database = Database::open(&path).await.unwrap();
        let repository = Repository::new(database.pool().clone());
        repository
            .save_item(SaveItemInput {
                id: None,
                kind: ItemKind::Snippet,
                title: Some("Title".into()),
                description: None,
                content: "alpha beta gamma".into(),
                content_type: crate::models::ContentType::PlainText,
                notes: None,
                project_id: None,
                category_id: None,
                tag_ids: Vec::new(),
                private: false,
                expires_at: None,
                source_app: None,
            })
            .await
            .unwrap();
        let (writer, _captured) = capture_payload_writer();
        let service = ServiceContext {
            token: "correct-token".into(),
            repository: repository.clone(),
            paste_writer: writer,
            paste_format: crate::models::PasteFormat::default(),
        };
        let context = RouteContext {
            service,
            data_dir: dir.path().to_path_buf(),
            monitor: paused_monitor(),
        };
        (dir, repository, context)
    }

    fn post(path: &str, body: serde_json::Value) -> RouteRequest {
        RouteRequest {
            method: Method::Post,
            path: path.to_owned(),
            body: serde_json::to_vec(&body).unwrap(),
            auth_header: Some("Bearer correct-token".into()),
        }
    }

    #[tokio::test]
    async fn pin_route_sets_the_flag() {
        let (_dir, repository, context) = fixture().await;
        let id = {
            let mut q = SearchQuery::default_search(None);
            q.limit = 10;
            let page = repository.search(q).await.unwrap();
            page.items[0].id.clone()
        };
        let request = post("/pin", serde_json::json!({ "id": id }));
        let response = route(&context, &request).await;
        assert_eq!(response.status, 200);
        let updated = repository.get_item(&id).await.unwrap();
        assert!(updated.pinned);
    }

    #[tokio::test]
    async fn pin_route_rejects_missing_id() {
        let (_dir, _repository, context) = fixture().await;
        let request = post("/pin", serde_json::json!({ "id": "missing" }));
        let response = route(&context, &request).await;
        assert_eq!(response.status, 404);
        assert_eq!(response.body["error"]["code"], "not_found");
    }

    #[tokio::test]
    async fn tag_route_creates_and_attaches() {
        let (_dir, repository, context) = fixture().await;
        let id = {
            let mut q = SearchQuery::default_search(None);
            q.limit = 10;
            let page = repository.search(q).await.unwrap();
            page.items[0].id.clone()
        };
        let request = post("/tag", serde_json::json!({ "id": id, "tag": "important" }));
        let response = route(&context, &request).await;
        assert_eq!(response.status, 200);
        assert_eq!(response.body["tag"]["name"], "important");
        let updated = repository.get_item(&id).await.unwrap();
        assert_eq!(updated.tag_ids.len(), 1);
    }

    #[tokio::test]
    async fn tag_route_reuses_existing_tag() {
        let (_dir, repository, context) = fixture().await;
        let id = {
            let mut q = SearchQuery::default_search(None);
            q.limit = 10;
            let page = repository.search(q).await.unwrap();
            page.items[0].id.clone()
        };
        let first = route(
            &context,
            &post("/tag", serde_json::json!({ "id": id, "tag": "shared" })),
        )
        .await;
        let second = route(
            &context,
            &post("/tag", serde_json::json!({ "id": id, "tag": "shared" })),
        )
        .await;
        assert_eq!(first.body["tag"]["id"], second.body["tag"]["id"]);
    }

    #[tokio::test]
    async fn tag_route_rejects_empty_name() {
        let (_dir, _repository, context) = fixture().await;
        let request = post("/tag", serde_json::json!({ "id": "x", "tag": "   " }));
        let response = route(&context, &request).await;
        assert_eq!(response.status, 400);
        assert_eq!(response.body["error"]["code"], "validation");
    }

    #[tokio::test]
    async fn search_route_returns_ids() {
        let (_dir, _repository, context) = fixture().await;
        let request = post("/search", serde_json::json!({ "query": "alpha" }));
        let response = route(&context, &request).await;
        assert_eq!(response.status, 200);
        let ids = response.body["ids"].as_array().unwrap();
        assert_eq!(ids.len(), 1);
        assert_eq!(response.body["total"], 1);
    }

    #[tokio::test]
    async fn search_route_with_no_query_returns_all() {
        let (_dir, _repository, context) = fixture().await;
        let request = post("/search", serde_json::json!({}));
        let response = route(&context, &request).await;
        assert_eq!(response.status, 200);
        assert_eq!(response.body["total"], 1);
    }

    #[tokio::test]
    async fn paste_route_writes_to_the_captured_writer() {
        let (_dir, repository, context) = fixture().await;
        let id = {
            let mut q = SearchQuery::default_search(None);
            q.limit = 10;
            let page = repository.search(q).await.unwrap();
            page.items[0].id.clone()
        };
        let (writer, captured) = capture_payload_writer();
        let mut ctx = context;
        ctx.service.paste_writer = writer;
        let request = post("/paste", serde_json::json!({ "id": id }));
        let response = route(&ctx, &request).await;
        assert_eq!(response.status, 200);
        assert_eq!(response.body["item_id"], id);
        let bytes = captured.bytes.lock().unwrap();
        let text = String::from_utf8(bytes.clone()).unwrap();
        assert_eq!(text, "alpha beta gamma");
    }

    #[tokio::test]
    async fn unauthenticated_request_is_rejected() {
        let (_dir, _repository, context) = fixture().await;
        let request = RouteRequest {
            method: Method::Post,
            path: "/pin".into(),
            body: serde_json::to_vec(&serde_json::json!({ "id": "x" })).unwrap(),
            auth_header: None,
        };
        let response = route(&context, &request).await;
        assert_eq!(response.status, 401);
        assert_eq!(response.body["error"]["code"], "unauthorized");
    }

    #[tokio::test]
    async fn wrong_token_is_rejected() {
        let (_dir, _repository, context) = fixture().await;
        let request = RouteRequest {
            method: Method::Post,
            path: "/pin".into(),
            body: serde_json::to_vec(&serde_json::json!({ "id": "x" })).unwrap(),
            auth_header: Some("Bearer wrong-token".into()),
        };
        let response = route(&context, &request).await;
        assert_eq!(response.status, 401);
    }

    #[tokio::test]
    async fn unknown_route_returns_404() {
        let (_dir, _repository, context) = fixture().await;
        let request = post("/nope", serde_json::json!({}));
        let response = route(&context, &request).await;
        assert_eq!(response.status, 404);
    }

    #[test]
    fn empty_token_files_are_removed_on_handle_drop() {
        let dir = tempfile::tempdir().unwrap();
        let token_path = dir.path().join(CLI_TOKEN_FILE);
        let port_path = dir.path().join(CLI_PORT_FILE);
        std::fs::write(&token_path, "abc").unwrap();
        std::fs::write(&port_path, "1234").unwrap();
        let handle = ServerHandle {
            server: None,
            token: "abc".into(),
            port: 1234,
            data_dir: dir.path().to_path_buf(),
        };
        drop(handle);
        assert!(!token_path.exists());
        assert!(!port_path.exists());
    }

    #[test]
    fn constant_time_eq_handles_length_mismatch_and_equal_inputs() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abcd"));
        assert!(!constant_time_eq(b"abc", b"abd"));
    }

    #[test]
    fn pick_port_returns_a_free_high_port() {
        let port = pick_port().unwrap();
        assert!(port > 0);
    }

    #[test]
    fn generate_token_produces_distinct_values() {
        let a = generate_token();
        let b = generate_token();
        assert_eq!(a.len(), 32);
        assert_ne!(a, b);
    }

    #[test]
    fn authenticate_rejects_non_bearer_scheme() {
        let error = authenticate("abc", Some("Basic abc")).unwrap_err();
        assert!(error.contains("Bearer"));
    }

    #[test]
    fn route_error_response_includes_code_and_message() {
        let response = error_response(StatusCode(400), "validation", "bad".into());
        assert_eq!(response.status, 400);
        assert_eq!(response.body["error"]["code"], "validation");
        assert_eq!(response.body["error"]["message"], "bad");
    }
}
