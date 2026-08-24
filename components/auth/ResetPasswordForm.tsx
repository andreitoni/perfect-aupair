"use client";

import { useState } from "react";
import { PasswordField } from "@/components/auth/PasswordField";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { SuccessNotice } from "@/components/ui/SuccessNotice";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
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

      setMessage(t("auth.passwordUpdated"));
      window.setTimeout(() => {
        window.location.replace("/auth/home");
      }, 700);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700"
        >
          {error}
        </div>
      ) : null}

      {message ? (
        <SuccessNotice>{message}</SuccessNotice>
      ) : null}

      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-bold">
          {t("auth.newPassword")}
        </label>
        <PasswordField
          id="password"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={isSaving}
          autoComplete="new-password"
          className="w-full rounded-2xl border border-black/10 bg-[var(--background)] px-4 py-3 text-base font-semibold outline-none transition placeholder:text-[#25302d]/30 focus:border-[#6f8793] focus:bg-white disabled:cursor-wait disabled:opacity-70 sm:text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="confirm-password"
          className="mb-2 block text-sm font-bold"
        >
          {t("auth.confirmPassword")}
        </label>
        <PasswordField
          id="confirm-password"
          name="confirm-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          disabled={isSaving}
          autoComplete="new-password"
          className="w-full rounded-2xl border border-black/10 bg-[var(--background)] px-4 py-3 text-base font-semibold outline-none transition placeholder:text-[#25302d]/30 focus:border-[#6f8793] focus:bg-white disabled:cursor-wait disabled:opacity-70 sm:text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={isSaving}
        className="w-full rounded-2xl bg-[var(--pa-primary)] px-5 py-4 text-sm font-bold text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSaving ? t("auth.saving") : t("auth.updatePassword")}
      </button>
    </form>
  );
}
