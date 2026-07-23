# Startup Update Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a launch-time signed-update prompt with install, later, and per-version skip actions.

**Architecture:** Keep the existing single update check and install state in `AppSidebar`. Render a focused Radix-based `UpdateAvailableModal` from that state, using local storage only for the skipped version and component state only for session dismissal.

**Tech Stack:** React 19, TypeScript, Radix Dialog, existing shadcn-style Button, Tauri updater commands, Bun tests.

## Global Constraints

- Quick Paste and hidden startup must not show the modal.
- **Later**, close, and Escape suppress only the current renderer session.
- **Skip this version** suppresses only the exact offered version.
- Settings manual update controls remain unchanged.
- No dependencies or updater backend changes.
- Use existing design tokens and accessible dialog primitives.

---

### Task 1: Startup update prompt

**Files:**
- Create: `src/app/components/UpdateAvailableModal.tsx`
- Modify: `src/app/components/AppSidebar.tsx`
- Modify: `src/app/components/AppSidebar.test.tsx`

**Interfaces:**
- Consumes: `UpdateInfo`, current version string, install state/error, and callbacks owned by `AppSidebar`.
- Produces: `UpdateAvailableModal({ currentVersion, update, installing, error, onInstall, onLater, onSkip })`.

- [ ] **Step 1: Add failing launch-modal behavior tests**

Extend `src/app/components/AppSidebar.test.tsx` with local-storage cleanup and tests equivalent to:

```tsx
test("offers an available update on launch and defers it until next launch", async () => {
  mockTauri((command) => {
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "check_for_update") {
      return { version: "0.2.0", notes: "Fixes and improvements", date: "2026-07-23" };
    }
  });

  const view = render(<AppSidebar />);
  expect(await screen.findByRole("dialog", { name: "Update available" })).toBeDefined();
  expect(screen.getByText("Fixes and improvements")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Later" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Update to v0.2.0" })).toBeDefined();

  view.unmount();
  render(<AppSidebar />);
  expect(await screen.findByRole("dialog", { name: "Update available" })).toBeDefined();
});

test("skips only the selected update version", async () => {
  let offered = "0.2.0";
  mockTauri((command) => {
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "check_for_update") return { version: offered, notes: null, date: null };
  });

  const view = render(<AppSidebar />);
  fireEvent.click(await screen.findByRole("button", { name: "Skip this version" }));
  view.unmount();
  render(<AppSidebar />);
  await screen.findByRole("button", { name: "Update to v0.2.0" });
  expect(screen.queryByRole("dialog")).toBeNull();

  offered = "0.3.0";
  view.unmount();
  render(<AppSidebar />);
  expect(await screen.findByRole("dialog", { name: "Update available" })).toBeDefined();
});
```

Also update the existing install test to click **Download & install**, and add a rejected `install_update` case asserting `role="alert"` remains inside the open modal.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```powershell
bun test src/app/components/AppSidebar.test.tsx
```

Expected: FAIL because no launch dialog or new actions exist.

- [ ] **Step 3: Create the focused modal**

Create `src/app/components/UpdateAvailableModal.tsx` with the existing dialog and button components:

```tsx
import type { UpdateInfo } from "../../api/types";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
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

export default function UpdateAvailableModal(props: Props) {
  const { currentVersion, update, installing, error, onInstall, onLater, onSkip } = props;
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !installing) onLater(); }}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[34rem] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle>Update available</DialogTitle>
          <DialogDescription>
            SnipDock v{currentVersion} → v{update.version}{update.date ? ` · ${update.date}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto rounded-md border border-border bg-muted p-4 text-sm">
          {update.notes || "This release has no additional notes."}
        </div>
        {error && <p role="alert" className="text-xs text-destructive">Update could not be installed. Try again.</p>}
        <DialogFooter className="sm:items-center">
          <Button type="button" variant="ghost" disabled={installing} onClick={onSkip}>Skip this version</Button>
          <Button type="button" variant="outline" disabled={installing} onClick={onLater}>Later</Button>
          <Button type="button" disabled={installing} onClick={onInstall}>
            {installing ? "Installing…" : "Download & install"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Connect session dismissal and per-version skip**

In `AppSidebar.tsx`, add:

```tsx
const SKIPPED_UPDATE_KEY = "snipdock.skippedUpdateVersion";
const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(null);

const showUpdateModal =
  availableUpdate !== null &&
  availableUpdate.version !== dismissedUpdate &&
  availableUpdate.version !== localStorage.getItem(SKIPPED_UPDATE_KEY);

function skipUpdate() {
  if (!availableUpdate) return;
  localStorage.setItem(SKIPPED_UPDATE_KEY, availableUpdate.version);
  setDismissedUpdate(availableUpdate.version);
}
```

Render `UpdateAvailableModal` when `showUpdateModal && currentVersion`, passing existing install state and `installUpdate`, plus:

```tsx
onLater={() => setDismissedUpdate(availableUpdate.version)}
onSkip={skipUpdate}
```

Keep the existing sidebar update button and error fallback. Do not add another update check.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
bun test src/app/components/AppSidebar.test.tsx
```

Expected: all `AppSidebar` tests PASS.

- [ ] **Step 6: Run regression checks**

Run:

```powershell
bun test
bun run build
```

Expected: all tests PASS; TypeScript and Vite production build succeed.

- [ ] **Step 7: Commit task-owned changes**

```powershell
git add -- src/app/components/UpdateAvailableModal.tsx src/app/components/AppSidebar.tsx src/app/components/AppSidebar.test.tsx docs/superpowers/plans/2026-07-23-startup-update-modal.md
git commit -m "Add startup update prompt"
```
