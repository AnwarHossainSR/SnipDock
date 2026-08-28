import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { Pagination, pageRangeLabel, paginationRange } from "./pagination";

describe("paginationRange", () => {
  it("lists every page while they all fit", () => {
    expect(paginationRange(3, 6)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("keeps the first and last page reachable from the middle", () => {
    expect(paginationRange(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
  });

  it("holds the window at three numbers wide at either end", () => {
    expect(paginationRange(1, 10)).toEqual([1, 2, 3, 4, null, 10]);
    expect(paginationRange(10, 10)).toEqual([1, null, 7, 8, 9, 10]);
  });
});

describe("pageRangeLabel", () => {
  it("reports the rows actually on screen, not the page size", () => {
    // The last page is short: it must not claim 241-270 of 265.
    expect(pageRangeLabel(9, 30, 265, 25, ["item", "items"])).toBe("241–265 of 265 items");
  });

  it("uses the singular for a lone result", () => {
    expect(pageRangeLabel(1, 30, 1, 1, ["item", "items"])).toBe("1–1 of 1 item");
  });

  it("says so when there is nothing to page through", () => {
    expect(pageRangeLabel(1, 30, 0, 0, ["result", "results"])).toBe("No results");
  });
});

describe("Pagination", () => {
  it("moves by one page and jumps to a numbered page", () => {
    const visited: number[] = [];
    render(
      <Pagination page={2} pageSize={30} total={265} count={30} onPageChange={(page) => visited.push(page)} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.click(screen.getByRole("button", { name: "Page 9" }));

    expect(visited).toEqual([1, 3, 9]);
  });

  it("marks the current page and stops at both ends", () => {
    const { rerender } = render(
      <Pagination page={1} pageSize={30} total={60} count={30} onPageChange={() => {}} />,
    );

    expect(screen.getByRole("button", { name: "Page 1" }).getAttribute("aria-current")).toBe("page");
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(false);

    rerender(<Pagination page={2} pageSize={30} total={60} count={30} onPageChange={() => {}} />);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers rows per page only when a handler is supplied", () => {
    const sizes: number[] = [];
    const { rerender } = render(
      <Pagination page={1} pageSize={30} total={60} count={30} onPageChange={() => {}} />,
    );
    expect(screen.queryByRole("group", { name: "Rows per page" })).toBeNull();

    rerender(
      <Pagination
        page={1}
        pageSize={50}
        total={100}
        count={50}
        pageSizes={[25, 50]}
        onPageChange={() => {}}
        onPageSizeChange={(size) => sizes.push(size)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "25 rows per page" }));

    expect(sizes).toEqual([25]);
    expect(screen.getByRole("button", { name: "50 rows per page" }).getAttribute("aria-pressed")).toBe("true");
  });
});
