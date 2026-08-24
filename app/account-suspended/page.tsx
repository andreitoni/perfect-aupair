import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { getModerationRule } from "@/lib/moderation/rules";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account suspended",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SuspendedProfile = {
  suspended_at: string | null;
  suspended_until: string | null;
  suspended_reason: string | null;
  suspension_rule: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return null;

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function isActiveSuspension(profile?: SuspendedProfile | null) {
  if (!profile?.suspended_at) return false;
  if (!profile.suspended_until) return true;

  return new Date(profile.suspended_until).getTime() > Date.now();
}

export default async function AccountSuspendedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("suspended_at, suspended_until, suspended_reason, suspension_rule")
    .eq("id", user.id)
    .maybeSingle<SuspendedProfile>();

  if (!isActiveSuspension(profile)) {
    redirect("/auth/home");
  }

  const rule = getModerationRule(profile?.suspension_rule);
  const suspendedUntil = formatDate(profile?.suspended_until);
  const reason =
    profile?.suspended_reason?.trim() ||
    rule?.label ||
    "a violation of the platform rules";

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
      <Header subtitle="Account suspended" authState="public" />

      <section className="mx-auto flex min-h-[calc(100vh-180px)] max-w-2xl items-center px-5 py-8 sm:px-8">
        <div className="w-full rounded-[1.75rem] bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-[#9d3f2f]">
            Account suspended
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
            Your account is temporarily restricted.
          </h1>

          <div className="mt-5 rounded-[1.25rem] bg-red-50 p-5 text-sm font-semibold leading-6 text-red-700 ring-1 ring-red-100">
            Your account has been suspended
            {suspendedUntil ? ` until ${suspendedUntil}` : ""} for {reason}.
          </div>

          <p className="mt-5 text-sm font-semibold leading-6 text-[#25302d]/58">
            You can read the platform rules or contact support if you believe
            this was a mistake. You cannot use profiles, stories, saved
            profiles, or messages while the suspension is active.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/terms"
              className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-black text-[#25302d]"
            >
              Platform rules
            </Link>
            <Link
              href="/contact"
              className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-black text-[#25302d]"
            >
              Contact support
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-full bg-[var(--pa-primary)] px-5 py-3 text-sm font-black text-[var(--pa-primary-ink)]"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
