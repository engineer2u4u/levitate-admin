import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Same constraint as the main site: SiteGround is shared Apache with no Node
  // runtime, so the admin ships as static files too.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
