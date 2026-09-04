import type { UpdateInfo } from "../../api/types";
import { GITHUB_URL } from "../../lib/constants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ChangelogView from "./ChangelogView";

interface Props {
  currentVersion: string;
  update: UpdateInfo;
  installing: boolean;
  error: string;
  onInstall: () => void;
  onLater: () => void;
  onSkip: () => void;
}

/**
 * The only modal SnipDock raises on its own, and only when there is genuinely a
 * newer version to install.
 *
 * It deliberately has no "don't show this again" checkbox. The previous one
 * wrote a flag that nothing in the app visibly turned back on, so a stray click
 * could silence updates for good; turning notifications off now lives in
 * Settings → Updates, next to the switch that turns them back on.
 */
export default function UpdateAvailableModal({
  currentVersion,
  update,
  installing,
  error,
  onInstall,
  onLater,
  onSkip,
}: Props) {
  const releaseUrl = `${GITHUB_URL}/releases/tag/v${update.version}`;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !installing) onLater(); }}>
      <DialogContent className="grid max-h-[calc(100vh-3rem)] max-w-[34rem] grid-rows-[auto_minmax(0,1fr)_auto] gap-4">
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={installing}
            aria-label="Close update dialog"
            className="absolute right-3 top-3 text-muted-foreground"
          >
            <span aria-hidden="true">×</span>
          </Button>
        </DialogClose>
        <DialogHeader className="gap-1">
          <DialogTitle>Update available</DialogTitle>
          <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-xs text-muted-foreground">
            <span className="text-sm font-semibold text-foreground">SnipDock {update.version}</span>
            <span>
              from v{currentVersion}
              {update.date ? ` · ${update.date.slice(0, 10)}` : ""}
            </span>
          </p>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto rounded-md border border-border bg-muted p-4 text-sm">
          <p className="mb-3 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            What's changed
          </p>
          {update.notes && update.notes.trim() ? (
            <ChangelogView notes={update.notes} showCopyButton />
          ) : (
            // An empty release body used to hide this dialog and the sidebar
            // button with it, which left the update unofferable. Say so instead.
            <p className="m-0 text-sm text-muted-foreground">
              No release notes were published for this version.{" "}
              <a
                className="text-muted-foreground underline underline-offset-2 hover:text-primary"
                href={releaseUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open the release on GitHub
              </a>
              .
            </p>
          )}
        </div>

        <div className="grid gap-3">
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Your clipboard history is backed up before the update is installed.
          </p>
          <DialogFooter className="gap-2 sm:items-center">
            <a
              href={releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Release notes
            </a>
            <div className="flex gap-2 sm:ml-auto">
              <Button type="button" variant="ghost" size="sm" disabled={installing} onClick={onSkip}>
                Skip this version
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={installing} onClick={onLater}>
                Later
              </Button>
              <Button type="button" size="sm" autoFocus disabled={installing} onClick={onInstall}>
                {installing ? "Installing…" : "Install now"}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
