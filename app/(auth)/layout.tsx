export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md items-start px-4 py-6">
      <div className="w-full rounded-2xl border bg-white p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}
