/**
 * The folder the admin is served from — "/admin-panel" in production.
 *
 * Next adds this to everything it routes: <Link>, redirect(), the _next assets.
 * It does not touch a URL written out by hand — an <a href>, an <img src>, a
 * fetch(), a string handed to Supabase — and on this host that mistake is
 * silent rather than a 404: the main site answers at the root, so an
 * unprefixed "/certificates/…" loads the main site's own folder of that name.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefixes a root-relative path with the base path. `withBase("/x")` → "/admin-panel/x". */
export const withBase = (path: string) => `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
