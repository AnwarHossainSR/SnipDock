import { create } from "zustand";
import { commands } from "../api/commands";
import type { StorageSize } from "../api/types";

/** Share of the limit at which the status strip starts warning. */
export const STORAGE_WARNING_RATIO = 0.75;

export type StorageLevel = "ok" | "warning" | "full";

export function storageLevel(size: StorageSize): StorageLevel {
  if (size.full) return "full";
  if (size.limit_bytes > 0 && size.total_bytes >= size.limit_bytes * STORAGE_WARNING_RATIO) {
    return "warning";
  }
  return "ok";
}

/** Whole percent of the limit in use, capped at 100. */
export function storagePercent(size: StorageSize): number {
  if (size.limit_bytes <= 0) return 0;
  return Math.min(100, Math.round((size.total_bytes / size.limit_bytes) * 100));
}

interface StorageState {
  size: StorageSize | null;
  refresh: () => Promise<void>;
}

let latestRequest = 0;

/**
 * One reading shared by every surface that shows it - the status strip meter, the
 * capture pill, Settings - so they cannot disagree about whether capture has
 * stopped.
 */
export const useStorageStore = create<StorageState>()((set) => ({
  size: null,
  refresh: async () => {
    const request = ++latestRequest;
    try {
      const size = await commands.getStorageSize();
      if (request === latestRequest && size) set({ size });
    } catch {
      // Keep the last reading; the next library change retries.
    }
  },
}));
