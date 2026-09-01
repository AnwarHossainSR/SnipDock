use crate::models::{ContentType, Diagnostic, FormatOperation, FormatRequest, FormatResult, PasteFormat, Transform};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use serde::{Deserialize, Serialize};
use std::fmt;

/// A failed Quick Paste transform. Returned by `apply_transform` rather than
/// panicked so the UI can surface the error and refuse to copy/paste.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TransformError {
    /// The input is not valid for the chosen transform (malformed JSON, bad
    /// base64 padding, percent-decoding produced invalid UTF-8, ...).
    InvalidInput { message: String },
}

impl fmt::Display for TransformError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInput { message } => write!(formatter, "{message}"),
        }
    }
}

impl std::error::Error for TransformError {}

/// Apply paste format to content before copying to clipboard.
pub fn apply_paste_format(content: &str, format: PasteFormat) -> String {
    match format {
        PasteFormat::Preserve => content.to_string(),
        PasteFormat::PlainText => strip_html_formatting(content),
        PasteFormat::StripWhitespace => strip_extra_whitespace(content),
    }
}

/// Strip HTML formatting and convert to plain text.
fn strip_html_formatting(content: &str) -> String {
    // Remove HTML tags
    let mut text = content.to_string();
    while let Some(start) = text.find('<') {
        if let Some(end) = text[start..].find('>') {
            let tag = &text[start..start + end + 1];
            // Add line breaks for block-level elements
            let replacement = if tag.starts_with("<br") || tag.starts_with("<p") || tag.starts_with("<div") || tag.starts_with("<li") {
                "\n"
            } else {
                ""
            };
            text = format!("{}{}{}", &text[..start], replacement, &text[start + end + 1..]);
        } else {
            break;
        }
    }
    
    // Decode common HTML entities
    text = text
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");
    
    // Normalize line breaks
    text = text.replace("\r\n", "\n").replace('\r', "\n");
    
    // Remove excessive blank lines (more than 2 consecutive)
    let mut result = String::new();
    let mut blank_count = 0;
    for line in text.lines() {
        if line.trim().is_empty() {
            blank_count += 1;
            if blank_count <= 2 {
                result.push('\n');
            }
        } else {
            blank_count = 0;
            result.push_str(line);
            result.push('\n');
        }
    }
    
    result.trim().to_string()
}

/// Strip extra whitespace while preserving structure.
fn strip_extra_whitespace(content: &str) -> String {
    content
        .lines()
        .map(|line| line.trim())
        .collect::<Vec<_>>()
        .join("\n")
        .split("\n\n\n")
        .collect::<Vec<_>>()
        .join("\n\n")
        .trim()
        .to_string()
}

/// Formats or validates `request.content` without ever mutating the input:
/// on any error the original content is returned unchanged alongside
/// line/column diagnostics.
pub fn format(request: &FormatRequest, indent: u32) -> FormatResult {
    let indent = indent.clamp(1, 8) as usize;
    match request.content_type {
        ContentType::Json => format_json(&request.content, request.operation, indent as u32),
        ContentType::Sql => format_sql(&request.content, request.operation),
        ContentType::Css => format_braced(&request.content, request.operation, indent),
        ContentType::Code => format_braced(&request.content, request.operation, indent),
        ContentType::Xml | ContentType::Html => {
            format_markup(&request.content, request.operation, indent)
        }
        _ => FormatResult {
            output: request.content.clone(),
            valid: false,
            diagnostics: vec![Diagnostic {
                message: "formatting is not supported for this content type yet".into(),
                line: None,
                column: None,
            }],
        },
    }
}

fn ok(output: String) -> FormatResult {
    FormatResult {
        output,
        valid: true,
        diagnostics: Vec::new(),
    }
}

fn invalid(content: &str, message: String, line: Option<u32>) -> FormatResult {
    FormatResult {
        output: content.to_string(),
        valid: false,
        diagnostics: vec![Diagnostic {
            message,
            line,
            column: None,
        }],
    }
}

const SQL_CLAUSES: &[&str] = &[
    "select", "from", "where", "inner join", "left join", "right join", "full join", "join",
    "group by", "order by", "having", "limit", "offset", "union", "insert into", "values",
    "update", "set", "delete from", "on conflict", "returning",
];

/// Deterministic SQL layout: uppercases clause keywords and starts each major
/// clause on its own line. Validation only checks balanced quotes/parens.
fn format_sql(content: &str, operation: FormatOperation) -> FormatResult {
    if let Some(line) = unbalanced_line(content, &[('(', ')')]) {
        return invalid(content, "unbalanced parentheses or quotes".into(), Some(line));
    }
    if operation == FormatOperation::Validate {
        return ok(content.to_string());
    }

    let collapsed = content.split_whitespace().collect::<Vec<_>>().join(" ");
    if operation == FormatOperation::Minify {
        return ok(collapsed);
    }

    let mut output = collapsed.clone();
    for clause in SQL_CLAUSES {
        let upper = clause.to_uppercase();
        let mut result = String::with_capacity(output.len());
        let mut rest = output.as_str();
        while let Some(position) = rest.to_lowercase().find(clause) {
            let boundary_before = position == 0
                || !rest.as_bytes()[position - 1].is_ascii_alphanumeric();
            let after = position + clause.len();
            let boundary_after = after >= rest.len()
                || !rest.as_bytes()[after].is_ascii_alphanumeric();
            result.push_str(&rest[..position]);
            if boundary_before && boundary_after {
                if !result.trim_end().is_empty() && position != 0 {
                    let trimmed = result.trim_end().to_string();
                    result = trimmed;
                    result.push('\n');
                }
                result.push_str(&upper);
            } else {
                result.push_str(&rest[position..after]);
            }
            rest = &rest[after..];
        }
        result.push_str(rest);
        output = result;
    }
    ok(output)
}

/// Brace-driven re-indentation for CSS and general C-style code. Content is
/// only reflowed at line granularity; tokens are never rewritten.
fn format_braced(content: &str, operation: FormatOperation, indent: usize) -> FormatResult {
    if let Some(line) = unbalanced_line(content, &[('{', '}'), ('(', ')'), ('[', ']')]) {
        return invalid(content, "unbalanced brackets".into(), Some(line));
    }
    if operation == FormatOperation::Validate {
        return ok(content.to_string());
    }
    if operation == FormatOperation::Minify {
        return ok(content
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>()
            .join(" "));
    }

    let mut depth: usize = 0;
    let mut lines = Vec::new();
    for raw in content.replace('{', "{\n").replace('}', "\n}\n").replace(';', ";\n").lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('}') {
            depth = depth.saturating_sub(1);
        }
        lines.push(format!("{}{line}", " ".repeat(depth * indent)));
        if line.ends_with('{') {
            depth += 1;
        }
    }
    ok(lines.join("\n"))
}

/// Tag-driven re-indentation for XML and HTML. Text and attribute content is
/// preserved verbatim; only inter-tag whitespace changes.
fn format_markup(content: &str, operation: FormatOperation, indent: usize) -> FormatResult {
    let opens = content.matches('<').count();
    let closes = content.matches('>').count();
    if opens != closes {
        return invalid(content, "unbalanced angle brackets".into(), None);
    }
    if operation == FormatOperation::Validate {
        return ok(content.to_string());
    }

    let mut segments = Vec::new();
    let mut rest = content;
    while let Some(start) = rest.find('<') {
        let before = rest[..start].trim();
        if !before.is_empty() {
            segments.push(before.to_string());
        }
        let Some(end) = rest[start..].find('>') else {
            break;
        };
        segments.push(rest[start..start + end + 1].to_string());
        rest = &rest[start + end + 1..];
    }
    let tail = rest.trim();
    if !tail.is_empty() {
        segments.push(tail.to_string());
    }

    if operation == FormatOperation::Minify {
        return ok(segments.join(""));
    }

    let mut depth: usize = 0;
    let mut lines = Vec::new();
    for segment in segments {
        let closing = segment.starts_with("</");
        let self_closing = segment.ends_with("/>")
            || segment.starts_with("<!")
            || segment.starts_with("<?")
            || !segment.starts_with('<');
        if closing {
            depth = depth.saturating_sub(1);
        }
        lines.push(format!("{}{segment}", " ".repeat(depth * indent)));
        if segment.starts_with('<') && !closing && !self_closing {
            depth += 1;
        }
    }
    ok(lines.join("\n"))
}

/// Returns the 1-based line of the first unbalanced bracket, ignoring
/// bracket characters inside single- or double-quoted strings.
fn unbalanced_line(content: &str, pairs: &[(char, char)]) -> Option<u32> {
    let mut stack: Vec<(char, u32)> = Vec::new();
    let mut line: u32 = 1;
    let mut quote: Option<char> = None;
    let mut escaped = false;
    for character in content.chars() {
        if character == '\n' {
            line += 1;
        }
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' {
            escaped = true;
            continue;
        }
        if let Some(open_quote) = quote {
            if character == open_quote {
                quote = None;
            }
            continue;
        }
        if character == '"' || character == '\'' {
            quote = Some(character);
            continue;
        }
        for (open, close) in pairs {
            if character == *open {
                stack.push((*open, line));
            } else if character == *close {
                match stack.pop() {
                    Some((last_open, _)) if last_open == *open => {}
                    _ => return Some(line),
                }
            }
        }
    }
    stack.first().map(|(_, opened_at)| *opened_at)
}

fn format_json(content: &str, operation: FormatOperation, indent: u32) -> FormatResult {
    let parsed: Result<serde_json::Value, serde_json::Error> = serde_json::from_str(content);
    match parsed {
        Err(error) => FormatResult {
            output: content.to_string(),
            valid: false,
            diagnostics: vec![Diagnostic {
                message: error.to_string(),
                line: Some(error.line() as u32),
                column: Some(error.column() as u32),
            }],
        },
        Ok(value) => {
            let output = match operation {
                FormatOperation::Validate => content.to_string(),
                FormatOperation::Minify => {
                    serde_json::to_string(&value).unwrap_or_else(|_| content.to_string())
                }
                FormatOperation::Pretty => {
                    let indent_bytes = vec![b' '; indent.clamp(1, 8) as usize];
                    let mut buffer = Vec::new();
                    let formatter =
                        serde_json::ser::PrettyFormatter::with_indent(&indent_bytes);
                    let mut serializer =
                        serde_json::Serializer::with_formatter(&mut buffer, formatter);
                    use serde::Serialize;
                    if value.serialize(&mut serializer).is_ok() {
                        String::from_utf8(buffer).unwrap_or_else(|_| content.to_string())
                    } else {
                        content.to_string()
                    }
                }
            };
            FormatResult {
                output,
                valid: true,
                diagnostics: Vec::new(),
            }
        }
    }
}

/// Run one Quick Paste transform over `content`. Every variant is a pure
/// function: nothing about the stored item changes, and on failure the
/// original is left alone and a [`TransformError`] is returned so the caller
/// can refuse to copy/paste.
pub fn apply_transform(content: &str, transform: Transform) -> Result<String, TransformError> {
    match transform {
        Transform::Trim => Ok(content.trim().to_string()),
        Transform::Lowercase => Ok(content.to_lowercase()),
        Transform::Uppercase => Ok(content.to_uppercase()),
        Transform::SortDedupeLines => Ok(sort_dedupe_lines(content)),
        Transform::JsonPretty => pretty_json(content),
        Transform::JsonMinify => minify_json(content),
        Transform::Base64Encode => Ok(base64_encode(content)),
        Transform::Base64Decode => base64_decode(content),
        Transform::UrlEncode => Ok(url_encode(content)),
        Transform::UrlDecode => url_decode(content),
    }
}

fn sort_dedupe_lines(content: &str) -> String {
    // Stable, so two equal lines keep their original order; a trailing newline
    // on the input is preserved so pasted blocks look the same.
    let trailing_newline = content.ends_with('\n');
    let mut lines: Vec<&str> = content.lines().collect();
    lines.sort();
    lines.dedup();
    let mut joined = lines.join("\n");
    if trailing_newline {
        joined.push('\n');
    }
    joined
}

fn pretty_json(content: &str) -> Result<String, TransformError> {
    let value: serde_json::Value = serde_json::from_str(content)
        .map_err(|error| TransformError::InvalidInput { message: error.to_string() })?;
    serde_json::to_string_pretty(&value)
        .map_err(|error| TransformError::InvalidInput { message: error.to_string() })
}

fn minify_json(content: &str) -> Result<String, TransformError> {
    let value: serde_json::Value = serde_json::from_str(content)
        .map_err(|error| TransformError::InvalidInput { message: error.to_string() })?;
    serde_json::to_string(&value)
        .map_err(|error| TransformError::InvalidInput { message: error.to_string() })
}

fn base64_encode(content: &str) -> String {
    BASE64_STANDARD.encode(content.as_bytes())
}

fn base64_decode(content: &str) -> Result<String, TransformError> {
    let bytes = BASE64_STANDARD
        .decode(content)
        .map_err(|error| TransformError::InvalidInput { message: error.to_string() })?;
    String::from_utf8(bytes)
        .map_err(|error| TransformError::InvalidInput { message: error.to_string() })
}

/// Percent-encode every byte outside the unreserved set defined by RFC 3986.
/// Operates on bytes, not Unicode scalar values, so multi-byte UTF-8 sequences
/// encode and decode symmetrically.
fn url_encode(content: &str) -> String {
    let mut encoded = String::with_capacity(content.len());
    for byte in content.as_bytes() {
        match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'~' => encoded.push(*byte as char),
            other => {
                encoded.push_str(&format!("%{:02X}", other));
            }
        }
    }
    encoded
}

fn url_decode(content: &str) -> Result<String, TransformError> {
    let bytes = content.as_bytes();
    let mut decoded: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                decoded.push(b' ');
                index += 1;
            }
            b'%' => {
                if index + 2 >= bytes.len() {
                    return Err(TransformError::InvalidInput {
                        message: "percent-encoded sequence is truncated".into(),
                    });
                }
                let hex = match std::str::from_utf8(&bytes[index + 1..index + 3]) {
                    Ok(text) => text,
                    Err(_) => {
                        return Err(TransformError::InvalidInput {
                            message: "percent-encoded bytes are not valid UTF-8".into(),
                        });
                    }
                };
                let value = u8::from_str_radix(hex, 16).map_err(|error| {
                    TransformError::InvalidInput { message: error.to_string() }
                })?;
                decoded.push(value);
                index += 3;
            }
            other => {
                decoded.push(other);
                index += 1;
            }
        }
    }
    String::from_utf8(decoded).map_err(|error| TransformError::InvalidInput { message: error.to_string() })
}

#[cfg(test)]
mod transform_tests {
    use super::*;

    #[test]
    fn trim_removes_leading_and_trailing_whitespace_only() {
        assert_eq!(apply_transform("  hello  ", Transform::Trim).unwrap(), "hello");
        assert_eq!(apply_transform("\n\nhi\n", Transform::Trim).unwrap(), "hi");
        // Inner whitespace is preserved.
        assert_eq!(
            apply_transform("  a  b  ", Transform::Trim).unwrap(),
            "a  b"
        );
    }

    #[test]
    fn lowercase_and_uppercase_cover_multibyte() {
        assert_eq!(
            apply_transform("Hello WORLD", Transform::Lowercase).unwrap(),
            "hello world"
        );
        assert_eq!(
            apply_transform("HeLLo WörLD", Transform::Uppercase).unwrap(),
            "HELLO WÖRLD"
        );
    }

    #[test]
    fn sort_dedupe_lines_is_stable_and_preserves_trailing_newline() {
        let input = "banana\napple\nbanana\ncherry\n";
        let expected = "apple\nbanana\ncherry\n";
        assert_eq!(
            apply_transform(input, Transform::SortDedupeLines).unwrap(),
            expected
        );
    }

    #[test]
    fn json_pretty_and_minify_round_trip() {
        let pretty = apply_transform("{\"a\":2,\"b\":1}", Transform::JsonPretty).unwrap();
        assert!(pretty.contains('\n'));
        let minified = apply_transform(&pretty, Transform::JsonMinify).unwrap();
        // `serde_json` preserves insertion order on a `Value::Object`, so the
        // round-trip is the original key order with no extra whitespace.
        assert_eq!(minified, "{\"a\":2,\"b\":1}");
    }

    #[test]
    fn json_pretty_rejects_invalid_input() {
        let error = apply_transform("{not json", Transform::JsonPretty).unwrap_err();
        assert!(matches!(error, TransformError::InvalidInput { .. }));
    }

    #[test]
    fn base64_round_trip() {
        let payload = "hello, world!";
        let encoded = apply_transform(payload, Transform::Base64Encode).unwrap();
        assert_eq!(encoded, "aGVsbG8sIHdvcmxkIQ==");
        assert_eq!(
            apply_transform(&encoded, Transform::Base64Decode).unwrap(),
            payload
        );
    }

    #[test]
    fn base64_decode_rejects_garbage() {
        let error = apply_transform("@@@not base64@@@", Transform::Base64Decode).unwrap_err();
        assert!(matches!(error, TransformError::InvalidInput { .. }));
    }

    #[test]
    fn url_round_trip_preserves_bytes() {
        let payload = "hello world! äöü/?#&=";
        let encoded = apply_transform(payload, Transform::UrlEncode).unwrap();
        // `url_decode` only restores ASCII bytes, so verify the encoded form
        // matches RFC 3986's reserved/unreserved rules and round-trips.
        assert_eq!(encoded, "hello%20world%21%20%C3%A4%C3%B6%C3%BC%2F%3F%23%26%3D");
        assert_eq!(
            apply_transform(&encoded, Transform::UrlDecode).unwrap(),
            payload
        );
    }

    #[test]
    fn url_decode_treats_plus_as_space() {
        assert_eq!(
            apply_transform("a+b", Transform::UrlDecode).unwrap(),
            "a b"
        );
    }

    #[test]
    fn url_decode_rejects_truncated_percent_sequence() {
        let error = apply_transform("abc%", Transform::UrlDecode).unwrap_err();
        assert!(matches!(error, TransformError::InvalidInput { .. }));
    }
}
