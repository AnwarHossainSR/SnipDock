use std::collections::BTreeMap;

use snipdock_lib::{
    models::RenderTemplateRequest,
    templates::render,
};

#[test]
fn renders_placeholders_builtins_and_reports_missing_or_invalid() {
    let result = render(&RenderTemplateRequest {
        template: "Hello {{ name }} {{name}} \\{{literal}} {{date}} {{time}} {{uuid}}".into(),
        values: BTreeMap::from([("name".into(), "Ada".into())]),
    });

    let output = result.output.expect("all values exist");
    assert!(output.starts_with("Hello Ada Ada {{literal}} "));
    assert!(output.contains(&format!(" {}", current_utc_date())));
    assert!(output.contains(':'));
    assert!(output.split_whitespace().last().is_some_and(is_uuid));
    assert!(result.missing.is_empty());
    assert!(result.diagnostics.is_empty());

    let missing = render(&RenderTemplateRequest {
        template: "{{name}} {{missing}} {{ }} {{unclosed".into(),
        values: BTreeMap::from([("name".into(), "Ada".into())]),
    });

    assert_eq!(missing.output, None);
    assert_eq!(missing.missing, vec!["missing"]);
    assert_eq!(missing.diagnostics.len(), 2);
    assert!(missing.diagnostics[0].message.contains("empty placeholder"));
    assert!(missing.diagnostics[1].message.contains("unclosed placeholder"));
}

fn is_uuid(value: &str) -> bool {
    let parts: Vec<_> = value.split('-').collect();
    parts.len() == 5
        && [8, 4, 4, 4, 12]
            .iter()
            .zip(parts)
            .all(|(len, part)| part.len() == *len && part.chars().all(|c| c.is_ascii_hexdigit()))
}

fn current_utc_date() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock after unix epoch")
        .as_secs()
        / 86_400;
    let (year, month, day) = civil_from_days(now as i64);
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
