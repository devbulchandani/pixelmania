import type { NextConfig } from "next";

 const nextConfig = {
    experimental: {
      turbo: {
        unstable_skipDevServer: false,
      },
    },
    // Disable Fast Refresh during channel creation
    reactStrictMode: false,
  };

export default nextConfig;
