import { typeGlyph } from "../lib/contentTypeColors";
import { cn } from "@/lib/utils";

const icons = {
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m20.5 16-5-5-8.5 8" />
    </>
  ),
  link: (
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
};

const sizes = {
  sm: { box: "size-7 rounded-[7px]", icon: "size-3.5", base: 10.5 },
  md: { box: "size-[30px] rounded-lg", icon: "size-[15px]", base: 11 },
  lg: { box: "size-[38px] rounded-[10px]", icon: "size-[17px]", base: 12 },
};

/**
 * The square that says what kind of thing a capture is, before a word of it
 * is read: `{ }` for JSON, `>_` for a shell line, a lock for anything held
 * back as sensitive. Tinted with the type's own `--type-*` token, the same
 * colour the row's meta line names the type in.
 */
export default function TypeTile({
  item,
  size = "md",
  className,
}: {
  item: { content_type: string; content: string; private?: boolean };
  size?: keyof typeof sizes;
  className?: string;
}) {
  const { glyph, icon, token } = typeGlyph(item);
  const spec = sizes[size];
  const colour = `var(--type-${token})`;
  // Longer glyphs step down so "SQL" sits in the same square as "#".
  const length = glyph?.replace(/\s/g, "").length ?? 0;
  const fontSize = length <= 1 ? spec.base + 3 : length === 2 ? spec.base : length === 3 ? spec.base - 1.5 : spec.base - 2.5;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 select-none place-items-center font-mono font-bold tracking-[-0.02em]",
        spec.box,
        className,
      )}
      style={{ color: colour, background: `color-mix(in srgb, ${colour} 13%, transparent)`, fontSize }}
    >
      {icon ? (
        <svg
          viewBox="0 0 24 24"
          className={cn(spec.icon, "fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]")}
        >
          {icons[icon]}
        </svg>
      ) : (
        glyph
      )}
    </span>
  );
}
