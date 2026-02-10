import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
