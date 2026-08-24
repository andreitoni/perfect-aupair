import { EmailCodeConfirmationForm } from "@/components/auth/EmailCodeConfirmationForm";
import { Header } from "@/components/layout/Header";
import { getServerTranslator } from "@/lib/i18n/server";
import { loginHref, safeAuthReturnTo } from "@/lib/auth/return-to";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Check your email",
  robots: { index: false, follow: false },
};

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string | string[] }>;
}) {
  const { t } = await getServerTranslator();
  const returnTo = safeAuthReturnTo((await searchParams)?.returnTo);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
      <Header subtitle="auth.confirmEmail" />

      <section className="mx-auto flex min-h-[calc(100vh-74px)] max-w-2xl items-center px-5 py-10 sm:px-8">
        <div className="w-full rounded-[2rem] bg-white p-6 text-center shadow-sm ring-1 ring-black/5 sm:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#6f8793]">
            {t("auth.almostThere")}
          </p>

          <h1 className="mt-4 text-3xl font-bold tracking-[-0.03em]">
            {t("auth.checkEmail")}
          </h1>

          <p className="mt-4 leading-7 text-[#25302d]/60">
            {t("auth.checkEmailText")}
          </p>

          <EmailCodeConfirmationForm returnTo={returnTo} />

          <Link
            href={loginHref(returnTo)}
            className="mt-7 inline-flex rounded-full border border-black/10 bg-white px-6 py-3 text-sm font-bold text-[#25302d] shadow-sm transition hover:bg-[#f7f3ed]"
          >
            {t("auth.backToLogin")}
          </Link>
        </div>
      </section>
    </main>
  );
}
