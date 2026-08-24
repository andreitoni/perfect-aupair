import { Header } from "@/components/layout/Header";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { getServerTranslator } from "@/lib/i18n/server";
import Link from "next/link";

export default async function IneligibleAuPairPage() {
  const { t } = await getServerTranslator();

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
      <Header subtitle="onboarding.applicationStatus" authState="public" />

      <section className="mx-auto max-w-2xl px-5 py-16 sm:px-8">
        <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#6f8793]">
            {t("onboarding.applicationStatus")}
          </p>

          <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em]">
            {t("onboarding.ineligibleTitle")}
          </h1>

          <p className="mt-4 leading-7 text-[#25302d]/60">
            {t("onboarding.ineligibleText")}
          </p>

          <p className="mt-4 leading-7 text-[#25302d]/60">
            {t("onboarding.ineligibleContactPrefix")}{" "}
            <Link
              href="/contact"
              className="font-bold text-[#45636f] underline-offset-4 hover:underline"
            >
              {t("onboarding.contactSupport")}
            </Link>
            .
          </p>

          <Link
            href="/"
            className="mt-8 inline-flex rounded-full bg-[var(--pa-primary)] px-6 py-3 text-sm font-bold text-[var(--pa-primary-ink)]"
          >
            {t("onboarding.backToHomepage")}
          </Link>
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
