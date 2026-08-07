const DENSITY_KEY = "snipdock.density";
export type Density = "comfortable" | "compact";

// Client-only preference (like the update-check settings in AppSidebar) -
// row density has no backend representation and this change adds none.
export function getDensity(): Density {
  return localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
}

export function setDensity(value: Density): void {
  localStorage.setItem(DENSITY_KEY, value);
}
