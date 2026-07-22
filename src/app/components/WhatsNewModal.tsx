import type { ReleaseNote } from "../../api/releaseNotes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function WhatsNewModal({
  note,
  onClose,
}: {
  note: ReleaseNote;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[calc(100vh-4rem)] max-w-[30rem] overflow-y-auto">
        <DialogHeader>
          <DialogDescription className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-primary">
            What's new
          </DialogDescription>
          <DialogTitle>Updated to SnipDock v{note.version}</DialogTitle>
        </DialogHeader>
        <ul className="grid list-disc gap-2 pl-4 text-[0.82rem] text-muted-foreground">
          {note.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" autoFocus onClick={onClose}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
