import { useState } from "react";

export type SecretKind =
  | "api_key"
  | "token"
  | "password"
  | "private_key"
  | "email"
  | "database_url";

export interface SecretFinding {
  kind: SecretKind;
  start: number;
  end: number;
}

const KIND_LABELS: Record<SecretKind, string> = {
  api_key: "API key",
  token: "token",
  password: "password",
  private_key: "private key",
  email: "email address",
  database_url: "database URL",
};

// Mirrors the Rust-side detection in src-tauri/src/detection.rs so previews
// can mask findings without a round trip. Masked values are display-only —
// stored raw content is never replaced.
const PATTERNS: Array<[SecretKind, RegExp]> = [
  [
    "private_key",
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----/g,
  ],
  [
    "api_key",
    /\b(?:sk|pk|rk)[-_](?:live|test|prod)?[-_]?[A-Za-z0-9]{16,}\b|\bAKIA[0-9A-Z]{16}\b|\bAIza[0-9A-Za-z_-]{35}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
  ],
  [
    "token",
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\bbearer\s+[A-Za-z0-9._~+/=-]{20,}/gi,
  ],
  ["password", /\b(?:password|passwd|pwd|secret)\b\s*[:=]\s*["']?[^\s"']{6,}/gi],
  [
    "database_url",
    /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s/@]+:[^\s@]+@[^\s]+/g,
  ],
  ["email", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g],
];

export function findSecrets(content: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const [kind, pattern] of PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (!findings.some((existing) => start < existing.end && existing.start < end)) {
        findings.push({ kind, start, end });
      }
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  }
  return findings.sort((a, b) => a.start - b.start);
}

export function maskValue(value: string): string {
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 4)}${"•".repeat(value.length - 6)}${value.slice(-2)}`;
}

export function maskContent(content: string, findings: SecretFinding[]): string {
  let output = "";
  let cursor = 0;
  for (const finding of findings) {
    output += content.slice(cursor, finding.start);
    output += maskValue(content.slice(finding.start, finding.end));
    cursor = finding.end;
  }
  return output + content.slice(cursor);
}

interface SensitivePreviewProps {
  content: string;
  busy?: boolean;
  /** Copies the stored raw content; only invoked after explicit confirmation. */
  onCopyRaw: () => void;
}

/**
 * Preview wrapper for content with detected sensitive values. Findings are
 * masked in the preview, listed by type, and raw copy requires an explicit
 * confirmation. Formatted copy is intentionally unavailable here — reshaping
 * secret-bearing content could leak values into logs or diff views.
 */
export default function SensitivePreview({ content, busy, onCopyRaw }: SensitivePreviewProps) {
  const [confirming, setConfirming] = useState(false);
  const findings = findSecrets(content);
  const kinds = [...new Set(findings.map((finding) => KIND_LABELS[finding.kind]))];

  if (findings.length === 0) {
    return <pre className="snippet-detail__content">{content}</pre>;
  }

  return (
    <section aria-label="Sensitive content preview">
      <p className="action-error" role="note">
        Contains sensitive content: {kinds.join(", ")}. Values are masked in this preview.
      </p>
      <pre className="snippet-detail__content">{maskContent(content, findings)}</pre>
      {confirming
        ? (
          <div className="confirm-actions">
            <p>Copy the raw value including {kinds.join(", ")}?</p>
            <button
              type="button"
              className="danger-button"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                onCopyRaw();
              }}
            >
              Copy raw content
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        )
        : (
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            Copy raw…
          </button>
        )}
    </section>
  );
}
