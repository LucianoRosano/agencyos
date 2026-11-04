import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-grid relative flex min-h-dvh items-center justify-center px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(124,92,255,0.18),transparent)]" />
      <div className="relative w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-pop)] md:p-8">{children}</div>
        <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-text-faint">Digital Agency OS</p>
      </div>
    </main>
  );
}
