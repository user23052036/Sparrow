import type { NextConfig } from "next";

// STATIC_EXPORT=1 builds plain files into out/ for GitHub Pages (D41, .github/workflows/deploy-web.yml).
// NEXT_PUBLIC_BASE_PATH is the folder the site is served from there ("/Sparrow"); empty everywhere else.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  transpilePackages: ["@sparrow/shared"],
  reactStrictMode: true,
  ...(process.env.STATIC_EXPORT === "1" ? { output: "export" as const } : {}),
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
