import type { Metadata, Viewport } from "next";

import { ClientPerfVitals } from "@/components/app/client-perf-vitals";
import { AppToaster } from "@/components/ui/app-toaster";

import "./globals.css";

export const metadata: Metadata = {
  title: "SaaS POS",
  description: "ระบบขายหน้าร้านแบบ SaaS",
  applicationName: "SaaS POS",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SaaS POS",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const showPerfVitals = process.env.NEXT_PUBLIC_PERF_DEBUG === "1";

  return (
    <html lang="th">
      <body className="bg-white font-sans antialiased">
        <div className="min-h-dvh bg-white lg:px-4">{children}</div>
        <AppToaster />
        {showPerfVitals ? <ClientPerfVitals /> : null}
      </body>
    </html>
  );
}
