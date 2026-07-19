use crate::models::{Diagnostic, RenderTemplateRequest, RenderTemplateResult};
use std::collections::BTreeSet;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub fn render(request: &RenderTemplateRequest) -> RenderTemplateResult {
    let mut output = String::with_capacity(request.template.len());
    let mut missing = BTreeSet::new();
    let mut diagnostics = Vec::new();
    let mut rest = request.template.as_str();
    let mut offset = 0;

    while let Some(start) = rest.find("{{") {
        let absolute_start = offset + start;
        if absolute_start > 0 && request.template.as_bytes()[absolute_start - 1] == b'\\' {
            output.push_str(&rest[..start - 1]);
            output.push_str("{{");
            rest = &rest[start + 2..];
            offset = absolute_start + 2;
            continue;
        }

        output.push_str(&rest[..start]);
        let after_open = start + 2;
        let Some(end) = rest[after_open..].find("}}") else {
            diagnostics.push(diagnostic(
                "unclosed placeholder",
                &request.template,
                absolute_start,
            ));
            break;
        };

        let raw_name = &rest[after_open..after_open + end];
        let name = raw_name.trim();
        if name.is_empty() {
            diagnostics.push(diagnostic(
                "empty placeholder",
                &request.template,
                absolute_start,
            ));
        } else if !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        {
            diagnostics.push(diagnostic(
                "invalid placeholder name",
                &request.template,
                absolute_start,
            ));
        } else if let Some(value) = builtin(name).or_else(|| request.values.get(name).cloned()) {
            output.push_str(&value);
        } else {
            missing.insert(name.to_string());
        }

        rest = &rest[after_open + end + 2..];
        offset = absolute_start + end + 4;
    }

    output.push_str(rest);
    RenderTemplateResult {
        output: (missing.is_empty() && diagnostics.is_empty()).then_some(output),
        missing: missing.into_iter().collect(),
        diagnostics,
    }
}

fn builtin(name: &str) -> Option<String> {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_secs();
    match name {
        "date" => Some(format_date(seconds / 86_400)),
        "time" => Some(format_time(seconds % 86_400)),
        "uuid" => Some(Uuid::new_v4().to_string()),
        _ => None,
    }
}

fn format_time(seconds: u64) -> String {
    let hour = seconds / 3600;
    let minute = seconds % 3600 / 60;
    let second = seconds % 60;
    format!("{hour:02}:{minute:02}:{second:02}Z")
}

fn format_date(days: u64) -> String {
    let (year, month, day) = civil_from_days(days as i64);
    format!("{year:04}-{month:02}-{day:02}")
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    (y + i64::from(m <= 2), m as u32, d as u32)
}

fn diagnostic(message: &str, template: &str, offset: usize) -> Diagnostic {
    let mut line = 1;
    let mut column = 1;
    for character in template[..offset].chars() {
        if character == '\n' {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }
    Diagnostic {
        message: message.into(),
        line: Some(line),
        column: Some(column),
    }
}
