"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { authHomeHref } from "@/lib/auth/return-to";
import {
  readBrowserStorage,
  removeBrowserStorage,
  writeBrowserStorage,
} from "@/lib/browser/storage";

const PENDING_EMAIL_KEY = "pa_pending_confirmation_email";
const RESEND_COOLDOWN_PREFIX = "pa_confirmation_resend_after:";
const RESEND_COOLDOWN_SECONDS = 60;

function readStoredEmail() {
  if (typeof window === "undefined") {
    return "";
  }

  return readBrowserStorage("sessionStorage", PENDING_EMAIL_KEY) ?? "";
}

function cooldownKey(email: string) {
  return `${RESEND_COOLDOWN_PREFIX}${email.toLowerCase()}`;
}

function readCooldownSeconds(email: string) {
  if (typeof window === "undefined" || !email) {
    return 0;
  }

  const savedTimestamp = readBrowserStorage("localStorage", cooldownKey(email));
  const resendAfter = Number(savedTimestamp ?? 0);
  return Math.max(0, Math.ceil((resendAfter - Date.now()) / 1000));
}

export function EmailCodeConfirmationForm({
  returnTo,
}: {
  returnTo?: string | null;
}) {
  const t = useTranslations();
  const codeInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<"email" | "code" | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [canReadClipboard, setCanReadClipboard] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const storedEmail = readStoredEmail();

    const setup = window.setTimeout(() => {
      setEmail((current) => current || storedEmail);
      setCooldown(readCooldownSeconds(storedEmail.trim().toLowerCase()));
      setCanReadClipboard(Boolean(navigator.clipboard?.readText));
      codeInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(setup);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldown]);

  function startCooldown(
    normalizedEmail: string,
    seconds = RESEND_COOLDOWN_SECONDS,
  ) {
    const cooldownSeconds = Math.max(RESEND_COOLDOWN_SECONDS, seconds);
    const resendAfter = Date.now() + cooldownSeconds * 1000;
    writeBrowserStorage(
      "localStorage",
      cooldownKey(normalizedEmail),
      String(resendAfter),
    );
    setCooldown(cooldownSeconds);
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.replace(/\D/g, "");

    setMessage("");
    setError("");
    setErrorField(null);

    if (!normalizedEmail) {
      setError(t("auth.emailRequired"));
      setErrorField("email");
      return;
    }

    if (normalizedCode.length !== 6) {
      setError(t("auth.confirmationCodeRequired"));
      setErrorField("code");
      return;
    }

    setIsVerifying(true);

    try {
      const response = await fetch("/auth/verify-email-code", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          returnTo,
          token: normalizedCode,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; redirectTo?: string }
        | null;

      if (!response.ok) {
        setError(payload?.error ?? t("auth.confirmationCodeInvalid"));
        setErrorField("code");
        return;
      }

      removeBrowserStorage("sessionStorage", PENDING_EMAIL_KEY);
      window.location.replace(payload?.redirectTo ?? authHomeHref(returnTo));
    } catch {
      setError(t("error.pageLoadText"));
      setErrorField(null);
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    const normalizedEmail = email.trim().toLowerCase();

    setMessage("");
    setError("");
    setErrorField(null);

    if (!normalizedEmail) {
      setError(t("auth.emailRequired"));
      setErrorField("email");
      return;
    }

    if (cooldown > 0) {
      return;
    }

    setIsResending(true);

    try {
      const response = await fetch("/auth/resend-confirmation-code", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          returnTo,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; retryAfterSeconds?: number }
        | null;

      if (!response.ok) {
        if (response.status === 429) {
          startCooldown(
            normalizedEmail,
            payload?.retryAfterSeconds ?? RESEND_COOLDOWN_SECONDS,
          );
          setError(t("auth.confirmationEmailRateLimited"));
          return;
        }

        setError(payload?.error ?? t("auth.loginFailed"));
        return;
      }

      setMessage(t("auth.confirmationCodeResent"));
      startCooldown(
        normalizedEmail,
        payload?.retryAfterSeconds ?? RESEND_COOLDOWN_SECONDS,
      );
    } catch {
      setError(t("error.pageLoadText"));
    } finally {
      setIsResending(false);
    }
  }

  async function handlePasteCode() {
    codeInputRef.current?.focus();

    if (!navigator.clipboard?.readText) {
      return;
    }

    setMessage("");
    setError("");
    setErrorField(null);

    try {
      const clipboardText = await navigator.clipboard.readText();
      const pastedCode = clipboardText.replace(/\D/g, "").slice(0, 6);

      if (pastedCode.length !== 6) {
        setError(t("auth.clipboardCodeMissing"));
        return;
      }

      setCode(pastedCode);
    } catch {
      setError(t("auth.clipboardCodeDenied"));
    }
  }

  return (
    <div className="mt-7 text-left">
      {error ? (
        <div
          id="confirmation-form-error"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="mb-4 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700"
        >
          {error}
        </div>
      ) : null}

      {message ? (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="mb-4 rounded-2xl bg-[#eef4f6] p-4 text-sm font-semibold text-[#25302d]/70"
        >
          {message}
        </div>
      ) : null}

      <form onSubmit={handleVerify} className="space-y-4">
        <div>
          <label htmlFor="confirmation-email" className="mb-2 block text-sm font-bold">
            {t("common.email")}
          </label>
          <input
            id="confirmation-email"
            type="email"
            value={email}
            onChange={(event) => {
              const nextEmail = event.target.value;
              setEmail(nextEmail);
              setCooldown(readCooldownSeconds(nextEmail.trim().toLowerCase()));
              if (errorField === "email") {
                setError("");
                setErrorField(null);
              }
            }}
            autoComplete="email"
            aria-invalid={errorField === "email" || undefined}
            aria-describedby={
              errorField === "email" ? "confirmation-form-error" : undefined
            }
            className="w-full rounded-2xl border border-black/10 bg-[var(--background)] px-4 py-3 text-base font-semibold outline-none transition placeholder:text-[#25302d]/30 focus:border-[#6f8793] focus:bg-white"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label htmlFor="confirmation-code" className="block text-sm font-bold">
              {t("auth.confirmationCode")}
            </label>
            {canReadClipboard ? (
              <button
                type="button"
                onClick={handlePasteCode}
                className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-bold text-[#25302d] shadow-sm transition hover:bg-[#f7f3ed]"
              >
                {t("auth.pasteCode")}
              </button>
            ) : null}
          </div>
          <input
            ref={codeInputRef}
            id="confirmation-code"
            name="one-time-code"
            type="text"
            data-clarity-mask="true"
            data-hj-suppress=""
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
              if (errorField === "code") {
                setError("");
                setErrorField(null);
              }
            }}
            placeholder={t("auth.confirmationCodePlaceholder")}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            pattern="[0-9]*"
            enterKeyHint="done"
            aria-label={t("auth.confirmationCode")}
            aria-invalid={errorField === "code" || undefined}
            aria-describedby={
              errorField === "code" ? "confirmation-form-error" : undefined
            }
            maxLength={6}
            className="w-full rounded-2xl border border-black/10 bg-[var(--background)] px-4 py-3 text-center text-2xl font-black tracking-[0.35em] outline-none transition placeholder:tracking-normal placeholder:text-base placeholder:font-semibold placeholder:text-[#25302d]/30 focus:border-[#6f8793] focus:bg-white"
          />
        </div>

        <button
          type="submit"
          disabled={isVerifying}
          className="w-full rounded-2xl bg-[var(--pa-primary)] px-5 py-4 text-sm font-bold text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isVerifying ? t("auth.verifyingCode") : t("auth.verifyCode")}
        </button>
      </form>

      <div className="mt-5 text-center">
        <p className="text-sm font-semibold text-[#25302d]/55">
          {t("auth.didNotReceiveCode")}
        </p>
        <button
          type="button"
          onClick={handleResend}
          disabled={isResending || cooldown > 0}
          className="mt-2 text-sm font-bold text-[#25302d] underline decoration-[#25302d]/25 underline-offset-4 transition hover:decoration-[#25302d] disabled:cursor-not-allowed disabled:text-[#25302d]/35"
        >
          {cooldown > 0
            ? t("auth.resendCodeIn", { seconds: String(cooldown) })
            : isResending
              ? t("auth.sending")
              : t("auth.resendCode")}
        </button>
      </div>
    </div>
  );
}
