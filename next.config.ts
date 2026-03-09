import type { NextConfig } from "next";

const r2PublicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim() ?? "";

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  {
    protocol: "https",
    hostname: "**.r2.dev",
  },
];

if (r2PublicBaseUrl) {
  try {
    const parsed = new URL(r2PublicBaseUrl);
    remotePatterns.push({
      protocol: parsed.protocol.replace(":", "") as "http" | "https",
      hostname: parsed.hostname,
      pathname: `${parsed.pathname.replace(/\/$/, "") || ""}/**`,
    });
  } catch {
    // ignore invalid R2_PUBLIC_BASE_URL and keep default remote patterns
  }
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["sequelize", "pg", "pg-hstore"],
  images: {
    remotePatterns,
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
