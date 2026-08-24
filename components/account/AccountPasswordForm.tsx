"use client";

import { useState } from "react";
import { PasswordField } from "@/components/auth/PasswordField";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { SuccessNotice } from "@/components/ui/SuccessNotice";
import { createClient } from "@/lib/supabase/client";

export function AccountPasswordForm() {
  const supabase = createClient();
  const t = useTranslations();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (password.length < 8) {
      setError(t("auth.passwordMinLength"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("auth.passwordsDoNotMatch"));
      return;
    }

    setIsSaving(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setMessage(t("auth.passwordUpdated"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-4">
      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="rounded-[1rem] bg-red-50 p-4 text-sm font-semibold text-red-700"
        >
          {error}
        </div>
      ) : null}

      {message ? (
        <SuccessNotice>{message}</SuccessNotice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="settings-password" className="mb-2 block text-sm font-bold">
            {t("auth.newPassword")}
          </label>
          <PasswordField
            id="settings-password"
            name="settings-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isSaving}
            autoComplete="new-password"
            className="w-full rounded-[1rem] border border-black/10 bg-[var(--background)] px-4 py-3 text-base font-semibold outline-none transition placeholder:text-[#25302d]/30 focus:border-[#6f8793] focus:bg-white disabled:cursor-wait disabled:opacity-70"
          />
        </div>

        <div>
          <label
            htmlFor="settings-confirm-password"
            className="mb-2 block text-sm font-bold"
          >
            {t("auth.confirmPassword")}
          </label>
          <PasswordField
            id="settings-confirm-password"
            name="settings-confirm-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={isSaving}
            autoComplete="new-password"
            className="w-full rounded-[1rem] border border-black/10 bg-[var(--background)] px-4 py-3 text-base font-semibold outline-none transition placeholder:text-[#25302d]/30 focus:border-[#6f8793] focus:bg-white disabled:cursor-wait disabled:opacity-70"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isSaving}
        className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--pa-primary)] px-5 text-sm font-bold text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSaving ? t("auth.saving") : t("auth.updatePassword")}
      </button>
    </form>
  );
}
