import { renderHook, act } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { useAsyncOperation } from "./useAsyncOperation";

describe("useAsyncOperation", () => {
  test("runs async function and tracks busy state", async () => {
    let resolve!: (value: string) => void;
    const fn = () => new Promise<string>((r) => (resolve = r));
    const { result } = renderHook(() => useAsyncOperation(fn));

    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();

    let promise: Promise<string | undefined>;
    act(() => {
      promise = result.current.run();
    });

    expect(result.current.busy).toBe(true);

    await act(async () => {
      resolve("done");
      await promise;
    });

    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test("captures error message", async () => {
    const fn = () => Promise.reject(new Error("fail"));
    const { result } = renderHook(() => useAsyncOperation(fn));

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.error).toBe("fail");
    expect(result.current.busy).toBe(false);
  });

  test("clearError resets error", async () => {
    const fn = () => Promise.reject(new Error("fail"));
    const { result } = renderHook(() => useAsyncOperation(fn));

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.error).toBe("fail");

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });
});
