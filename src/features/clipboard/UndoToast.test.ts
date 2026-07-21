import { expect, test } from "bun:test";
import { getUndoToastDuration } from "./UndoToast";

test("caps undo toast visibility at five seconds", () => {
  const now = Date.parse("2026-07-21T10:00:00.000Z");

  expect(getUndoToastDuration("2026-07-21T10:00:30.000Z", now)).toBe(5_000);
  expect(getUndoToastDuration("2026-07-21T10:00:02.000Z", now)).toBe(2_000);
  expect(getUndoToastDuration("invalid", now)).toBe(5_000);
});
