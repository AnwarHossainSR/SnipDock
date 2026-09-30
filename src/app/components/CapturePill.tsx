import { showSettingsSection } from "../../lib/settingsSection";
import { cn } from "@/lib/utils";

/**
 * The capture state and its switch, as one control: the pill says what is
 * happening and pressing it changes that. Its name leads with the visible
 * word, so what is read out matches what is seen.
 *
 * It sits in the top bar, so it is on screen from every page - capture is a
 * property of the app, not of the history view it used to live in.
 *
 * While storage is full the backend refuses every capture, so the pill stops
 * saying "Capturing" and leads to where space is made instead.
 */
export default function CapturePill({
  paused,
  busy = false,
  storageFull = false,
  onToggle,
}: {
  paused: boolean;
  busy?: boolean;
  storageFull?: boolean;
  onToggle: () => void;
}) {
  const stopped = storageFull && !paused;
  return (
    <>
      <button
        type="button"
        disabled={busy}
        title={stopped ? "Storage full, new copies are not saved. Open storage settings" : paused ? "Resume tracking" : "Pause tracking"}
        onClick={() => (stopped ? showSettingsSection("settings-storage") : onToggle())}
        className={cn(
          "inline-flex h-[34px] min-h-0 shrink-0 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-card pl-3 pr-3.5 text-[0.8rem] font-medium transition-colors duration-100 hover:bg-muted disabled:opacity-60",
          stopped ? "text-destructive" : paused ? "text-[var(--warning)]" : "text-[var(--success)]",
        )}
      >
        <span
          aria-hidden="true"
          className={cn("size-[7px] rounded-full bg-current", !paused && !stopped && "animate-[capture-pulse_2.2s_ease-in-out_infinite]")}
        />
        {stopped ? "Storage full" : paused ? "Paused" : "Capturing"}
        <span className="sr-only">
          {stopped ? ", open storage settings" : paused ? ", resume tracking" : ", pause tracking"}
        </span>
      </button>
      <span className="sr-only">
        {stopped ? "Capture stopped, storage full" : paused ? "Tracking paused" : "Tracking active"}
      </span>
    </>
  );
}
