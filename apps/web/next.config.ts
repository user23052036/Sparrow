import type { NextConfig } from "next";
import { securityHeaders } from "./lib/csp";

// STATIC_EXPORT=1 builds plain files into out/ for GitHub Pages (D41, .github/workflows/deploy-web.yml).
// NEXT_PUBLIC_BASE_PATH is the folder the site is served from there ("/Sparrow"); empty everywhere else.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;
const exporting = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  transpilePackages: ["@sparrow/shared"],
  reactStrictMode: true,
  ...(exporting ? { output: "export" as const } : {}),
  ...(basePath ? { basePath } : {}),
  // A static host cannot send headers; the export carries the policy in a <meta> tag instead (app/layout.tsx).
  ...(exporting
    ? {}
    : {
        async headers() {
          const dev = process.env.NODE_ENV === "development";
          return [{ source: "/:path*", headers: securityHeaders(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", dev) }];
        },
      }),
};

export default nextConfig;
