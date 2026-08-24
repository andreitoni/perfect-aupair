import { Header } from "@/components/layout/Header";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { redirectAdminToDashboard } from "@/lib/admin/access";
import { getServerTranslator } from "@/lib/i18n/server";
import { getPrimaryProfilePhotoUrl } from "@/lib/profile/photos";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requestAccountDeletion } from "../actions";

export const metadata: Metadata = {
  title: "Delete account",
  description: "Request deletion of your Perfect AuPair account.",
};

export default async function DeleteAccountPage() {
  const supabase = await createClient();
  const { t } = await getServerTranslator();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  redirectAdminToDashboard(user);

  const [{ data: profile }, initialProfilePhotoUrl] = await Promise.all([
    supabase
      .from("profiles")
      .select("account_type")
      .eq("id", user.id)
      .maybeSingle<{ account_type: "family" | "au_pair" | null }>(),
    getPrimaryProfilePhotoUrl(supabase, user.id),
  ]);

  return (
    <main className="flex min-h-screen flex-col bg-[var(--background)] text-[#25302d]">
      <Header
        subtitle="account.deleteAccount"
        authState="authenticated"
        accountType={profile?.account_type ?? null}
        initialProfilePhotoUrl={initialProfilePhotoUrl}
      />

      <section className="mx-auto flex w-full max-w-2xl flex-1 items-center px-4 py-8 sm:px-8">
        <div className="w-full rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#6f8793]">
            {t("account.deleteAccount")}
          </p>

          <h1 className="mt-4 text-3xl font-bold tracking-[-0.03em] sm:text-4xl">
            {t("account.deleteAccount")}
          </h1>

          <p className="mt-4 text-sm font-semibold leading-7 text-[#25302d]/60">
            {t("account.deleteAccountText")}
          </p>

          <form action={requestAccountDeletion} className="mt-6 space-y-5">
            <label className="flex items-start gap-3 rounded-[1.25rem] bg-[#fff5f2] p-4 text-sm font-semibold leading-6 text-[#8f3b2e]/85">
              <input
                type="checkbox"
                name="confirm_delete"
                value="yes"
                required
                className="mt-1 h-4 w-4 rounded border-[#d95f49]/30 accent-[#d95f49]"
              />
              <span>{t("account.deleteAccountConfirm")}</span>
            </label>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Link
                href="/account"
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-center text-sm font-bold text-[#25302d]"
              >
                {t("common.cancel")}
              </Link>

              <button
                type="submit"
                className="rounded-full bg-[#9d3f2f] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#843426]"
              >
                {t("account.deleteAccountButton")}
              </button>
            </div>
          </form>
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
