import { useEffect, useState } from "react";
import { commands } from "../../api/commands";
import type { ContentTypeCount, MostUsedItem, UsageAnalytics } from "../../api/types";
import { Button } from "@/components/ui/button";
import { SettingRow, SettingSection } from "@/components/ui/setting-section";
import { contentTypeLabel } from "../../lib/contentTypeColors";
import { formatBytes } from "../../lib/formatBytes";
import { formatDate } from "../../lib/relativeTime";

function titleOf(item: MostUsedItem): string {
  const title = item.title?.trim();
  if (title) return title;
  return item.content_type === "image" ? "Captured image" : "Untitled capture";
}

/** One measure, so one hue: the bar carries magnitude, the text carries identity. */
function TypeBar({ entry, largest }: { entry: ContentTypeCount; largest: number }) {
  const share = largest > 0 ? Math.max(entry.count / largest, 0.02) : 0;
  return (
    <li className="grid gap-1">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-xs font-semibold text-foreground">{contentTypeLabel(entry.content_type)}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{entry.count}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${(share * 100).toFixed(1)}%` }}
        />
      </div>
    </li>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid gap-0.5 rounded-sm border border-border bg-muted px-3 py-2.5">
      <span className="text-[0.68rem] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {label}
      </span>
      <span className="font-mono text-lg tabular-nums leading-tight text-foreground">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export default function AnalyticsPanel({ className }: { className?: string }) {
  const [analytics, setAnalytics] = useState<UsageAnalytics | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setError("");
    try {
      setAnalytics(await commands.getAnalytics());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Usage could not be read.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const byType = (analytics?.items_by_content_type ?? []).filter((entry) => entry.count > 0);
  const largest = byType.reduce((max, entry) => Math.max(max, entry.count), 0);
  const mostUsed = (analytics?.most_used_items ?? []).slice(0, 5);

  return (
    <SettingSection
      className={className}
      title="What you keep and reuse"
      titleId="settings-analytics"
      description="Counted from your own history. Nothing here leaves this computer."
      tone="var(--type-image)"
      icon={
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]">
          <path d="M5 19V11M12 19V5M19 19v-6" />
        </svg>
      }
      action={
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void load()}>
          {busy ? "Reading…" : "Refresh"}
        </Button>
      }
    >
      {error && (
        <SettingRow>
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        </SettingRow>
      )}

      {analytics && (
        <>
          <SettingRow>
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="Captures" value={analytics.total_items.toLocaleString()} />
              <Stat
                label="Copies made"
                value={analytics.total_copies.toLocaleString()}
                hint={
                  analytics.total_items > 0
                    ? `${(analytics.total_copies / analytics.total_items).toFixed(1)} per capture`
                    : undefined
                }
              />
              <Stat label="Text stored" value={formatBytes(analytics.storage_used_bytes)} hint="Images not counted" />
            </div>
          </SettingRow>

          {byType.length > 0 && (
            <SettingRow title="Captures by type">
              <ul className="grid gap-2.5">
                {byType.map((entry) => (
                  <TypeBar key={entry.content_type} entry={entry} largest={largest} />
                ))}
              </ul>
            </SettingRow>
          )}

          {mostUsed.length > 0 && (
            <SettingRow title="Copied most often">
              <ul className="grid gap-1">
                {mostUsed.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-foreground">{titleOf(item)}</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {item.usage_count}× · {formatDate(item.last_used_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </SettingRow>
          )}

          {analytics.total_items === 0 && (
            <SettingRow>
              <p className="m-0 text-sm text-muted-foreground">
                Nothing captured yet, so there is nothing to count.
              </p>
            </SettingRow>
          )}
        </>
      )}
    </SettingSection>
  );
}
