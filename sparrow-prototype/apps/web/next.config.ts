import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sparrow/shared"],
  reactStrictMode: true,
};

export default nextConfig;
