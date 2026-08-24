import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { getServerTranslator } from "@/lib/i18n/server";
import { getPrimaryProfilePhotoUrl } from "@/lib/profile/photos";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { submitModerationReport } from "./actions";

export const metadata: Metadata = {
  title: "Report content",
  description: "Report suspicious or inappropriate content to Perfect AuPair.",
  robots: { index: false, follow: false },
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeReportType(value?: string) {
  if (value !== "profile") {
    return null;
  }

  return "profile";
}

function normalizeUuid(value?: string) {
  if (!value || !UUID_PATTERN.test(value)) {
    return null;
  }

  return value;
}

function safeReturnTo(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    id?: string;
    returnTo?: string;
    sent?: string;
  }>;
}) {
  const { t } = await getServerTranslator();
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, initialProfilePhotoUrl] = await Promise.all([
    supabase
      .from("profiles")
      .select("account_type")
      .eq("id", user.id)
      .maybeSingle<{ account_type: "family" | "au_pair" | null }>(),
    getPrimaryProfilePhotoUrl(supabase, user.id),
  ]);
  const accountType = profile?.account_type ?? null;
  const returnTo = safeReturnTo(params.returnTo) ?? "/account";

  if (params.sent === "1") {
    return (
      <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
        <Header
          subtitle="report.sent"
          authState="authenticated"
          accountType={accountType}
          initialProfilePhotoUrl={initialProfilePhotoUrl}
        />
        <section className="mx-auto flex min-h-[calc(100vh-180px)] max-w-xl items-center px-4 py-8 sm:px-8">
          <div className="w-full rounded-[1.5rem] bg-white p-6 shadow-sm ring-1 ring-black/5 sm:rounded-[2rem] sm:p-8">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#6f8793]">
              {t("report.sent")}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.04em]">
              {t("report.thankYou")}
            </h1>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#25302d]/58">
              {t("report.sentText")}
            </p>
            <Link
              href={returnTo}
              prefetch={false}
              className="mt-6 inline-flex rounded-full bg-[var(--pa-primary)] px-5 py-3 text-sm font-black text-[var(--pa-primary-ink)]"
            >
              {t("common.goBack")}
            </Link>
          </div>
        </section>
        <LegalFooter />
      </main>
    );
  }

  const subjectType = normalizeReportType(params.type);
  const subjectId = normalizeUuid(params.id);

  if (!subjectType || !subjectId) {
    return (
      <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
        <Header
          subtitle="report.content"
          authState="authenticated"
          accountType={accountType}
          initialProfilePhotoUrl={initialProfilePhotoUrl}
        />
        <section className="mx-auto flex min-h-[calc(100vh-180px)] max-w-xl items-center px-4 py-8 sm:px-8">
          <div className="w-full rounded-[1.5rem] bg-white p-6 shadow-sm ring-1 ring-black/5 sm:rounded-[2rem] sm:p-8">
            <h1 className="text-3xl font-black tracking-[-0.04em]">
              {t("report.invalidTitle")}
            </h1>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#25302d]/58">
              {t("report.invalidText")}
            </p>
          </div>
        </section>
        <LegalFooter />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
      <Header
        subtitle="report.content"
        authState="authenticated"
        accountType={accountType}
        initialProfilePhotoUrl={initialProfilePhotoUrl}
      />

      <section className="mx-auto flex min-h-[calc(100vh-180px)] max-w-xl items-center px-4 py-8 sm:px-8">
        <div className="w-full rounded-[1.5rem] bg-white p-6 shadow-sm ring-1 ring-black/5 sm:rounded-[2rem] sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-[#6f8793]">
            {t("report.moderation")}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em]">
            {t("report.thisProfile")}
          </h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-[#25302d]/58">
            {t("report.intro")}
          </p>

          <form action={submitModerationReport} className="mt-6 space-y-4">
            <input type="hidden" name="type" value={subjectType} />
            <input type="hidden" name="id" value={subjectId} />
            <input type="hidden" name="returnTo" value={returnTo} />

            <div>
              <label htmlFor="category" className="mb-2 block text-sm font-bold">
                {t("report.category")}
              </label>
              <select
                id="category"
                name="category"
                required
                defaultValue=""
                className="w-full rounded-2xl border border-black/10 bg-[var(--background)] px-4 py-3 text-base font-semibold outline-none transition focus:border-[#6f8793] focus:bg-white sm:text-sm"
              >
                <option value="" disabled>
                  {t("report.chooseCategory")}
                </option>
                <option value="fake_profile">{t("report.categoryFake")}</option>
                <option value="inappropriate_content">
                  {t("report.categoryInappropriate")}
                </option>
                <option value="spam_scam">{t("report.categorySpam")}</option>
                <option value="harassment_safety">
                  {t("report.categoryHarassment")}
                </option>
                <option value="privacy">{t("report.categoryPrivacy")}</option>
                <option value="other">{t("report.categoryOther")}</option>
              </select>
            </div>

            <div>
              <label htmlFor="reason" className="mb-2 block text-sm font-bold">
                {t("report.reason")}
              </label>
              <select
                id="reason"
                name="reason"
                required
                defaultValue=""
                className="w-full rounded-2xl border border-black/10 bg-[var(--background)] px-4 py-3 text-base font-semibold outline-none transition focus:border-[#6f8793] focus:bg-white sm:text-sm"
              >
                <option value="" disabled>
                  {t("report.chooseReason")}
                </option>
                <option value="Suspicious or fake profile">
                  {t("report.reasonFake")}
                </option>
                <option value="Inappropriate profile photo or content">
                  {t("report.reasonInappropriate")}
                </option>
                <option value="Spam or scam">{t("report.reasonSpam")}</option>
                <option value="Harassment or unsafe behavior">
                  {t("report.reasonHarassment")}
                </option>
                <option value="Other">{t("report.reasonOther")}</option>
              </select>
            </div>

            <div>
              <label htmlFor="details" className="mb-2 block text-sm font-bold">
                {t("report.details")}
              </label>
              <textarea
                id="details"
                name="details"
                rows={5}
                maxLength={1200}
                placeholder={t("report.detailsPlaceholder")}
                className="w-full resize-none rounded-2xl border border-black/10 bg-[var(--background)] px-4 py-3 text-base font-semibold outline-none transition placeholder:text-[#25302d]/30 focus:border-[#6f8793] focus:bg-white sm:text-sm"
              />
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Link
                href={returnTo}
                prefetch={false}
                className="inline-flex h-12 items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-black text-[#25302d]"
              >
                {t("common.cancel")}
              </Link>
              <button
                type="submit"
                className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--pa-primary)] px-5 text-sm font-black text-[var(--pa-primary-ink)]"
              >
                {t("report.send")}
              </button>
            </div>
          </form>
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
