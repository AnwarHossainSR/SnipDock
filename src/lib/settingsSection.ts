/**
 * Opens Settings at one section - the command palette's "Settings › Privacy".
 *
 * The section is held here rather than in the hash: `#settings/privacy` is not
 * a destination the sidebar knows, so it would light up the wrong entry. The
 * page takes the request once its sections exist, which is after the settings
 * have loaded, not when the hash changes.
 */
const SECTION_EVENT = "snipdock:settings-section";

let requested: string | null = null;

export function showSettingsSection(id: string) {
  requested = id;
  if (window.location.hash === "#settings") window.dispatchEvent(new Event(SECTION_EVENT));
  else window.location.hash = "#settings";
}

/** The section asked for, once: a second read returns null. */
export function takeSettingsSection(): string | null {
  const id = requested;
  requested = null;
  return id;
}

/** Calls `onRequest` whenever a section is asked for while Settings is open. */
export function onSettingsSection(onRequest: () => void): () => void {
  window.addEventListener(SECTION_EVENT, onRequest);
  return () => window.removeEventListener(SECTION_EVENT, onRequest);
}
