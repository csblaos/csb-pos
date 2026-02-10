import type { Metadata } from "next";

import { ClientPerfVitals } from "@/components/app/client-perf-vitals";

import "./globals.css";

export const metadata: Metadata = {
  title: "SaaS POS",
  description: "ระบบขายหน้าร้านแบบ SaaS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const showPerfVitals = process.env.NEXT_PUBLIC_PERF_DEBUG === "1";

  return (
    <html lang="th">
      <body className="font-sans antialiased">
        <div className="min-h-dvh bg-slate-100">{children}</div>
        {showPerfVitals ? <ClientPerfVitals /> : null}
      </body>
    </html>
  );
}
