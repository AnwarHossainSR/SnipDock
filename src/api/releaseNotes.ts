// Curated "What's New" highlights shown in-app after an update installs.
// Keep this in step with CHANGELOG.md: when you cut a release, add an entry
// whose `version` matches the app version so the release surfaces a modal on
// first launch. Omitting a version simply means no modal for that release.

export interface ReleaseNote {
  version: string;
  highlights: string[];
}

export const releaseNotes: ReleaseNote[] = [
  {
    version: "0.1.4",
    highlights: [
      "Quick Paste now stays hidden until its shortcut is pressed and closes correctly with Escape.",
    ],
  },
  {
    version: "0.1.3",
    highlights: [
      "Quick Paste opens searchable clipboard history and pastes into the previously focused application.",
      "Encrypted backups now preserve the complete database with transactional restore and import safeguards.",
      "Clipboard shortcuts, startup tracking state, and Windows backup recovery are more reliable.",
    ],
  },
  {
    version: "0.1.2",
    highlights: [
      "Tailwind CSS v4 and shadcn/ui now power the complete interface.",
      "Feature screens keep the same keyboard and screen-reader behavior with a smaller CSS bundle.",
      "Linux release builds now include the required app-indicator dependency.",
    ],
  },
  {
    version: "0.1.1",
    highlights: [
      "Signed installers for macOS (.dmg) and Linux (.deb/.AppImage) alongside Windows.",
      "Encrypted sync foundation: records are sealed on-device and staged for cross-device sync.",
      "Settings → Updates panel to review release notes and install signed updates.",
      "\"What's new\" highlights now appear right after an update installs.",
      "Fixed the sidebar Update button so available updates are offered again.",
    ],
  },
  {
    version: "0.1.0",
    highlights: [
      "Clipboard history with capture policies, retention, clear, and undo.",
      "Reusable snippets, commands, notes, and templates with projects, categories, and tags.",
      "Global full-text search plus Clipboard and Library filters.",
      "Offline developer tools: encoding, generators, text, data, regex, cron, Markdown, and diff.",
      "Import, export, backup, and restore.",
      "Sensitive-content detection and private-item safeguards.",
      "System tray, global shortcuts, and direct paste.",
      "Signed application updates via GitHub Releases.",
    ],
  },
];

/** Returns the curated highlights for `version`, or `undefined` if none. */
export function releaseNotesFor(version: string): ReleaseNote | undefined {
  return releaseNotes.find((note) => note.version === version);
}

/**
 * Decides which release note, if any, to show on launch. Nothing is shown on a
 * first-ever run (no recorded version) or when the version is unchanged; a note
 * appears only when the running version differs from the last-seen one and has
 * curated highlights.
 */
export function whatsNewToShow(current: string, seen: string | null): ReleaseNote | null {
  if (!seen || seen === current) return null;
  return releaseNotesFor(current) ?? null;
}
