import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Header } from "@/components/layout/Header";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { getServerTranslator } from "@/lib/i18n/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new password for your Perfect AuPair account.",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  const { t } = await getServerTranslator();

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
      <Header subtitle="auth.setNewPassword" />

      <section className="mx-auto flex min-h-[calc(100vh-180px)] max-w-xl items-center px-4 py-8 sm:px-8">
        <div className="w-full rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-black/5 sm:rounded-[2rem] sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-[#6f8793]">
            {t("auth.passwordReset")}
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em]">
            {t("auth.setNewPassword")}
          </h1>

          <p className="mt-3 text-sm font-semibold leading-6 text-[#25302d]/58">
            {t("auth.setNewPasswordText")}
          </p>

          <ResetPasswordForm />
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
