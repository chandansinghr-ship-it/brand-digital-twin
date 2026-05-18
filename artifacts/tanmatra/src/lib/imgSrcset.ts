/**
 * Build a responsive srcset string for Unsplash images.
 *
 * Unsplash CDN supports ?w=<px>&q=<0-100> query params for on-the-fly resizing.
 * For non-Unsplash URLs the function returns undefined so callers can omit the
 * attribute entirely rather than emit an invalid value.
 */
export function unsplashSrcset(url: string): string | undefined {
  if (!url || !url.includes("unsplash.com")) return undefined;
  try {
    const make = (w: number, q: number): string => {
      const u = new URL(url);
      u.searchParams.set("w", String(w));
      u.searchParams.set("q", String(q));
      return `${u.toString()} ${w}w`;
    };
    return [make(400, 75), make(800, 80), make(1200, 85)].join(", ");
  } catch {
    return undefined;
  }
}
