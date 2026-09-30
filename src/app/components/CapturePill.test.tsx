import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, mock, test } from "bun:test";
import CapturePill from "./CapturePill";

beforeEach(() => {
  window.location.hash = "";
});

test("names what is happening and what pressing it does", () => {
  const onToggle = mock(() => {});
  const { rerender } = render(<CapturePill paused={false} onToggle={onToggle} />);
  expect(screen.getByText("Tracking active")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: /^Capturing.*pause tracking/ }));
  expect(onToggle).toHaveBeenCalledTimes(1);

  // Capture can be switched from the tray or from Settings, and App pushes the
  // new value down: the pill has to follow it rather than keep its own copy.
  rerender(<CapturePill paused onToggle={onToggle} />);
  expect(screen.getByText("Tracking paused")).toBeDefined();
  expect(screen.getByRole("button", { name: /^Paused.*resume tracking/ })).toBeDefined();
});

test("stops claiming to capture while storage is full, and leads to the limit", () => {
  const onToggle = mock(() => {});
  render(<CapturePill paused={false} storageFull onToggle={onToggle} />);

  expect(screen.getByText("Capture stopped, storage full")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: /^Storage full/ }));
  expect(window.location.hash).toBe("#settings");
  expect(onToggle).not.toHaveBeenCalled();
});

test("a paused session reads as paused, not stopped, when storage is full", () => {
  render(<CapturePill paused storageFull onToggle={() => {}} />);
  expect(screen.getByText("Tracking paused")).toBeDefined();
  expect(screen.queryByText("Storage full")).toBeNull();
});
