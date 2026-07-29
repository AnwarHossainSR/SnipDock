import { useCallback, useState } from "react";

export function useAsyncOperation<T>(fn: () => Promise<T>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Operation failed";
      setError(message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [fn]);

  const clearError = useCallback(() => setError(null), []);

  return { run, busy, error, clearError };
}
