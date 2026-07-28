import { renderHook, act } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { useClipboardSelection } from "./useClipboardSelection";

const mockItems = [
  { id: "1", content: "a" },
  { id: "2", content: "b" },
  { id: "3", content: "c" },
] as any[];

describe("useClipboardSelection", () => {
  test("toggleItemSelect adds and removes items", () => {
    const { result } = renderHook(() => useClipboardSelection(mockItems));

    act(() => result.current.toggleItemSelect("1"));
    expect(result.current.selectedIds.has("1")).toBe(true);
    expect(result.current.multiSelectMode).toBe(true);

    act(() => result.current.toggleItemSelect("1"));
    expect(result.current.selectedIds.has("1")).toBe(false);
  });

  test("selectAll selects all items", () => {
    const { result } = renderHook(() => useClipboardSelection(mockItems));

    act(() => result.current.selectAll());
    expect(result.current.selectedIds.size).toBe(3);
  });

  test("clearSelection clears all", () => {
    const { result } = renderHook(() => useClipboardSelection(mockItems));

    act(() => result.current.selectAll());
    expect(result.current.selectedIds.size).toBe(3);

    act(() => result.current.clearSelection());
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.multiSelectMode).toBe(false);
  });

  test("selectSingle selects only one item", () => {
    const { result } = renderHook(() => useClipboardSelection(mockItems));

    act(() => result.current.selectSingle("1"));
    expect(result.current.selectedIds.size).toBe(1);
    expect(result.current.selectedIds.has("1")).toBe(true);

    act(() => result.current.selectSingle("2"));
    expect(result.current.selectedIds.size).toBe(1);
    expect(result.current.selectedIds.has("2")).toBe(true);
    expect(result.current.selectedIds.has("1")).toBe(false);
  });
});
