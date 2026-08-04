import { useState } from "react";
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

const AUTO_UPDATE_DISABLED_KEY = "snipdock.autoUpdateDisabled";

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
  const releaseUrl = `${GITHUB_URL}/releases/tag/v${update.version}`;
  const [dontShowAgain, setDontShowAgain] = useState(false);

  function handleLater() {
    if (dontShowAgain) {
      localStorage.setItem(AUTO_UPDATE_DISABLED_KEY, "true");
    }
    onLater();
  }

  function handleClose() {
    if (dontShowAgain) {
      localStorage.setItem(AUTO_UPDATE_DISABLED_KEY, "true");
    }
    onLater();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !installing) handleClose(); }}>
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
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            What's changed
          </p>
          <ChangelogView notes={update.notes} showCopyButton />
        </div>

        <div className="grid gap-3">
          {error && (
            <p role="alert" className="text-xs text-destructive">
              Update could not be installed. Try again.
            </p>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="dont-show-again"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              disabled={installing}
              className="size-3.5 rounded border-border"
            />
            <label htmlFor="dont-show-again" className="text-xs text-muted-foreground cursor-pointer">
              Don't notify me about updates
            </label>
          </div>
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
              <Button type="button" variant="outline" size="sm" disabled={installing} onClick={handleLater}>
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
