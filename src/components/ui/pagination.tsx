import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The page numbers to render, with `null` standing for an elided run. The
 * first and last page are always present so the ends of the list stay one
 * click away, and the window around the current page is always three numbers
 * wide, including at the ends where it would otherwise collapse to two.
 */
export function paginationRange(page: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const first = 1;
  const last = totalPages;
  const start = Math.min(Math.max(page - 1, first + 1), last - 3);
  const end = Math.max(Math.min(page + 1, last - 1), first + 3);

  const pages: (number | null)[] = [first];
  if (start > first + 1) pages.push(null);
  for (let value = start; value <= end; value += 1) pages.push(value);
  if (end < last - 1) pages.push(null);
  pages.push(last);
  return pages;
}

/**
 * `31–60 of 265 items`, or `No items` when there is nothing to page through.
 * The end of the range comes from `count`, the rows actually on screen, so the
 * readout can never claim more rows than the page is showing.
 */
export function pageRangeLabel(
  page: number,
  pageSize: number,
  total: number,
  count: number,
  noun: readonly [string, string],
): string {
  if (total === 0 || count === 0) return `No ${noun[1]}`;
  const first = (page - 1) * pageSize + 1;
  const last = first + count - 1;
  return `${first}–${last} of ${total} ${total === 1 ? noun[0] : noun[1]}`;
}

const arrow = "size-3.5 shrink-0 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]";

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={arrow}>
      <path d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  /** Rows rendered on the current page, used for the range readout. */
  count: number;
  /** Offered in the rows-per-page control. Omit to leave the control out. */
  pageSizes?: readonly number[];
  /** Dims the control and blocks input while a page is being fetched. */
  busy?: boolean;
  noun?: readonly [string, string];
  label?: string;
  className?: string;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export function Pagination({
  page,
  pageSize,
  total,
  count,
  pageSizes,
  busy = false,
  noun = ["item", "items"],
  label = "Pagination",
  className,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const atFirst = page <= 1;
  const atLast = page >= totalPages;

  return (
    <nav
      aria-label={label}
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-3 py-2.5 transition-opacity",
        busy && "pointer-events-none opacity-60",
        className,
      )}
    >
      <p className="font-mono text-[0.68rem] tabular-nums text-[var(--color-text-subtle)]" aria-live="polite">
        {pageRangeLabel(page, pageSize, total, count, noun)}
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="h-7 gap-1 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          disabled={atFirst}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronIcon direction="left" />
          <span className="max-[40rem]:sr-only">Previous</span>
        </Button>
        <div className="flex items-center gap-0.5 rounded-sm bg-muted/60 p-0.5">
          {paginationRange(page, totalPages).map((value, index) =>
            value === null ? (
              <span
                key={`gap-${index}`}
                aria-hidden="true"
                className="px-1 font-mono text-[0.68rem] text-[var(--color-text-subtle)]"
              >
                …
              </span>
            ) : (
              <Button
                key={value}
                variant="ghost"
                size="sm"
                type="button"
                aria-label={`Page ${value}`}
                aria-current={value === page ? "page" : undefined}
                className="h-[1.75rem] min-w-[1.75rem] px-2 font-mono text-xs font-semibold tabular-nums text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:bg-card aria-[current=page]:text-primary aria-[current=page]:shadow-[var(--shadow-panel)]"
                onClick={() => onPageChange(value)}
              >
                {value}
              </Button>
            ),
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="h-7 gap-1 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          disabled={atLast}
          onClick={() => onPageChange(page + 1)}
        >
          <span className="max-[40rem]:sr-only">Next</span>
          <ChevronIcon direction="right" />
        </Button>
      </div>

      {pageSizes && onPageSizeChange && (
        // A segmented group rather than a `<select>`: it matches the filter and
        // grouping controls, and it keeps the page's only `option` role on the
        // list of items where it belongs.
        <div
          role="group"
          aria-label="Rows per page"
          className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-subtle)]"
        >
          <span aria-hidden="true">Rows</span>
          <div className="flex items-center gap-0.5 rounded-sm bg-muted/60 p-0.5">
            {pageSizes.map((size) => (
              <Button
                key={size}
                variant="ghost"
                size="sm"
                type="button"
                aria-label={`${size} rows per page`}
                aria-pressed={size === pageSize}
                className="h-[1.75rem] min-w-[1.75rem] px-2 font-mono text-xs font-semibold tabular-nums text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-card aria-pressed:text-primary aria-pressed:shadow-[var(--shadow-panel)]"
                onClick={() => onPageSizeChange(size)}
              >
                {size}
              </Button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
