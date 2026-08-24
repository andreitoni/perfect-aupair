import { AdminLink as Link } from "@/components/admin/AdminLink";
import type { ReactNode } from "react";
import { Header } from "@/components/layout/Header";

export type AdminArea =
  | "overview"
  | "review"
  | "members"
  | "conversations"
  | "system";

type AdminAreaDefinition = {
  id: AdminArea;
  label: string;
  mobileLabel: string;
  description: string;
};

export const ADMIN_AREAS: AdminAreaDefinition[] = [
  {
    id: "overview",
    label: "Overview",
    mobileLabel: "Overview",
    description: "Priorities and platform status",
  },
  {
    id: "review",
    label: "Review queue",
    mobileLabel: "Review",
    description: "Content, identity and safety",
  },
  {
    id: "members",
    label: "Members",
    mobileLabel: "Members",
    description: "Accounts and sign-in activity",
  },
  {
    id: "conversations",
    label: "Conversations",
    mobileLabel: "Chats",
    description: "Read-only message review",
  },
  {
    id: "system",
    label: "System",
    mobileLabel: "System",
    description: "Controls and audit trail",
  },
];

export function adminAreaHref(area: AdminArea) {
  return area === "overview" ? "/admin" : `/admin?view=${area}`;
}

type AdminWorkspaceProps = {
  activeArea: AdminArea;
  activeHref?: string;
  counts?: Partial<Record<AdminArea, number>>;
  children: ReactNode;
  privacyMask?: boolean;
};

export function AdminWorkspace({
  activeArea,
  activeHref,
  counts = {},
  children,
  privacyMask = false,
}: AdminWorkspaceProps) {
  return (
    <main
      data-clarity-mask={privacyMask ? "true" : undefined}
      data-hj-suppress={privacyMask ? "" : undefined}
      className="min-h-screen overflow-x-clip bg-[var(--pa-admin-bg)] pb-[calc(5rem+env(safe-area-inset-bottom))] text-[var(--pa-admin-ink)] lg:pb-0"
    >
      <Header subtitle="Admin console" authState="admin" width="full" />

      <div className="mx-auto grid w-full max-w-[94rem] gap-5 px-3 py-4 sm:px-6 sm:py-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-7 lg:px-7 lg:py-7">
        <AdminDesktopNavigation
          activeArea={activeArea}
          activeHref={activeHref}
          counts={counts}
        />
        <div className="min-w-0">{children}</div>
      </div>

      <AdminMobileNavigation
        activeArea={activeArea}
        activeHref={activeHref}
        counts={counts}
      />
    </main>
  );
}

function AdminDesktopNavigation({
  activeArea,
  activeHref,
  counts,
}: {
  activeArea: AdminArea;
  activeHref?: string;
  counts: Partial<Record<AdminArea, number>>;
}) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-[5.75rem] overflow-hidden rounded-[var(--pa-admin-panel-radius)] border border-[var(--pa-admin-sidebar-border)] bg-[var(--pa-admin-sidebar)] text-white shadow-[var(--pa-admin-shadow)]">
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[#a9c6bd]">
            Admin console
          </p>
          <p className="mt-2 text-base font-bold">Perfect AuPair</p>
          <p className="mt-1 text-xs font-medium leading-5 text-white/55">
            Moderation and operations
          </p>
        </div>

        <nav aria-label="Admin navigation" className="space-y-1.5 p-3">
          {ADMIN_AREAS.map((area) => {
            const isActive = area.id === activeArea;
            const count = counts[area.id];

            return (
              <Link
                key={area.id}
                href={isActive && activeHref ? activeHref : adminAreaHref(area.id)}
                aria-current={isActive ? "page" : undefined}
                className={`group flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 outline-none transition focus-visible:ring-4 focus-visible:ring-white/20 ${
                  isActive
                    ? "border-white/15 bg-white text-[var(--pa-admin-ink)] shadow-sm"
                    : "border-transparent text-white/80 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    isActive ? "bg-[var(--pa-primary)]" : "bg-white/25"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {area.label}
                  </span>
                  <span
                    className={`mt-0.5 block truncate text-[0.68rem] font-medium ${
                      isActive
                        ? "text-[var(--pa-admin-muted)]"
                        : "text-white/45"
                    }`}
                  >
                    {area.description}
                  </span>
                </span>
                {typeof count === "number" ? (
                  <span
                    className={`inline-flex min-w-7 shrink-0 justify-center rounded-full px-2 py-1 text-[0.68rem] font-bold ${
                      isActive
                        ? "bg-[var(--pa-admin-surface-subtle)] text-[var(--pa-admin-muted)]"
                        : "bg-white/10 text-white"
                    }`}
                  >
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-5 py-4 text-xs font-medium leading-5 text-white/45">
          Private administrative area
        </div>
      </div>
    </aside>
  );
}

function AdminMobileNavigation({
  activeArea,
  activeHref,
  counts,
}: {
  activeArea: AdminArea;
  activeHref?: string;
  counts: Partial<Record<AdminArea, number>>;
}) {
  return (
    <nav
      aria-label="Admin navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--pa-admin-border)] bg-white/[0.97] px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(23,45,40,0.10)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid h-[4.25rem] max-w-2xl grid-cols-5">
        {ADMIN_AREAS.map((area) => {
          const isActive = area.id === activeArea;
          const count = counts[area.id];

          return (
            <Link
              key={area.id}
              href={isActive && activeHref ? activeHref : adminAreaHref(area.id)}
              aria-current={isActive ? "page" : undefined}
              aria-label={area.label}
              className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.66rem] font-bold outline-none transition focus-visible:ring-4 focus-visible:ring-[var(--pa-primary-focus-ring)] ${
                isActive
                  ? "text-[var(--pa-primary)]"
                  : "text-[var(--pa-admin-muted)]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-6 rounded-full ${
                  isActive
                    ? "bg-[var(--pa-primary)]"
                    : "bg-[var(--pa-admin-border)]"
                }`}
              />
              <span className="max-w-full truncate">{area.mobileLabel}</span>
              {typeof count === "number" && count > 0 ? (
                <span className="absolute right-[18%] top-1.5 inline-flex min-w-4 justify-center rounded-full bg-[var(--pa-admin-danger)] px-1 text-[0.58rem] leading-4 text-white">
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

type AdminPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
};

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
}: AdminPageHeaderProps) {
  return (
    <header className="rounded-[var(--pa-admin-panel-radius)] border border-[var(--pa-admin-border)] bg-[var(--pa-admin-surface)] p-4 shadow-[var(--pa-admin-shadow)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 max-w-3xl">
          {eyebrow ? (
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[var(--pa-primary)]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-1 text-2xl font-black tracking-[-0.035em] text-[var(--pa-admin-ink)] sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[var(--pa-admin-muted)]">
              {description}
            </p>
          ) : null}
          {meta ? <div className="mt-3">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
