import { useCallback, useState } from "react";
import type { KeyboardEvent } from "react";
import type { LibraryItem } from "../api/types";

export function useClipboardSelection(items: LibraryItem[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [multiSelectMode, setMultiSelectMode] = useState(false);

  const toggleItemSelect = useCallback((id: string) => {
    setSelectedIds((current) => {
      const newSet = new Set(current);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
    setMultiSelectMode(true);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((item) => item.id)));
    setMultiSelectMode(true);
  }, [items]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setMultiSelectMode(false);
  }, []);

  const selectSingle = useCallback((id: string) => {
    setSelectedIds(new Set([id]));
  }, []);

  const handleKeyboardNav = useCallback(
    (
      event: KeyboardEvent<HTMLDivElement>,
      currentIndex: number,
      onDeleteSelected: () => void,
    ) => {
      if (event.key === "a" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        selectAll();
        return true;
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedIds.size > 0
      ) {
        event.preventDefault();
        onDeleteSelected();
        return true;
      }
      if (event.key === "Escape" && selectedIds.size > 0) {
        event.preventDefault();
        clearSelection();
        return true;
      }
      if (event.key === " " && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        const item = items[currentIndex];
        if (item) toggleItemSelect(item.id);
        return true;
      }
      return false;
    },
    [items, selectedIds.size, selectAll, clearSelection, toggleItemSelect],
  );

  return {
    selectedIds,
    multiSelectMode,
    setMultiSelectMode,
    toggleItemSelect,
    selectSingle,
    selectAll,
    clearSelection,
    handleKeyboardNav,
  };
}
