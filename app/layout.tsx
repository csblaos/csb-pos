import type { Metadata, Viewport } from "next";

import { ClientPerfVitals } from "@/components/app/client-perf-vitals";

import "./globals.css";

export const metadata: Metadata = {
  title: "SaaS POS",
  description: "ระบบขายหน้าร้านแบบ SaaS",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const showPerfVitals = process.env.NEXT_PUBLIC_PERF_DEBUG === "1";

  return (
    <html lang="th">
      <body className="bg-slate-100 font-sans antialiased">
        <div className="min-h-dvh bg-slate-100 lg:px-4">{children}</div>
        {showPerfVitals ? <ClientPerfVitals /> : null}
      </body>
    </html>
  );
}
