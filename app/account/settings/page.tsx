import {
  updateAccountSettings,
  updateSocialMediaConsent,
} from "@/app/account/actions";
import { AccountPasswordForm } from "@/components/account/AccountPasswordForm";
import { Header } from "@/components/layout/Header";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { SuccessNotice } from "@/components/ui/SuccessNotice";
import { redirectAdminToDashboard } from "@/lib/admin/access";
import { getServerTranslator } from "@/lib/i18n/server";
import { getPrimaryProfilePhotoUrl } from "@/lib/profile/photos";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your Perfect AuPair account settings.",
};

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ settings?: string; social_media?: string }>;
}) {
  const supabase = await createClient();
  const { t } = await getServerTranslator();
  const params = (await searchParams) ?? {};

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
      .select(
        "account_type, onboarding_completed, new_message_emails_enabled, marketing_emails_enabled, social_media_consent_status, social_media_consent_scope_version",
      )
      .eq("id", user.id)
      .maybeSingle<{
        account_type: "family" | "au_pair" | null;
        onboarding_completed: boolean | null;
        new_message_emails_enabled: boolean | null;
        marketing_emails_enabled: boolean | null;
        social_media_consent_status:
          | "not_asked"
          | "accepted"
          | "declined"
          | null;
        social_media_consent_scope_version: 1 | 2 | null;
      }>(),
    getPrimaryProfilePhotoUrl(supabase, user.id),
  ]);

  if (!profile) {
    redirect("/login");
  }

  if (!profile.onboarding_completed) {
    redirect("/onboarding");
  }

  const settingsSaved = params.settings === "saved";
  const socialMediaSaved = params.social_media === "saved";
  const canManageSocialMediaConsent =
    profile.account_type === "au_pair" || profile.account_type === "family";
  const hasLegacySocialMediaConsent =
    profile.social_media_consent_status === "accepted" &&
    profile.social_media_consent_scope_version === 1;

  return (
    <main className="flex min-h-screen flex-col bg-[var(--background)] text-[#25302d]">
      <Header
        subtitle="account.settings"
        authState="authenticated"
        accountType={profile.account_type}
        initialProfilePhotoUrl={initialProfilePhotoUrl}
      />

      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#6f8793]">
              {t("account.accountEyebrow")}
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-normal sm:text-4xl">
              {t("account.settings")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#25302d]/60">
              {t("account.settingsDescription")}
            </p>
          </div>

          <Link
            href="/account"
            className="inline-flex h-11 w-fit items-center justify-center rounded-full bg-[var(--pa-header-button-bg)] px-5 text-sm font-bold text-[var(--pa-header-button-text)] shadow-sm ring-1 ring-[#c7d1d6]/70 transition hover:bg-[var(--pa-header-button-hover)]"
          >
            {t("common.goBack")}
          </Link>
        </div>

        {settingsSaved ? (
          <SuccessNotice className="mb-5">{t("account.settingsSaved")}</SuccessNotice>
        ) : null}

        {socialMediaSaved ? (
          <SuccessNotice className="mb-5">
            {t("account.socialMediaConsentSaved")}
          </SuccessNotice>
        ) : null}

        <section className="rounded-[1.15rem] bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6">
          <h2 className="text-xl font-black text-[#172426]">
            {t("account.notificationSettings")}
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#25302d]/60">
            {t("account.notificationSettingsText")}
          </p>

          <form action={updateAccountSettings} className="mt-5 space-y-4">
            <label className="flex items-start gap-3 rounded-[1rem] bg-[var(--background)] p-4 text-sm font-semibold leading-6 text-[#25302d]/70 ring-1 ring-black/5">
              <input
                type="checkbox"
                name="new_message_emails_enabled"
                defaultChecked={profile.new_message_emails_enabled ?? true}
                className="mt-1 h-4 w-4 rounded border-[#6f8793]/30 accent-[var(--pa-primary)]"
              />
              <span>{t("account.newMessageEmailsLabel")}</span>
            </label>

            <label className="flex items-start gap-3 rounded-[1rem] bg-[var(--background)] p-4 text-sm font-semibold leading-6 text-[#25302d]/70 ring-1 ring-black/5">
              <input
                type="checkbox"
                name="marketing_emails_enabled"
                defaultChecked={profile.marketing_emails_enabled ?? false}
                className="mt-1 h-4 w-4 rounded border-[#6f8793]/30 accent-[var(--pa-primary)]"
              />
              <span>{t("account.marketingEmailsLabel")}</span>
            </label>

            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--pa-primary)] px-5 text-sm font-bold text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)]"
            >
              {t("account.saveSettings")}
            </button>
          </form>
        </section>

        {canManageSocialMediaConsent ? (
          <section
            id="social-media-consent"
            className="mt-5 scroll-mt-24 rounded-[1.15rem] bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6"
          >
            <h2 className="text-xl font-black text-[#172426]">
              {t("account.socialMediaConsentTitle")}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#25302d]/60">
              {t("account.socialMediaConsentText")}
            </p>

            <form action={updateSocialMediaConsent} className="mt-5 space-y-4">
              <label className="flex items-start gap-3 rounded-[1rem] bg-[var(--background)] p-4 text-sm font-semibold leading-6 text-[#25302d]/70 ring-1 ring-black/5">
                <input
                  type="checkbox"
                  name="social_media_consent"
                  defaultChecked={
                    profile.social_media_consent_status === "accepted"
                  }
                  className="mt-1 h-4 w-4 rounded border-[#6f8793]/30 accent-[var(--pa-primary)]"
                />
                <span>
                  {t(
                    hasLegacySocialMediaConsent
                      ? "account.socialMediaConsentLabelLegacy"
                      : "account.socialMediaConsentLabel",
                  )}
                </span>
              </label>

              <p className="text-xs font-semibold leading-5 text-[#25302d]/55">
                {t("account.socialMediaConsentHelp")}
              </p>

              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--pa-primary)] px-5 text-sm font-bold text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)]"
              >
                {t("account.saveSocialMediaConsent")}
              </button>
            </form>
          </section>
        ) : null}

        <section className="mt-5 rounded-[1.15rem] bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6">
          <h2 className="text-xl font-black text-[#172426]">
            {t("account.changePassword")}
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#25302d]/60">
            {t("account.changePasswordText")}
          </p>
          <AccountPasswordForm />
        </section>

        <section className="mt-5 rounded-[1.15rem] bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6">
          <h2 className="text-xl font-black text-[#9d3f2f]">
            {t("account.deleteAccount")}
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#25302d]/60">
            {t("account.deleteAccountText")}
          </p>
          <Link
            href="/account/delete"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-[#9d3f2f] px-5 text-sm font-bold text-white transition hover:bg-[#843426]"
          >
            {t("account.deleteAccount")}
          </Link>
        </section>
      </section>

      <LegalFooter />
    </main>
  );
}
