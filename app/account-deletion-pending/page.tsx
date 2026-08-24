import { LegalFooter } from "@/components/layout/LegalFooter";
import { getServerTranslator } from "@/lib/i18n/server";
import { sendPendingAccountDeletionConfirmation } from "@/lib/privacy/send-account-deletion-confirmations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { ReactivateAccountForm } from "./ReactivateAccountForm";
import { reactivateAccount } from "./actions";

export const metadata: Metadata = {
  title: "Account deletion scheduled",
  description: "Your Perfect AuPair account is scheduled for deletion.",
  robots: { index: false, follow: false },
};

export default async function AccountDeletionPendingPage() {
  const supabase = await createClient();
  const { t } = await getServerTranslator();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let hasPendingDeletion = false;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("deletion_requested_at")
      .eq("id", user.id)
      .maybeSingle<{ deletion_requested_at: string | null }>();

    hasPendingDeletion = Boolean(profile?.deletion_requested_at);

    if (!hasPendingDeletion) {
      redirect("/auth/home");
    }

    const profileId = user.id;
    const fallbackEmail = user.email ?? null;

    after(async () => {
      try {
        await sendPendingAccountDeletionConfirmation({
          supabase: createAdminClient(),
          profileId,
          fallbackEmail,
        });
      } catch (error) {
        console.error(
          "Could not retry account deletion confirmation email.",
          error,
        );
      }
    });
  }

  return (
    <main className="flex min-h-screen flex-col bg-[var(--background)] text-[#25302d]">
      <section className="mx-auto flex w-full max-w-2xl flex-1 items-center px-4 py-8 sm:px-8">
        <div className="w-full rounded-[2rem] bg-white p-6 text-center shadow-sm ring-1 ring-black/5 sm:p-8">
          <h1 className="text-3xl font-bold tracking-[-0.03em] sm:text-4xl">
            {t("account.deletionPendingTitle")}
          </h1>
          <div className="mt-7 flex justify-center">
            {hasPendingDeletion ? (
              <ReactivateAccountForm
                action={reactivateAccount}
                reactivateLabel={t("account.reactivateAccount")}
                reactivatingLabel={t("account.reactivatingAccount")}
              />
            ) : (
              <Link
                href="/login?mode=login"
                className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--pa-primary)] px-6 text-sm font-black text-[var(--pa-primary-ink)] shadow-sm transition hover:bg-[var(--pa-primary-hover)]"
              >
                {t("account.reactivateAccount")}
              </Link>
            )}
          </div>
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
