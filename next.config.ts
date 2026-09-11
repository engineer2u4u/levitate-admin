import type { NextConfig } from "next";

// The admin is served from a folder on the main site's host —
// levitatepeoplesoft.com/admin-panel/ — not from a host of its own. Every route
// and asset URL Next emits gets this prefix; anything built by hand goes
// through `withBase()` in src/lib/basePath.ts, which reads the same value.
//
// Overridable so the admin can move to its own subdomain later (set it to an
// empty string) without editing code.
const BASE_PATH = process.env.ADMIN_BASE_PATH ?? "/admin-panel";

const nextConfig: NextConfig = {
  // Same constraint as the main site: SiteGround is shared Apache with no Node
  // runtime, so the admin ships as static files too.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: BASE_PATH,
  env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH },
};

export default nextConfig;
