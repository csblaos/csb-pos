import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.dev",
      },
    ],
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@tanstack/react-table",
      "@hookform/resolvers",
      "zod",
      "drizzle-orm",
      "@radix-ui/react-slot",
    ],
  },
};

export default nextConfig;
