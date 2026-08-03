import type { UpdateInfo } from "../../api/types";
import { parseChangelog, getCategoryColor } from "../../lib/changelog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  currentVersion: string;
  update: UpdateInfo;
  installing: boolean;
  error: boolean;
  onInstall: () => void;
  onLater: () => void;
  onSkip: () => void;
}

export default function UpdateAvailableModal({
  currentVersion,
  update,
  installing,
  error,
  onInstall,
  onLater,
  onSkip,
}: Props) {
  const changelog = parseChangelog(update.notes);
  const releaseUrl = `https://github.com/AnwarHossainSR/SnipDock/releases/tag/v${update.version}`;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !installing) onLater(); }}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[34rem] grid-rows-[auto_minmax(0,1fr)_auto]">
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
        <DialogHeader>
          <DialogTitle>Update available</DialogTitle>
          <p className="font-mono text-xs text-muted-foreground">
            v{currentVersion} → v{update.version}{update.date ? ` · ${update.date}` : ""}
          </p>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto rounded-md border border-border bg-muted p-4 text-sm">
          {changelog.hasContent ? (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                What's changed
              </p>
              {changelog.sections.map((section) => (
                <div key={section.category}>
                  <p className={`text-xs font-semibold uppercase tracking-wider ${getCategoryColor(section.category)}`}>
                    {section.category}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {section.items.map((item, i) => (
                      <li key={i} className="text-sm text-muted-foreground pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-muted-foreground/50">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground whitespace-pre-wrap">
              {update.notes || "This release has no additional notes."}
            </p>
          )}
        </div>

        <div className="grid gap-3">
          {error && (
            <p role="alert" className="text-xs text-destructive">
              Update could not be installed. Try again.
            </p>
          )}
          <DialogFooter className="sm:items-center gap-2">
            <a
              href={releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
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
              <Button type="button" size="sm" disabled={installing} onClick={onInstall}>
                {installing ? "Installing…" : "Download & install"}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
