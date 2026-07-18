use crate::{
    error::{AppError, ErrorCode},
    formatting,
    models::{ContentType, FormatOperation, FormatRequest, ToolRequest, ToolResult},
};
use regex::Regex;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub fn run(request: ToolRequest) -> Result<ToolResult, AppError> {
    let text = input_text(&request.input);
    let output = match request.tool.as_str() {
        "base64_encode" => json!(base64_encode(text.as_bytes())),
        "base64_decode" => json!(String::from_utf8_lossy(&base64_decode(text)?).to_string()),
        "url_encode" => json!(url_encode(text)),
        "url_decode" => json!(url_decode(text)?),
        "jwt_decode" => return jwt_decode(text),
        "uuid" => json!(Uuid::new_v4().to_string()),
        "sha256" | "hash_sha256" => json!(format!("{:x}", Sha256::digest(text.as_bytes()))),
        "unix_time" => json!(unix_time(text)),
        "case" => json!({
            "lower": text.to_ascii_lowercase(),
            "upper": text.to_ascii_uppercase(),
            "snake": words(text).join("_").to_ascii_lowercase(),
            "kebab": words(text).join("-").to_ascii_lowercase(),
        }),
        "env" => json!(text.lines().filter_map(|line| line.split_once('=')).map(|(k, v)| json!({"key": k.trim(), "value": v.trim()})).collect::<Vec<_>>()),
        "json_pretty" => json!(formatting::format(&FormatRequest { content: text.into(), content_type: ContentType::Json, operation: FormatOperation::Pretty }, 2)),
        "regex" => regex_tool(&request.input)?,
        "cron" => json!(cron_tool(text)),
        "markdown" => json!(sanitize_markdown(text)),
        "diff" => diff_tool(&request.input)?,
        _ => return Err(AppError::new(ErrorCode::Validation, "unknown tool")),
    };
    Ok(ToolResult {
        output,
        warnings: Vec::new(),
    })
}

fn input_text(value: &Value) -> &str {
    value
        .get("text")
        .or_else(|| value.get("input"))
        .and_then(Value::as_str)
        .or_else(|| value.as_str())
        .unwrap_or_default()
}

fn regex_tool(value: &Value) -> Result<Value, AppError> {
    let pattern = value.get("pattern").and_then(Value::as_str).unwrap_or_default();
    let text = input_text(value);
    if pattern.len() > 512 || text.len() > 100_000 {
        return Err(AppError::new(ErrorCode::Validation, "regex input too large"));
    }
    let regex = Regex::new(pattern)
        .map_err(|error| AppError::new(ErrorCode::Validation, error.to_string()))?;
    Ok(json!(regex
        .captures_iter(text)
        .take(100)
        .map(|captures| {
            json!({
                "match": captures.get(0).map(|m| m.as_str()).unwrap_or_default(),
                "groups": captures.iter().skip(1).map(|m| m.map(|m| m.as_str()).unwrap_or("")).collect::<Vec<_>>()
            })
        })
        .collect::<Vec<_>>()))
}

fn diff_tool(value: &Value) -> Result<Value, AppError> {
    let left = value.get("left").and_then(Value::as_str).unwrap_or_default();
    let right = value.get("right").and_then(Value::as_str).unwrap_or_default();
    if left.len() + right.len() > 1_000_000 {
        return Err(AppError::new(ErrorCode::Validation, "diff input too large"));
    }
    let left_lines: Vec<&str> = left.lines().collect();
    let right_lines: Vec<&str> = right.lines().collect();
    let max = left_lines.len().max(right_lines.len());
    Ok(json!((0..max)
        .filter_map(|index| match (left_lines.get(index), right_lines.get(index)) {
            (Some(a), Some(b)) if a == b => None,
            (Some(a), Some(b)) => Some(format!("- {a}\n+ {b}")),
            (Some(a), None) => Some(format!("- {a}")),
            (None, Some(b)) => Some(format!("+ {b}")),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n")))
}

fn jwt_decode(text: &str) -> Result<ToolResult, AppError> {
    let parts: Vec<&str> = text.split('.').collect();
    if parts.len() < 2 {
        return Err(AppError::new(ErrorCode::Validation, "JWT must have header and payload"));
    }
    Ok(ToolResult {
        output: json!({
            "header": decode_json_part(parts[0])?,
            "payload": decode_json_part(parts[1])?,
        }),
        warnings: vec!["signature is decoded but not verified".into()],
    })
}

fn decode_json_part(part: &str) -> Result<Value, AppError> {
    let decoded = base64_decode(&part.replace('-', "+").replace('_', "/"))?;
    serde_json::from_slice(&decoded)
        .map_err(|error| AppError::new(ErrorCode::Validation, error.to_string()))
}

fn unix_time(text: &str) -> Value {
    let seconds = text.trim().parse::<i64>().unwrap_or_default();
    json!({ "seconds": seconds, "utc": format!("{seconds}") })
}

fn cron_tool(text: &str) -> Value {
    let fields: Vec<&str> = text.split_whitespace().collect();
    json!({
        "valid": fields.len() == 5,
        "summary": if fields.len() == 5 { "five-field cron expression" } else { "expected minute hour day month weekday" }
    })
}

fn sanitize_markdown(text: &str) -> String {
    text.replace('<', "&lt;").replace('>', "&gt;")
}

fn words(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect()
}

fn url_encode(text: &str) -> String {
    text.bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                (byte as char).to_string()
            }
            b' ' => "%20".into(),
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

fn url_decode(text: &str) -> Result<String, AppError> {
    let mut bytes = Vec::new();
    let mut chars = text.as_bytes().iter().copied();
    while let Some(byte) = chars.next() {
        if byte == b'%' {
            let hi = chars.next().ok_or_else(|| AppError::new(ErrorCode::Validation, "bad percent escape"))?;
            let lo = chars.next().ok_or_else(|| AppError::new(ErrorCode::Validation, "bad percent escape"))?;
            let hex = [hi, lo];
            let value = u8::from_str_radix(std::str::from_utf8(&hex).unwrap_or(""), 16)
                .map_err(|_| AppError::new(ErrorCode::Validation, "bad percent escape"))?;
            bytes.push(value);
        } else {
            bytes.push(byte);
        }
    }
    String::from_utf8(bytes).map_err(|error| AppError::new(ErrorCode::Validation, error.to_string()))
}

const BASE64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(bytes: &[u8]) -> String {
    let mut output = String::new();
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);
        output.push(BASE64[(b0 >> 2) as usize] as char);
        output.push(BASE64[(((b0 & 0b11) << 4) | (b1 >> 4)) as usize] as char);
        output.push(if chunk.len() > 1 { BASE64[(((b1 & 0b1111) << 2) | (b2 >> 6)) as usize] as char } else { '=' });
        output.push(if chunk.len() > 2 { BASE64[(b2 & 0b111111) as usize] as char } else { '=' });
    }
    output
}

fn base64_decode(text: &str) -> Result<Vec<u8>, AppError> {
    let mut buffer = 0_u32;
    let mut bits = 0_u8;
    let mut output = Vec::new();
    for byte in text.bytes().filter(|b| !b.is_ascii_whitespace() && *b != b'=') {
        let value = BASE64
            .iter()
            .position(|candidate| *candidate == byte)
            .ok_or_else(|| AppError::new(ErrorCode::Validation, "invalid base64"))? as u32;
        buffer = (buffer << 6) | value;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }
    Ok(output)
}
