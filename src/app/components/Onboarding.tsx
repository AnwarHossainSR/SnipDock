import { useEffect, useRef, useState } from "react";
import { commands } from "../../api/commands";
import { Button } from "@/components/ui/button";
import { KeyCombo } from "@/components/ui/key-cap";
import { quickPasteShortcutHint } from "../../lib/shortcutHints";
import type { ShortcutOverrides } from "../../lib/shortcutHints";

/**
 * The three things a new install has to be told, and could not find out on its
 * own.
 *
 * Until now a fresh launch opened on "Your clipboard is quiet" and said
 * nothing: not that copying was already being recorded, not that Quick Paste
 * exists - it works while another application has focus, so it is
 * undiscoverable from inside this window - and not where to stop SnipDock
 * seeing a particular application. The README tells the privacy story; the app
 * never did.
 *
 * Completion is recorded in settings rather than in the webview's storage, so
 * it cannot come back on a machine that has already been set up.
 */

interface Step {
  eyebrow: string;
  title: string;
  body: string;
  /** Rendered under the body when the step is about a shortcut. */
  binding?: string | null;
  bindingLabel?: string;
}

function stepsFor(binding: string | null): Step[] {
  return [
    {
      eyebrow: "Step 1 of 3",
      title: "Everything you copy lands here",
      body:
        "SnipDock records your clipboard in the background and keeps it on this device. Nothing is uploaded, and there is no account. Pause recording any time from the tray or from the history header.",
    },
    {
      eyebrow: "Step 2 of 3",
      title: "Paste without leaving the keyboard",
      body:
        "Quick Paste opens over whatever application you are in, so you can search your history and paste straight back into it.",
      binding,
      bindingLabel: "from any application",
    },
    {
      eyebrow: "Step 3 of 3",
      title: "Some things are better not recorded",
      body:
        "Settings holds the controls: skip named applications, skip content that matches a pattern, and sweep anything that looks like a secret. Passwords and keys are detected and held back automatically.",
    },
  ];
}

export default function Onboarding({
  shortcutOverrides,
  onDone,
}: {
  shortcutOverrides?: ShortcutOverrides;
  /** Called once the introduction is finished or skipped, either way. */
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const steps = stepsFor(quickPasteShortcutHint(shortcutOverrides));
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    dialog.current?.focus();
  }, []);

  /**
   * Recording completion must never be the reason someone is stuck behind this
   * dialog, so a failed write still closes it. The cost of that is seeing the
   * introduction twice, which is a great deal better than not being able to
   * reach the application.
   */
  function finish() {
    void commands
      .saveSettings({ values: { onboarding_completed: true } })
      .catch(() => {});
    onDone();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      finish();
      return;
    }
    // A three-card sequence reads as something to page through, so the arrow
    // keys do what the buttons do.
    if (event.key === "ArrowRight" && !last) {
      event.preventDefault();
      setIndex(index + 1);
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      setIndex(index - 1);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid animate-[fade-in_140ms_ease-out] place-items-center bg-background/70 p-5 backdrop-blur-sm motion-reduce:animate-none">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="w-full max-w-md animate-[menu-in_160ms_ease-out] rounded-lg border border-border bg-card p-6 shadow-[var(--shadow-menu)] outline-none motion-reduce:animate-none"
      >
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
          {step.eyebrow}
        </p>
        <h2
          id="onboarding-title"
          className="m-0 font-display text-[1.35rem] font-semibold tracking-[-0.03em]"
        >
          {step.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
        {step.binding && (
          <p className="mt-4 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <KeyCombo binding={step.binding} className="shrink-0 flex-nowrap" />
            <span className="min-w-0">{step.bindingLabel}</span>
          </p>
        )}

        <div className="mt-6 flex items-center justify-between gap-4">
          {/* Decorative: the heading's "Step 2 of 3" is what carries position
              for anyone not looking at the dots. */}
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {steps.map((entry, dot) => (
              <span
                key={entry.title}
                className={
                  "h-1.5 rounded-full transition-all " +
                  (dot === index ? "w-5 bg-primary" : "w-1.5 bg-border")
                }
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!last && (
              <Button variant="ghost" size="sm" type="button" onClick={finish}>
                Skip
              </Button>
            )}
            {index > 0 && (
              <Button variant="outline" size="sm" type="button" onClick={() => setIndex(index - 1)}>
                Back
              </Button>
            )}
            <Button
              size="sm"
              type="button"
              autoFocus
              onClick={() => (last ? finish() : setIndex(index + 1))}
            >
              {last ? "Start using SnipDock" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
