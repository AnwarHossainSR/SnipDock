import type { UpdateInfo } from "../../api/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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
          <DialogDescription className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-primary">
            SnipDock update
          </DialogDescription>
          <DialogTitle>Update available</DialogTitle>
          <p className="font-mono text-xs text-muted-foreground">
            v{currentVersion} → v{update.version}{update.date ? ` · ${update.date}` : ""}
          </p>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto rounded-md border border-border bg-muted p-4 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {update.notes || "This release has no additional notes."}
        </div>

        <div className="grid gap-3">
          {error && (
            <p role="alert" className="text-xs text-destructive">
              Update could not be installed. Try again.
            </p>
          )}
          <DialogFooter className="sm:items-center">
            <Button type="button" variant="ghost" disabled={installing} onClick={onSkip}>
              Skip this version
            </Button>
            <Button type="button" variant="outline" disabled={installing} onClick={onLater}>
              Later
            </Button>
            <Button type="button" disabled={installing} onClick={onInstall}>
              {installing ? "Installing…" : "Download & install"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
