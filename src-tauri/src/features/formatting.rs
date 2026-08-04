use crate::models::{ContentType, Diagnostic, FormatOperation, FormatRequest, FormatResult, PasteFormat};

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
    let mut text = content.replace('\n', "\n");
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
