export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full items-start px-4 py-6 lg:max-w-[var(--auth-shell-max-width)] lg:py-10">
      <div className="w-full rounded-2xl border bg-white p-6 shadow-sm lg:p-8">
        {children}
      </div>
    </div>
  );
}
