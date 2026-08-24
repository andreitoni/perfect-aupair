export default function AdminLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading admin console"
      className="min-h-screen overflow-hidden bg-[var(--pa-admin-bg)] pb-24 text-[var(--pa-admin-ink)] lg:pb-0"
    >
      <div className="h-[4.25rem] border-b border-[var(--pa-admin-border)] bg-white" />
      <div className="mx-auto grid w-full max-w-[94rem] gap-5 px-3 py-4 sm:px-6 sm:py-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-7 lg:px-7 lg:py-7">
        <div className="hidden h-[31rem] animate-pulse rounded-[var(--pa-admin-panel-radius)] bg-[#173f39] lg:block" />
        <div className="min-w-0 space-y-4">
          <div className="animate-pulse rounded-[var(--pa-admin-panel-radius)] border border-[var(--pa-admin-border)] bg-white p-5 sm:p-6">
            <div className="h-3 w-24 rounded-full bg-[var(--pa-admin-border)]" />
            <div className="mt-3 h-8 w-56 max-w-full rounded-lg bg-[var(--pa-admin-border)]" />
            <div className="mt-3 h-4 w-full max-w-xl rounded-full bg-[var(--pa-admin-surface-subtle)]" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="h-40 animate-pulse rounded-[var(--pa-admin-panel-radius)] border border-[var(--pa-admin-border)] bg-white"
              />
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </main>
  );
}
