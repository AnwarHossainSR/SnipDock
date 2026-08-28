import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { mockTauri } from "../../test/setup";
import ImageBulkBar from "./ImageBulkBar";

const images = [
  { id: "big", bytes: 4_194_304, created_at: "2026-08-01T00:00:00.000Z" },
  { id: "small", bytes: 51_200, created_at: "2026-08-20T00:00:00.000Z" },
];

function mockImages(overrides: { largest?: unknown } = {}) {
  mockTauri((command) => {
    if (command === "get_storage_size") {
      return { db_bytes: 1_000, images_bytes: 4_245_504, total_bytes: 4_246_504 };
    }
    if (command === "largest_images") return overrides.largest ?? images;
    return undefined;
  });
}

describe("ImageBulkBar", () => {
  test("shows how much room the stored images take", async () => {
    mockImages();
    render(<ImageBulkBar busy={false} onDelete={async () => {}} />);

    expect(await screen.findByText("4.0 MB")).toBeDefined();
  });

  test("lists the largest images with their sizes on request", async () => {
    mockImages();
    render(<ImageBulkBar busy={false} onDelete={async () => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Review largest" }));

    const list = await screen.findByRole("list", { name: "Largest images" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    expect(within(list).getByText("4.0 MB")).toBeDefined();
    expect(within(list).getByText("50 KB")).toBeDefined();
  });

  test("deletes only the images that were ticked", async () => {
    const deleted: string[][] = [];
    mockImages();
    render(<ImageBulkBar busy={false} onDelete={async (ids) => void deleted.push(ids)} />);

    fireEvent.click(screen.getByRole("button", { name: "Review largest" }));
    const boxes = await screen.findAllByRole("checkbox");
    fireEvent.click(boxes[0]);

    expect(screen.getByText(/Frees 4\.0 MB/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Delete 1 image" }));

    await waitFor(() => expect(deleted).toEqual([["big"]]));
    // The deleted row leaves the list rather than lingering as a stale size.
    await waitFor(() =>
      expect(screen.getByRole("list", { name: "Largest images" }).querySelectorAll("li")).toHaveLength(1),
    );
  });

  test("says so when nothing is stored", async () => {
    mockImages({ largest: [] });
    render(<ImageBulkBar busy={false} onDelete={async () => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Review largest" }));

    expect(await screen.findByText("No images are stored.")).toBeDefined();
  });

  test("reports a failed measurement instead of an empty list", async () => {
    mockTauri((command) => {
      if (command === "get_storage_size") {
        return { db_bytes: 0, images_bytes: 0, total_bytes: 0 };
      }
      if (command === "largest_images") throw new Error("permission denied");
      return undefined;
    });
    render(<ImageBulkBar busy={false} onDelete={async () => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Review largest" }));

    expect((await screen.findByRole("alert")).textContent).toBe("permission denied");
  });
});
