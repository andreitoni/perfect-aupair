"use client";

import { AdminLink } from "@/components/admin/AdminLink";

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--pa-admin-bg)] px-4 py-10 text-[var(--pa-admin-ink)]">
      <section
        role="alert"
        className="w-full max-w-lg rounded-[var(--pa-admin-panel-radius)] border border-[var(--pa-admin-border)] bg-white p-6 shadow-[var(--pa-admin-shadow)] sm:p-8"
      >
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--pa-admin-danger)]">
          Admin console
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-[-0.03em]">
          This view could not be loaded
        </h1>
        <p className="mt-3 text-sm font-medium leading-6 text-[var(--pa-admin-muted)]">
          The console could not confirm the latest result. Reload the current
          data before repeating an action, or return to the dashboard.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--pa-primary)] px-5 text-sm font-black text-[var(--pa-primary-ink)]"
          >
            Try again
          </button>
          <AdminLink
            href="/admin"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--pa-admin-border)] bg-white px-5 text-sm font-bold"
          >
            Dashboard
          </AdminLink>
        </div>
      </section>
    </main>
  );
}
