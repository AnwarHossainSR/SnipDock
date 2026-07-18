use crate::models::{ContentType, Diagnostic, FormatOperation, FormatRequest, FormatResult};

/// Formats or validates `request.content` without ever mutating the input:
/// on any error the original content is returned unchanged alongside
/// line/column diagnostics.
pub fn format(request: &FormatRequest, indent: u32) -> FormatResult {
    match request.content_type {
        ContentType::Json => format_json(&request.content, request.operation, indent),
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
