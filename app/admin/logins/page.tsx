import { isIP } from "node:net";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { redirect } from "next/navigation";
import {
  AdminPageHeader,
  AdminWorkspace,
} from "@/components/admin/AdminWorkspace";
import {
  isAdminServiceConfigured,
  requireAdminUser,
} from "@/lib/admin/access";
import { normalizeIpAddress } from "@/lib/security/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatAdminDate } from "@/lib/admin/date-format";
import {
  adminBackHref,
  safeAdminReturnTo,
  withAdminNavigationContext,
  withAdminReturnTo,
} from "@/lib/admin/navigation";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;
const AUTH_METHODS = ["password", "google", "facebook"] as const;

type AuthMethod = (typeof AUTH_METHODS)[number];
type AdminDashboardView =
  | "overview"
  | "review"
  | "members"
  | "conversations"
  | "system";

type LoginRow = {
  id: string;
  profile_id: string;
  ip_address: string;
  auth_method: AuthMethod;
  logged_in_at: string;
  login_count: number;
};

type LoginProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  account_type: "family" | "au_pair";
  is_admin: boolean | null;
};

function firstSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function positivePage(value?: string | string[]) {
  const parsed = Number.parseInt(firstSearchParam(value) ?? "1", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function authMethod(value?: string | string[]): AuthMethod | "" {
  const candidate = firstSearchParam(value);

  return AUTH_METHODS.includes(candidate as AuthMethod)
    ? (candidate as AuthMethod)
    : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

const formatDate = (value: string) => formatAdminDate(value, "medium");

function methodLabel(method: AuthMethod) {
  if (method === "google") return "Google";
  if (method === "facebook") return "Facebook";

  return "Password";
}

function profileLabel(profile?: LoginProfile | null) {
  return profile?.full_name || profile?.email || profile?.id || "Unknown account";
}

function pageHref({
  page,
  query,
  method,
  profileId,
  returnTo,
  trail,
  view,
}: {
  page: number;
  query: string;
  method: AuthMethod | "";
  profileId: string;
  returnTo: string;
  trail?: string | string[];
  view: AdminDashboardView;
}) {
  const params = new URLSearchParams();

  if (query) params.set("q", query);
  if (method) params.set("method", method);
  if (profileId) params.set("profile", profileId);
  if (page > 1) params.set("page", String(page));
  params.set("view", view);

  const search = params.toString();

  return withAdminNavigationContext(
    search ? `/admin/logins?${search}` : "/admin/logins",
    returnTo,
    trail,
  );
}

function adminDashboardView(
  value: string | string[] | undefined,
  returnTo: string,
): AdminDashboardView {
  const directCandidate = firstSearchParam(value);
  const allowedViews: AdminDashboardView[] = [
    "overview",
    "review",
    "members",
    "conversations",
    "system",
  ];

  if (allowedViews.includes(directCandidate as AdminDashboardView)) {
    return directCandidate as AdminDashboardView;
  }

  try {
    const source = new URL(returnTo, "https://admin-navigation.invalid");
    const sourceView = source.searchParams.get("view");

    if (allowedViews.includes(sourceView as AdminDashboardView)) {
      return sourceView as AdminDashboardView;
    }
  } catch {
    // returnTo is sanitized earlier; Members remains the deterministic fallback.
  }

  return "members";
}

function legacyLoginsFallback({
  profileId,
  view,
}: {
  profileId: string;
  view?: string | string[];
}) {
  const candidate = firstSearchParam(view);
  const hasDashboardView =
    candidate === "overview" ||
    candidate === "review" ||
    candidate === "members" ||
    candidate === "conversations" ||
    candidate === "system";
  const dashboardView = hasDashboardView ? candidate : "members";

  if (profileId && hasDashboardView) {
    return `/admin/profiles/${profileId}?section=activity&view=${dashboardView}`;
  }

  if (profileId) return "/admin?view=system#account-login-ips";

  return dashboardView === "overview"
    ? "/admin#workspace"
    : `/admin?view=${dashboardView}#workspace`;
}

export default async function AdminLoginsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    method?: string | string[];
    page?: string | string[];
    profile?: string | string[];
    returnTo?: string | string[];
    adminTrail?: string | string[];
    view?: string | string[];
  }>;
}) {
  await requireAdminUser();

  if (!isAdminServiceConfigured()) {
    redirect("/admin");
  }

  const params = await searchParams;
  const query = (firstSearchParam(params.q) ?? "").trim().slice(0, 160);
  const selectedMethod = authMethod(params.method);
  const requestedProfileId = firstSearchParam(params.profile) ?? "";
  const profileId = isUuid(requestedProfileId) ? requestedProfileId : "";
  const currentPage = positivePage(params.page);
  const fallbackHref = legacyLoginsFallback({
    profileId,
    view: params.view,
  });
  const returnTo = safeAdminReturnTo(params.returnTo, fallbackHref);
  const sourceDashboardView = adminDashboardView(params.view, returnTo);
  const currentPageHref = pageHref({
    page: currentPage,
    query,
    method: selectedMethod,
    profileId,
    returnTo,
    trail: params.adminTrail,
    view: sourceDashboardView,
  });
  const supabase = createAdminClient();

  let queryProfileIds: string[] | null = null;
  let searchedIpAddress = "";

  if (!profileId && query) {
    const normalizedIp = normalizeIpAddress(query);

    if (isIP(normalizedIp)) {
      searchedIpAddress = normalizedIp;
    } else if (isUuid(query)) {
      queryProfileIds = [query];
    } else {
      const searchPattern = `%${query}%`;
      const [emailMatches, nameMatches] = await Promise.all([
        supabase
          .from("profiles")
          .select("id")
          .ilike("email", searchPattern)
          .limit(200),
        supabase
          .from("profiles")
          .select("id")
          .ilike("full_name", searchPattern)
          .limit(200),
      ]);

      queryProfileIds = Array.from(
        new Set(
          [...(emailMatches.data ?? []), ...(nameMatches.data ?? [])].map(
            (profile) => profile.id,
          ),
        ),
      );
    }
  }

  const shouldSkipLoginQuery =
    queryProfileIds !== null && queryProfileIds.length === 0;
  let loginRows: LoginRow[] = [];
  let loginCount = 0;
  let loginError: string | null = null;

  if (!shouldSkipLoginQuery) {
    let loginQuery = supabase
      .from("account_login_ip_history")
      .select(
        "id, profile_id, ip_address, auth_method, logged_in_at, login_count",
        { count: "exact" },
      );

    if (profileId) loginQuery = loginQuery.eq("profile_id", profileId);
    if (selectedMethod) {
      loginQuery = loginQuery.eq("auth_method", selectedMethod);
    }
    if (searchedIpAddress) {
      loginQuery = loginQuery.eq("ip_address", searchedIpAddress);
    }
    if (queryProfileIds) {
      loginQuery = loginQuery.in("profile_id", queryProfileIds);
    }

    const result = await loginQuery
      .order("logged_in_at", { ascending: false })
      .range(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE - 1,
      );

    loginRows = (result.data ?? []) as LoginRow[];
    loginCount = result.count ?? loginRows.length;
    loginError = result.error?.message ?? null;
  }

  const rowProfileIds = Array.from(
    new Set([
      ...loginRows.map((entry) => entry.profile_id),
      ...(profileId ? [profileId] : []),
    ]),
  );
  const profilesResult =
    rowProfileIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, email, full_name, account_type, is_admin")
          .in("id", rowProfileIds)
      : { data: [], error: null };
  const profiles = (profilesResult.data ?? []) as LoginProfile[];
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const filteredProfile = profileId ? profileMap.get(profileId) : null;
  const totalPages = Math.max(1, Math.ceil(loginCount / PAGE_SIZE));
  const firstVisible = loginCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastVisible = Math.min(currentPage * PAGE_SIZE, loginCount);
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;

  return (
    <AdminWorkspace activeArea={sourceDashboardView}>
      <section className="mx-auto w-full max-w-7xl">
        <AdminPageHeader
          eyebrow="Account security"
          title="Login history"
          description="Every successful sign-in recorded with its exact timestamp, IP address, account and authentication method."
          actions={
            <AdminBackLink
              returnTo={params.returnTo}
              trail={params.adminTrail}
              fallbackHref={fallbackHref}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--pa-admin-border)] bg-white px-4 py-2 text-sm font-bold text-[var(--pa-admin-ink)] outline-none transition hover:bg-[var(--pa-admin-surface-subtle)] focus-visible:ring-4 focus-visible:ring-[var(--pa-primary-focus-ring)]"
            >
              ← Back
            </AdminBackLink>
          }
        />

        <form
          action="/admin/logins"
          className="mt-4 grid gap-3 rounded-[1.25rem] bg-white p-4 shadow-sm ring-1 ring-black/5 sm:grid-cols-[minmax(0,1fr)_13rem_auto] sm:items-end sm:p-5"
        >
          {profileId ? (
            <input type="hidden" name="profile" value={profileId} />
          ) : null}
          <input type="hidden" name="returnTo" value={returnTo} />
          {firstSearchParam(params.adminTrail) ? (
            <input
              type="hidden"
              name="adminTrail"
              value={firstSearchParam(params.adminTrail)}
            />
          ) : null}
          <input type="hidden" name="view" value={sourceDashboardView} />
          <label className="min-w-0">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-[#6f8793]">
              Search
            </span>
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Name, email, account ID or exact IP"
              className="mt-2 min-h-11 w-full rounded-xl border border-[#ccd8dc] bg-white px-3 text-base font-semibold outline-none transition placeholder:text-[#25302d]/30 focus:border-[#45636f] focus:ring-4 focus:ring-[#45636f]/10"
            />
          </label>
          <label>
            <span className="text-xs font-black uppercase tracking-[0.14em] text-[#6f8793]">
              Sign-in method
            </span>
            <select
              name="method"
              defaultValue={selectedMethod}
              className="mt-2 min-h-11 w-full rounded-xl border border-[#ccd8dc] bg-white px-3 text-base font-bold outline-none transition focus:border-[#45636f] focus:ring-4 focus:ring-[#45636f]/10"
            >
              <option value="">All methods</option>
              <option value="password">Password</option>
              <option value="google">Google</option>
              <option value="facebook">Facebook</option>
            </select>
          </label>
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-[#172d28] px-5 text-sm font-black text-white transition hover:bg-[#22433b]"
          >
            Apply filters
          </button>
        </form>

        {filteredProfile ? (
          <div className="mt-4 flex flex-col gap-3 rounded-[1.25rem] border border-emerald-200 bg-emerald-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
                Account filter
              </p>
              <p className="mt-1 truncate text-sm font-black text-[#172d28]">
                {profileLabel(filteredProfile)} ·{" "}
                {filteredProfile.email ?? filteredProfile.id}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!filteredProfile.is_admin ? (
                <Link
                  href={withAdminReturnTo(
                    `/admin/profiles/${filteredProfile.id}?section=activity&view=${sourceDashboardView}`,
                    currentPageHref,
                  )}
                  className="rounded-xl bg-white px-3 py-2 text-xs font-black text-[#45636f] ring-1 ring-black/10"
                >
                  Open account
                </Link>
              ) : null}
              <Link
                href={adminBackHref(
                  params.returnTo,
                  params.adminTrail,
                  fallbackHref,
                )}
                className="rounded-xl bg-[#172d28] px-3 py-2 text-xs font-black text-white"
              >
                Clear account filter
              </Link>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#6f8793]">
              Matching logins
            </p>
            <p className="mt-1 text-2xl font-black tracking-[-0.03em] text-[#172d28]">
              {loginCount.toLocaleString("en")}
            </p>
          </div>
          <p className="text-xs font-bold text-[#25302d]/45">
            Showing {firstVisible.toLocaleString("en")}–
            {lastVisible.toLocaleString("en")} · Page {currentPage} of{" "}
            {totalPages}
          </p>
        </div>

        {loginError || profilesResult.error ? (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700 ring-1 ring-red-100">
            Could not load the complete login history.{" "}
            {loginError ?? profilesResult.error?.message}
          </div>
        ) : null}

        {loginRows.length > 0 ? (
          <>
            <div className="mt-4 space-y-3 lg:hidden">
              {loginRows.map((entry) => {
                const profile = profileMap.get(entry.profile_id);

                return (
                  <article
                    key={entry.id}
                    className="rounded-[1.25rem] bg-white p-4 shadow-sm ring-1 ring-black/5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#eef4f6] px-2.5 py-1 text-xs font-black text-[#45636f]">
                        {methodLabel(entry.auth_method)}
                      </span>
                      {profile?.is_admin ? (
                        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-black text-violet-700">
                          Admin
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 font-mono text-base font-black text-[#172d28]">
                      {entry.ip_address}
                    </p>
                    <time
                      dateTime={entry.logged_in_at}
                      className="mt-1 block text-sm font-bold text-[#25302d]/55"
                    >
                      {formatDate(entry.logged_in_at)}
                    </time>
                    <div className="mt-3 border-t border-black/5 pt-3">
                      <p className="truncate text-sm font-black">
                        {profileLabel(profile)}
                      </p>
                      <p className="mt-0.5 truncate text-xs font-bold text-[#25302d]/42">
                        {profile?.email ?? entry.profile_id}
                      </p>
                    </div>
                    {entry.login_count > 1 ? (
                      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                        Historical aggregate: {entry.login_count} sign-ins. Exact
                        individual timestamps were not retained before this
                        journal was enabled.
                      </p>
                    ) : null}
                    <Link
                      href={withAdminReturnTo(
                        `/admin/logins?profile=${entry.profile_id}&view=${sourceDashboardView}`,
                        currentPageHref,
                      )}
                      className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-[#172d28] px-4 text-xs font-black text-white"
                    >
                      All logins for this account
                    </Link>
                  </article>
                );
              })}
            </div>

            <div className="mt-4 hidden overflow-hidden rounded-[1.25rem] bg-white shadow-sm ring-1 ring-black/5 lg:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[58rem] border-collapse text-left">
                  <thead className="bg-[#edf3f1] text-xs font-black uppercase tracking-[0.12em] text-[#60736f]">
                    <tr>
                      <th className="px-5 py-3">Timestamp</th>
                      <th className="px-5 py-3">Account</th>
                      <th className="px-5 py-3">IP address</th>
                      <th className="px-5 py-3">Method</th>
                      <th className="px-5 py-3 text-right">Navigate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {loginRows.map((entry) => {
                      const profile = profileMap.get(entry.profile_id);

                      return (
                        <tr key={entry.id} className="align-top hover:bg-[#f7faf9]">
                          <td className="whitespace-nowrap px-5 py-4 text-sm font-bold text-[#25302d]/65">
                            <time dateTime={entry.logged_in_at}>
                              {formatDate(entry.logged_in_at)}
                            </time>
                            {entry.login_count > 1 ? (
                              <span className="mt-1 block text-xs font-black text-amber-700">
                                Historical group: {entry.login_count}
                              </span>
                            ) : null}
                          </td>
                          <td className="max-w-[20rem] px-5 py-4">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-black text-[#172d28]">
                                {profileLabel(profile)}
                              </p>
                              {profile?.is_admin ? (
                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[0.65rem] font-black text-violet-700">
                                  Admin
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 truncate text-xs font-bold text-[#25302d]/40">
                              {profile?.email ?? entry.profile_id}
                            </p>
                          </td>
                          <td className="px-5 py-4 font-mono text-sm font-black text-[#172d28]">
                            {entry.ip_address}
                          </td>
                          <td className="px-5 py-4">
                            <span className="rounded-full bg-[#eef4f6] px-3 py-1 text-xs font-black text-[#45636f]">
                              {methodLabel(entry.auth_method)}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <Link
                              href={withAdminReturnTo(
                                `/admin/logins?profile=${entry.profile_id}&view=${sourceDashboardView}`,
                                currentPageHref,
                              )}
                              className="inline-flex min-h-9 items-center justify-center rounded-lg bg-[#172d28] px-3 text-xs font-black text-white"
                            >
                              Account logins
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-[1.25rem] border border-dashed border-emerald-200 bg-emerald-50/60 p-6 text-center text-sm font-bold text-emerald-800/70">
            No successful logins match these filters.
          </div>
        )}

        <nav
          aria-label="Login history pagination"
          className="mt-5 flex items-center justify-between gap-3"
        >
          {hasPreviousPage ? (
            <Link
              href={pageHref({
                page: currentPage - 1,
                query,
                method: selectedMethod,
                profileId,
                returnTo,
                trail: params.adminTrail,
                view: sourceDashboardView,
              })}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-black text-[#45636f] shadow-sm ring-1 ring-black/10"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          {hasNextPage ? (
            <Link
              href={pageHref({
                page: currentPage + 1,
                query,
                method: selectedMethod,
                profileId,
                returnTo,
                trail: params.adminTrail,
                view: sourceDashboardView,
              })}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#172d28] px-4 text-sm font-black text-white"
            >
              Next →
            </Link>
          ) : null}
        </nav>
      </section>
    </AdminWorkspace>
  );
}
