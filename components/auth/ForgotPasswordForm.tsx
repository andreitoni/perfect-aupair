"use client";

import { useState } from "react";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { TurnstileChallenge } from "@/components/security/TurnstileChallenge";

export function ForgotPasswordForm() {
  const t = useTranslations();

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [challengeRequired, setChallengeRequired] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileRefreshKey, setTurnstileRefreshKey] = useState(0);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setError("");
    setEmailInvalid(false);

    if (!email.trim()) {
      setError(t("auth.emailRequired"));
      setEmailInvalid(true);
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch("/auth/request-password-reset", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          turnstileToken,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; challengeRequired?: boolean }
        | null;

      if (!response.ok) {
        if (payload?.challengeRequired) {
          setChallengeRequired(true);
          setTurnstileToken("");
          setTurnstileRefreshKey((current) => current + 1);
        } else {
          setEmailInvalid(true);
        }

        setError(payload?.error ?? t("auth.emailCannotBeUsed"));
        return;
      }

      setMessage(t("auth.resetLinkSent"));
      setEmailInvalid(false);
    } catch {
      setEmailInvalid(false);
      setError(`${t("auth.emailCannotBeUsed")} ${t("error.tryAgain")}`);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      {error ? (
        <div
          id="forgot-password-error"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700"
        >
          {error}
        </div>
      ) : null}

      {message ? (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="rounded-2xl bg-[#eef4f6] p-4 text-sm font-semibold text-[#25302d]/70"
        >
          {message}
        </div>
      ) : null}

      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-bold">
          {t("common.email")}
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (emailInvalid) {
              setEmailInvalid(false);
              setError("");
            }
          }}
          autoComplete="email"
          aria-invalid={emailInvalid || undefined}
          aria-describedby={
            emailInvalid ? "forgot-password-error" : undefined
          }
          className="w-full rounded-2xl border border-black/10 bg-[var(--background)] px-4 py-3 text-base font-semibold outline-none transition placeholder:text-[#25302d]/30 focus:border-[#6f8793] focus:bg-white sm:text-sm"
        />
      </div>

      {challengeRequired ? (
        <TurnstileChallenge
          refreshKey={turnstileRefreshKey}
          onToken={setTurnstileToken}
        />
      ) : null}

      <button
        type="submit"
        disabled={isSending}
        className="w-full rounded-2xl bg-[var(--pa-primary)] px-5 py-4 text-sm font-bold text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSending ? t("auth.sending") : t("auth.sendResetLink")}
      </button>
    </form>
  );
}
