use crate::models::ContentType;

/// Deterministic detection of a snippet's content type and, when the type is
/// code, its probable language. Raw content is never modified — callers store
/// the original text alongside the detected metadata.
pub fn detect(content: &str) -> (ContentType, Option<String>) {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return (ContentType::PlainText, None);
    }

    if is_json(trimmed) {
        return (ContentType::Json, None);
    }
    if is_xml_or_html(trimmed) {
        return if is_html(trimmed) {
            (ContentType::Html, None)
        } else {
            (ContentType::Xml, None)
        };
    }
    if is_css(trimmed) {
        return (ContentType::Css, None);
    }
    if is_sql(trimmed) {
        return (ContentType::Sql, None);
    }
    if is_shell(trimmed) {
        return (ContentType::Shell, None);
    }
    if is_markdown(trimmed) {
        return (ContentType::Markdown, None);
    }
    if is_config(trimmed) {
        return (ContentType::Config, None);
    }
    if let Some(language) = detect_code_language(trimmed) {
        return (ContentType::Code, Some(language.to_string()));
    }

    (ContentType::PlainText, None)
}

fn is_json(text: &str) -> bool {
    let looks_like = (text.starts_with('{') && text.ends_with('}'))
        || (text.starts_with('[') && text.ends_with(']'));
    looks_like && serde_json::from_str::<serde_json::Value>(text).is_ok()
}

fn is_xml_or_html(text: &str) -> bool {
    text.starts_with('<') && text.ends_with('>') && text.contains("</") || text.starts_with("<?xml")
}

fn is_html(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    ["<!doctype html", "<html", "<body", "<div", "<span", "<p>", "<a ", "<head"]
        .iter()
        .any(|tag| lower.contains(tag))
}

fn is_css(text: &str) -> bool {
    if !text.contains('{') || !text.contains('}') || text.contains("</") {
        return false;
    }
    let inside = text
        .split('{')
        .nth(1)
        .and_then(|rest| rest.split('}').next())
        .unwrap_or("");
    inside.contains(':')
        && inside.contains(';')
        && !inside.contains("=>")
        && !text.contains("function")
        && !text.contains("fn ")
}

fn is_sql(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    let starts = [
        "select ", "insert ", "update ", "delete ", "create table", "create index", "alter table",
        "drop table", "with ",
    ];
    starts.iter().any(|prefix| lower.starts_with(prefix))
        && (lower.contains(" from ")
            || lower.contains(" into ")
            || lower.contains(" set ")
            || lower.contains(" table")
            || lower.contains(" values"))
}

fn is_shell(text: &str) -> bool {
    if text.starts_with("#!/") {
        return true;
    }
    let lower = text.to_ascii_lowercase();
    let commands = [
        "sudo ", "apt ", "apt-get ", "yum ", "brew ", "git ", "curl ", "wget ", "docker ",
        "kubectl ", "npm ", "yarn ", "bun ", "cargo ", "cd ", "ls ", "mkdir ", "rm ", "cp ",
        "mv ", "chmod ", "chown ", "echo ", "export ", "grep ", "ssh ", "scp ",
    ];
    text.lines().count() <= 20
        && text
            .lines()
            .filter(|line| !line.trim().is_empty() && !line.trim_start().starts_with('#'))
            .all(|line| {
                let line = lower[text.find(line.trim_start()).unwrap_or(0)..].to_string();
                commands.iter().any(|command| line.starts_with(command))
                    || line.starts_with("./")
                    || line.starts_with("$ ")
            })
        && commands.iter().any(|command| lower.starts_with(command) || lower.contains(&format!("\n{command}")))
}

fn is_markdown(text: &str) -> bool {
    let markers = text
        .lines()
        .filter(|line| {
            let line = line.trim_start();
            line.starts_with("# ")
                || line.starts_with("## ")
                || line.starts_with("### ")
                || line.starts_with("- [ ]")
                || line.starts_with("- [x]")
                || line.starts_with("```")
                || line.starts_with("> ")
                || (line.starts_with("[") && line.contains("](") && line.contains(')'))
        })
        .count();
    markers >= 2 || (markers >= 1 && text.lines().count() <= 3)
}

fn is_config(text: &str) -> bool {
    let lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#') && !line.starts_with(';'))
        .collect();
    if lines.is_empty() {
        return false;
    }
    let ini_like = lines.iter().all(|line| {
        (line.starts_with('[') && line.ends_with(']'))
            || (line.contains('=') && !line.contains("==") && !line.ends_with(';'))
    });
    let env_like = lines.iter().all(|line| {
        line.split('=').next().is_some_and(|key| {
            !key.is_empty()
                && key
                    .chars()
                    .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
        }) && line.contains('=')
    });
    let yaml_like = lines.len() >= 2
        && lines.iter().all(|line| {
            line.starts_with("- ")
                || (line.contains(": ") || line.ends_with(':'))
                    && !line.contains('{')
                    && !line.contains(';')
        });
    ini_like || env_like || yaml_like
}

fn detect_code_language(text: &str) -> Option<&'static str> {
    let scored = [
        ("rust", rust_score(text)),
        ("typescript", typescript_score(text)),
        ("javascript", javascript_score(text)),
        ("python", python_score(text)),
    ];
    scored
        .into_iter()
        .filter(|(_, score)| *score >= 2)
        .max_by_key(|(_, score)| *score)
        .map(|(language, _)| language)
}

fn rust_score(text: &str) -> u32 {
    let mut score = 0;
    for marker in ["fn ", "let mut ", "impl ", "pub fn", "-> ", "match ", "::", "&str", "println!"] {
        if text.contains(marker) {
            score += 1;
        }
    }
    if text.contains("fn ") && text.contains("::") {
        score += 1;
    }
    score
}

fn typescript_score(text: &str) -> u32 {
    let mut score = 0;
    for marker in [": string", ": number", ": boolean", "interface ", "type ", "as const", "readonly "] {
        if text.contains(marker) {
            score += 1;
        }
    }
    if javascript_score(text) >= 2 && score >= 1 {
        score += 2;
    }
    score
}

fn javascript_score(text: &str) -> u32 {
    let mut score = 0;
    for marker in [
        "function ", "const ", "let ", "=> ", "console.log", "async ", "await ", "import ",
        "export ",
    ] {
        if text.contains(marker) {
            score += 1;
        }
    }
    score
}

fn python_score(text: &str) -> u32 {
    let mut score = 0;
    for marker in ["def ", "import ", "self.", "elif ", "lambda ", "print(", "__init__", "None"] {
        if text.contains(marker) {
            score += 1;
        }
    }
    if text.contains("def ") && text.contains(':') {
        score += 1;
    }
    score
}
