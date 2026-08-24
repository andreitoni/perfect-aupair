import type { Metadata } from "next";
import { LogoMark } from "@/components/brand/LogoMark";
import { getServerTranslator } from "@/lib/i18n/server";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Maintenance",
  description:
    "Perfect AuPair is temporarily unavailable while we resolve a technical issue.",
  alternates: {
    canonical: `${SITE_URL}/maintenance`,
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function MaintenancePage() {
  const { t } = await getServerTranslator();

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
      <section className="mx-auto flex min-h-[calc(100vh-88px)] max-w-5xl items-center px-4 py-10 sm:px-8">
        <div className="w-full rounded-[1.75rem] bg-white p-6 shadow-sm ring-1 ring-black/5 sm:rounded-[2.25rem] sm:p-10">
          <div className="flex items-center gap-3">
            <LogoMark decorative className="h-16 w-16" />

            <div>
              <p className="text-lg font-black tracking-tight">
                Perfect AuPair
              </p>
              <p className="text-sm font-semibold text-[#25302d]/45">
                {t("app.subtitle")}
              </p>
            </div>
          </div>

          <div className="mt-10 max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#6f8793]">
              {t("maintenance.title")}
            </p>

            <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-6xl">
              {t("maintenance.soonTitle")}
            </h1>

            <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-[#25302d]/58 sm:text-lg">
              {t("maintenance.longDescription")}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
