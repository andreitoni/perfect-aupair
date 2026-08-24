"use client";

import * as Sentry from "@sentry/nextjs";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations();

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-[var(--background)] px-5 py-10 text-[#25302d] sm:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-80px)] max-w-xl items-center">
        <div className="w-full rounded-[2rem] bg-white p-6 text-center shadow-sm ring-1 ring-black/5 sm:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#d95f49]">
            {t("error.title")}
          </p>

          <h1 className="mt-4 text-3xl font-bold tracking-[-0.03em]">
            {t("error.pageLoadTitle")}
          </h1>

          <p className="mt-4 leading-7 text-[#25302d]/60">
            {t("error.pageLoadText")}
          </p>

          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-full bg-[var(--pa-primary)] px-6 py-3 text-sm font-bold text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)]"
            >
              {t("error.tryAgain")}
            </button>

            <a
              href="/auth/home"
              className="rounded-full border border-black/10 px-6 py-3 text-sm font-bold text-[#25302d] transition hover:bg-[var(--background)]"
            >
              {t("common.goHome")}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
