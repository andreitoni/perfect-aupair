"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { OnboardingProfile } from "@/components/onboarding/OnboardingForm";
import { PasswordField } from "@/components/auth/PasswordField";
import { registerWithOnboarding } from "@/app/login/actions";
import { LogoMark } from "@/components/brand/LogoMark";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { PublicSimpleHeader } from "@/components/layout/PublicSimpleHeader";
import { TurnstileChallenge } from "@/components/security/TurnstileChallenge";
import { trackFunnelEvent } from "@/lib/analytics/client";
import { friendlyAuthErrorMessage } from "@/lib/auth/errors";
import {
  authHomeHref,
  safeAuthReturnTo,
  withAuthReturnTo,
} from "@/lib/auth/return-to";
import { writeBrowserStorage } from "@/lib/browser/storage";
import {
  childrenOptions,
  countries,
  languageOptions,
  nationalities,
  phoneCountryCodes,
  religionOptions,
  smokingOptions,
} from "@/lib/profile-options";
import { useTranslations } from "@/components/i18n/I18nProvider";

const OnboardingForm = dynamic(() =>
  import("@/components/onboarding/OnboardingForm").then(
    (module) => module.OnboardingForm,
  ),
);

type AuthMode = "login" | "register";
type UserType = "family" | "au_pair";
type RegistrationStep = "account_type" | "method" | "profile";
type LoginPageClientProps = {
  initialAuthState?: string;
  initialError?: string;
  initialMode?: AuthMode;
  initialReturnTo?: string;
  initialUserType?: UserType;
};

const isGoogleAuthFeatureEnabled =
  process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH !== "false";
const isFacebookAuthEnabled =
  process.env.NEXT_PUBLIC_ENABLE_FACEBOOK_AUTH === "true";

function createRegistrationProfile(accountType: UserType): OnboardingProfile {
  return {
    account_type: accountType,
    onboarding_completed: false,
    first_name: null,
    last_name: null,
    full_name: null,
    date_of_birth: null,
    gender: null,
    street_address: null,
    phone_country_code: null,
    phone_number: null,
    country: null,
    city: null,
    nationality: null,
    preferred_host_countries: null,
    religion: null,
    already_in_germany: null,
    has_drivers_license: null,
    has_childcare_experience: null,
    has_infant_experience: null,
    has_first_aid: null,
    will_care_for_elderly: null,
    will_care_for_pets: null,
    mother_tongue: null,
    fluent_languages: null,
    basic_languages: null,
    availability_start: null,
    availability_start_from: null,
    availability_start_to: null,
    duration: null,
    duration_min_months: null,
    duration_max_months: null,
    smoking_status: null,
    bio: null,
    children_info: null,
    au_pair_allowance_amount: null,
    au_pair_allowance_currency: null,
    accommodation_info: null,
    expectations: null,
  };
}

function normalizeUserType(value: string | null | undefined): UserType | null {
  if (value === "family" || value === "au_pair") {
    return value;
  }

  return null;
}

function getBrowserInitialAuthState() {
  if (typeof window === "undefined") {
    return {
      authState: "",
      mode: "login" as AuthMode,
      userType: "family" as UserType,
      error: "",
      returnTo: null,
    };
  }

  const searchParams = new URL(window.location.href).searchParams;
  const authState = searchParams.get("auth");
  const error = searchParams.get("error");
  const returnTo = safeAuthReturnTo(searchParams.get("returnTo"));
  const initialUserType = normalizeUserType(
    searchParams.get("accountType") ?? searchParams.get("account_type"),
  );

  return {
    authState: authState ?? "",
    mode: (searchParams.get("mode") === "register"
      ? "register"
      : "login") as AuthMode,
    userType: initialUserType ?? "family",
    error: error ?? "",
    returnTo,
  };
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.29h6.47c-.28 1.5-1.13 2.77-2.41 3.62v3.01h3.9c2.28-2.1 3.53-5.19 3.53-8.65z"
        fill="#4285F4"
      />
      <path
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.9-3.01c-1.08.72-2.46 1.15-4.05 1.15-3.12 0-5.77-2.11-6.72-4.95H1.25v3.11A12 12 0 0 0 12 24z"
        fill="#34A853"
      />
      <path
        d="M5.28 14.28A7.21 7.21 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.61H1.25A12 12 0 0 0 0 12c0 1.93.46 3.75 1.25 5.39l4.03-3.11z"
        fill="#FBBC05"
      />
      <path
        d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.45-3.45C17.96 1.18 15.24 0 12 0A12 12 0 0 0 1.25 6.61l4.03 3.11C6.23 6.88 8.88 4.77 12 4.77z"
        fill="#EA4335"
      />
    </svg>
  );
}

function RegistrationOverview({
  accent,
  steps,
}: {
  accent: "family" | "au_pair";
  steps: string[];
}) {
  const activeClass =
    accent === "au_pair"
      ? "border-[#f2b58f] bg-[#fde8dc] text-[#25302d]"
      : "border-[#9ebbc7] bg-[#e7f1f5] text-[#25302d]";

  return (
    <ol className="mt-6 grid grid-cols-4 gap-1">
      {steps.map((step, index) => (
        <li
          key={`${step}-${index}`}
          className="relative flex min-w-0 flex-col items-center text-center"
        >
          {index < steps.length - 1 ? (
            <span
              aria-hidden="true"
              className="absolute left-[calc(50%+1.45rem)] right-[calc(-50%+0.9rem)] top-6 border-t border-dashed border-[#25302d]/18"
            />
          ) : null}
          <span
            className={`relative z-[1] flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-base font-black shadow-sm ${
              index === 0
                ? activeClass
                : "border-transparent bg-[#edf0f2] text-[#25302d]/62"
            }`}
          >
            {index + 1}
          </span>
          <span className="mt-2 min-h-9 max-w-[4.7rem] text-[0.68rem] font-bold leading-4 text-[#25302d]/72 sm:max-w-none sm:text-xs">
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}

function LoginLoadingOverlay({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/82 px-5 backdrop-blur-md">
      <div
        role="status"
        aria-live="polite"
        className="w-full max-w-[20rem] overflow-hidden rounded-[1.35rem] border border-[#d8e6eb] bg-white p-5 text-center shadow-2xl shadow-[#6f8793]/15 ring-1 ring-white/70"
      >
        <div
          aria-hidden="true"
          className="relative mx-auto h-28 w-full max-w-[14rem]"
        >
          <div className="absolute left-4 right-4 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-[#e7f1f5]">
            <span className="pa-login-loader-runner absolute inset-y-0 left-0 w-14 rounded-full bg-[#f2b58f]" />
          </div>

          <div className="pa-login-loader-node pa-login-loader-node--left absolute left-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#f2c4aa] bg-[#fde8dc] text-sm font-black text-[#263f45] shadow-sm">
            A
          </div>
          <div className="pa-login-loader-node pa-login-loader-node--right absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#c8dde5] bg-[#e7f1f5] text-sm font-black text-[#263f45] shadow-sm">
            F
          </div>

          <div className="pa-login-loader-mark absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-lg shadow-[#6f8793]/20 ring-1 ring-black/10">
            <LogoMark decorative className="h-12 w-12" />
          </div>
        </div>

        <p className="mt-1 text-base font-black text-[#263f45]">{title}</p>
        <p className="mx-auto mt-2 max-w-[15rem] text-sm font-semibold leading-5 text-[#263f45]/62">
          {text}
        </p>

        <div
          aria-hidden="true"
          className="mt-5 h-2 overflow-hidden rounded-full bg-[#edf3f6]"
        >
          <span className="pa-login-loader-progress block h-full rounded-full bg-[#9ebbc7]" />
        </div>
      </div>
    </div>
  );
}

export function LoginPageClient({
  initialAuthState: initialAuthStateParam,
  initialError,
  initialMode,
  initialReturnTo,
  initialUserType,
}: LoginPageClientProps = {}) {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [initialAuthState] = useState(() => {
    const browserState = getBrowserInitialAuthState();

    return {
      authState: initialAuthStateParam ?? browserState.authState,
      mode: initialMode ?? browserState.mode,
      userType: initialUserType ?? browserState.userType,
      error: initialError ?? browserState.error,
      returnTo: initialReturnTo ?? browserState.returnTo,
    };
  });
  const [userType, setUserType] = useState<UserType>(initialAuthState.userType);
  const [registrationStep, setRegistrationStep] =
    useState<RegistrationStep>("account_type");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [authChallengeRequired, setAuthChallengeRequired] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileRefreshKey, setTurnstileRefreshKey] = useState(0);
  const [message, setMessage] = useState(
    initialAuthState.authState === "failed"
      ? t("auth.loginFailed")
      : initialAuthState.authState === "google_choose_account_type"
        ? t("auth.googleChooseAccountType")
        : "",
  );
  const [error, setError] = useState(
    initialAuthState.authState === "oauth_failed"
      ? t("auth.loginFailed")
      : initialAuthState.error,
  );
  const [isLoading, setIsLoading] = useState(false);

  const requestedMode =
    searchParams.get("mode") === "register"
      ? "register"
      : searchParams.get("mode") === "login"
        ? "login"
        : initialAuthState.mode;
  const requestedUserType = normalizeUserType(
    searchParams.get("accountType") ?? searchParams.get("account_type"),
  );
  const returnTo = safeAuthReturnTo(
    searchParams.get("returnTo") ?? initialAuthState.returnTo,
  );
  const mode: AuthMode = requestedUserType ? "register" : requestedMode;
  const isRegister = mode === "register";
  const authErrorId = "auth-form-error";
  const authStatusId = "auth-form-status";
  const credentialsInvalid = error === t("auth.emailPasswordRequired");
  const termsConsentInvalid = error === t("auth.acceptTermsRequired");
  const messageIsError = initialAuthState.authState === "failed";
  const isGoogleAuthEnabled = isRegister || isGoogleAuthFeatureEnabled;
  const hasSocialAuth = isGoogleAuthEnabled || isFacebookAuthEnabled;
  const authTitle = !isRegister
    ? t("auth.welcomeBack")
    : registrationStep === "method"
      ? userType === "au_pair"
        ? t("auth.freeAuPairRegistration")
        : t("auth.freeFamilyRegistration")
      : t("auth.chooseAccountTypeTitle");
  const registerMethodSteps =
    userType === "au_pair"
      ? [
          t("onboarding.identity"),
          t("onboarding.matchDetails"),
          t("onboarding.experienceLanguages"),
          t("common.introduction"),
        ]
      : [
          t("onboarding.familyIdentity"),
          t("onboarding.matchDetails"),
          t("onboarding.homeDetails"),
          t("common.familyIntroduction"),
        ];

  function switchMode(nextMode: AuthMode) {
    setError("");
    setMessage("");
    setAuthChallengeRequired(false);
    setTurnstileToken("");
    setRegistrationStep("account_type");
    router.replace(withAuthReturnTo(`/login?mode=${nextMode}`, returnTo), {
      scroll: false,
    });
  }

  async function completeServerLogin(loginEmail: string, loginPassword: string) {
    const response = await fetch("/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: loginEmail,
        password: loginPassword,
        returnTo,
        turnstileToken,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          error?: string;
          challengeRequired?: boolean;
          redirectTo?: string;
        }
      | null;

    if (!response.ok) {
      if (payload?.challengeRequired) {
        setAuthChallengeRequired(true);
        setTurnstileToken("");
        setTurnstileRefreshKey((current) => current + 1);
      }

      setError(payload?.error ?? t("auth.loginFailed"));
      return false;
    }

    window.location.replace(payload?.redirectTo ?? authHomeHref(returnTo));
    return true;
  }

  async function handleEmailAuth(event: React.FormEvent<HTMLFormElement>) {
    setError("");
    setMessage("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      event.preventDefault();
      setError(t("auth.emailPasswordRequired"));
      return;
    }

    event.preventDefault();
    setIsLoading(true);

    try {
      const didStartRedirect = await completeServerLogin(
        normalizedEmail,
        password,
      );

      if (!didStartRedirect) {
        setIsLoading(false);
      }
    } catch {
      setError(t("auth.loginFailed"));
      setIsLoading(false);
    }
  }

  async function completeRegistrationFromProfile(formData: FormData) {
    setError("");
    setMessage("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return { error: t("auth.emailPasswordRequired") };
    }

    if (!acceptedTerms) {
      return { error: t("auth.acceptTermsRequired") };
    }

    trackFunnelEvent("signup_submitted", {
      account_type: userType,
    });

    const submissionData = new FormData();

    formData.forEach((value, key) => {
      submissionData.append(key, value);
    });
    submissionData.set("registration_email", normalizedEmail);
    submissionData.set("registration_password", password);
    submissionData.set("accepted_terms", "yes");
    if (returnTo) {
      submissionData.set("return_to", returnTo);
    }
    submissionData.set("turnstile_token", turnstileToken);

    const result = await registerWithOnboarding(submissionData);

    if (result.error === "This au pair account is not eligible") {
      router.replace("/onboarding/ineligible");
      return;
    }

    if (result.error) {
      if (result.challengeRequired) {
        setAuthChallengeRequired(true);
        setTurnstileToken("");
        setTurnstileRefreshKey((current) => current + 1);
      }

      return { error: result.error };
    }

    trackFunnelEvent("signup_created", {
      account_type: userType,
    });

    const confirmationEmail = result.email ?? normalizedEmail;

    writeBrowserStorage(
      "sessionStorage",
      "pa_pending_confirmation_email",
      confirmationEmail,
    );
    writeBrowserStorage(
      "localStorage",
      `pa_confirmation_resend_after:${confirmationEmail}`,
      String(Date.now() + 60 * 1000),
    );
    router.push(withAuthReturnTo("/check-email", returnTo));
  }

  function handleStartRegistration() {
    setError("");
    setMessage("");

    if (!acceptedTerms) {
      setError(t("auth.acceptTermsRequired"));
      return;
    }

    trackFunnelEvent("signup_profile_step_started", {
      account_type: userType,
    });
    setRegistrationStep("profile");
  }

  function handleSelectAccountType(nextUserType: UserType) {
    setError("");
    setMessage("");
    setUserType(nextUserType);
    setRegistrationStep("method");
    trackFunnelEvent("signup_account_type_selected", {
      account_type: nextUserType,
    });
  }

  async function handleOAuth(provider: "google" | "facebook") {
    setError("");
    setMessage("");

    if (provider === "google") {
      if (isRegister && !acceptedTerms) {
        setError(t("auth.acceptTermsRequired"));
        return;
      }

      const params = new URLSearchParams({ mode });

      if (isRegister) {
        params.set("account_type", userType);
      }

      if (returnTo) {
        params.set("returnTo", returnTo);
      }

      setIsLoading(true);
      trackFunnelEvent(isRegister ? "signup_oauth_started" : "login_oauth_started", {
        provider,
        account_type: isRegister ? userType : undefined,
      });
      // OAuth must use a top-level navigation so the browser follows the external redirect.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/auth/oauth/google?${params.toString()}`);
      return;
    }

    setIsLoading(true);
    trackFunnelEvent(isRegister ? "signup_oauth_started" : "login_oauth_started", {
      provider,
      account_type: isRegister ? userType : undefined,
    });

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}${withAuthReturnTo(
            "/auth/callback",
            returnTo,
          )}`,
        },
      });

      if (!oauthError) return;

      setError(friendlyAuthErrorMessage(oauthError.message));
      setIsLoading(false);
    } catch {
      setError(t("auth.loginFailed"));
      setIsLoading(false);
    }
  }

  const termsConsentField = (
    <div className="pa-consent-field mt-4 flex items-start gap-3 rounded-2xl border border-transparent bg-white p-4 transition">
      <input
        id="accepted_terms"
        type="checkbox"
        name="accepted_terms"
        value="yes"
        data-error-label={t("legal.terms")}
        data-error-message={t("auth.acceptTermsRequired")}
        checked={acceptedTerms}
        aria-labelledby="accepted-terms-copy"
        aria-invalid={termsConsentInvalid || undefined}
        aria-describedby={termsConsentInvalid ? authErrorId : undefined}
        onChange={(event) => {
          setAcceptedTerms(event.target.checked);
          setError("");
        }}
        required
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-black/20 accent-[#6f8793]"
      />
      <p
        id="accepted-terms-copy"
        className="text-sm font-semibold leading-6 text-[#25302d]/65"
      >
        <label htmlFor="accepted_terms" className="cursor-pointer">
          {t("auth.acceptTerms")}
        </label>{" "}
        <Link
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="font-black text-[#45636f] underline-offset-4 hover:underline"
        >
          {t("legal.terms")}
        </Link>{" "}
        {t("auth.and")}{" "}
        <Link
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="font-black text-[#45636f] underline-offset-4 hover:underline"
        >
          {t("legal.privacy")}
        </Link>
        <span className="text-[#d95f49]"> *</span>
        .
      </p>
    </div>
  );

  const registrationAuthFields = isRegister ? (
    <div className="rounded-[1.25rem] border border-black/10 bg-[var(--background)] p-4 sm:p-5">
      <h2 className="text-lg font-bold tracking-[-0.02em]">
        {t("auth.createAccount")}
      </h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="registration_email"
            className="mb-2 block text-sm font-bold"
          >
            {t("common.email")}
          </label>
          <input
            id="registration_email"
            name="registration_email"
            type="email"
            data-error-label={t("common.email")}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError("");
            }}
            autoComplete="email"
            required
            aria-invalid={credentialsInvalid || undefined}
            aria-describedby={credentialsInvalid ? authErrorId : undefined}
            className="h-12 w-full rounded-xl border border-black/10 bg-white px-4 text-base font-semibold outline-none transition placeholder:text-[#25302d]/30 focus:border-[#6f8793] sm:text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="registration_password"
            className="mb-2 block text-sm font-bold"
          >
            {t("auth.password")}
          </label>
          <PasswordField
            id="registration_password"
            name="registration_password"
            dataErrorLabel={t("auth.password")}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError("");
            }}
            autoComplete="new-password"
            required
            minLength={6}
            className="h-12 w-full rounded-xl border border-black/10 bg-white px-4 text-base font-semibold outline-none transition placeholder:text-[#25302d]/30 focus:border-[#6f8793] sm:text-sm"
          />
        </div>
      </div>

      <input
        type="hidden"
        name="turnstile_token"
        value={turnstileToken}
        data-clarity-mask="true"
        data-hj-suppress=""
      />

      {authChallengeRequired ? (
        <div className="mt-4">
          <TurnstileChallenge
            refreshKey={turnstileRefreshKey}
            onToken={setTurnstileToken}
          />
        </div>
      ) : null}
    </div>
  ) : null;

  if (isRegister && registrationStep === "profile") {
    const registrationProfile = createRegistrationProfile(userType);

    return (
      <main className="min-h-screen bg-[var(--background)] text-[#25302d]">
        <PublicSimpleHeader mode={mode} onSwitchMode={switchMode} />

        <section className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-8 sm:py-8">
          <div className="mb-4 flex justify-start">
            <button
              type="button"
              onClick={() => {
                setError("");
                setMessage("");
                setRegistrationStep("method");
              }}
              className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-bold text-[#25302d] shadow-sm transition hover:bg-[#f7f3ed]"
            >
              {t("auth.backToRegistrationOptions")}
            </button>
          </div>

          <OnboardingForm
            profile={registrationProfile}
            onClientSubmit={completeRegistrationFromProfile}
            externalError={error}
            submitLabel={t("auth.createAccount")}
            savingLabel={t("common.loading")}
            finalStepContent={registrationAuthFields}
            countries={countries}
            nationalities={nationalities}
            languageOptions={languageOptions}
            phoneCountryCodes={phoneCountryCodes}
            childrenOptions={childrenOptions}
            religionOptions={religionOptions}
            smokingOptions={smokingOptions}
          />
        </section>

        <LegalFooter />
      </main>
    );
  }

  return (
    <main className="flex min-h-[100svh] flex-col bg-[var(--background)] text-[#25302d] lg:h-[100dvh] lg:overflow-hidden">
      <PublicSimpleHeader mode={mode} onSwitchMode={switchMode} />

      <section className="mx-auto grid w-full max-w-6xl flex-1 items-start gap-6 px-4 py-5 sm:px-8 sm:py-8 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(420px,440px)] lg:gap-10 lg:overflow-y-auto lg:overscroll-contain lg:py-10">
        <div className="mx-auto hidden w-full max-w-md lg:block lg:max-w-none">
          <div className="relative flex aspect-[3/2] items-center justify-center overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_30%_25%,#fff_0,#e7f1f5_38%,#fde8dc_100%)] shadow-sm ring-1 ring-black/5 lg:aspect-[5/4] lg:rounded-[2.5rem]">
            <div aria-hidden="true" className="absolute -left-12 top-12 h-44 w-44 rounded-full bg-white/55 blur-sm" />
            <div aria-hidden="true" className="absolute -bottom-10 right-8 h-52 w-52 rounded-full bg-[#f2b58f]/30 blur-md" />
            <div className="relative flex h-44 w-44 items-center justify-center rounded-full bg-white/85 shadow-xl shadow-[#6f8793]/15 ring-1 ring-white">
              <LogoMark decorative className="h-32 w-32" />
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div
            aria-busy={isLoading || undefined}
            className="relative overflow-hidden rounded-[1.5rem] bg-white p-4 shadow-sm ring-1 ring-black/5 sm:rounded-[2rem] sm:p-6 lg:min-h-[690px]"
          >
            {isLoading ? (
              <LoginLoadingOverlay
                title={t("auth.loginLoadingTitle")}
                text={t("auth.loginLoadingText")}
              />
            ) : null}

            <h1 className="text-2xl font-bold tracking-[-0.03em]">
              {authTitle}
            </h1>

            {error ? (
              <div
                id={authErrorId}
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700"
              >
                {error}
              </div>
            ) : null}

            {message ? (
              <div
                id={authStatusId}
                role={messageIsError ? "alert" : "status"}
                aria-live={messageIsError ? "assertive" : "polite"}
                aria-atomic="true"
                className="mt-4 rounded-2xl bg-[#eef4f6] p-4 text-sm font-semibold text-[#25302d]/70"
              >
                {message}
              </div>
            ) : null}

            {isRegister && registrationStep === "account_type" ? (
              <>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#25302d]/62">
                  {t("auth.chooseAccountTypeText")}
                </p>

                <div className="mt-6 grid gap-3">
                  <button
                    type="button"
                    onClick={() => handleSelectAccountType("family")}
                    disabled={isLoading}
                    className="min-h-20 rounded-[1.35rem] border-2 border-[#9ebbc7] bg-[#e7f1f5] px-4 py-4 text-center text-base font-black text-[#25302d] shadow-sm transition hover:bg-[#d5e7ee] disabled:cursor-wait disabled:opacity-60 sm:text-lg"
                  >
                    {t("auth.registerAsFamily")}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectAccountType("au_pair")}
                    disabled={isLoading}
                    className="min-h-20 rounded-[1.35rem] border-2 border-[#f2b58f] bg-[#fde8dc] px-4 py-4 text-center text-base font-black text-[#25302d] shadow-sm transition hover:bg-[#f8d1bd] disabled:cursor-wait disabled:opacity-60 sm:text-lg"
                  >
                    {t("auth.registerAsAuPair")}
                  </button>
                </div>
              </>
            ) : null}

            {isRegister && registrationStep === "method" ? (
              <>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#25302d]/62">
                  {t("auth.chooseRegisterMethodText")}
                </p>

                <RegistrationOverview
                  accent={userType}
                  steps={registerMethodSteps}
                />

                {termsConsentField}

                <div className="mt-6 grid gap-3">
                  {isGoogleAuthEnabled ? (
                    <button
                      type="button"
                      onClick={() => handleOAuth("google")}
                      disabled={isLoading}
                      className="relative flex min-h-14 items-center justify-center gap-3 overflow-hidden rounded-2xl border border-[#c9dbff] bg-[#f8fbff] px-4 py-3 text-sm font-bold text-[#25302d] shadow-sm transition hover:border-[#9fc0ff] hover:bg-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-4 top-0 h-1 rounded-b-full bg-[var(--pa-feed-action)]"
                      />
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/10">
                        <GoogleIcon />
                      </span>
                      {t("auth.registerWithGoogle")}
                    </button>
                  ) : null}

                  <div className="flex items-center gap-3 py-1">
                    <div className="h-px flex-1 bg-black/10" />
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#52636a]">
                      {t("auth.or")}
                    </p>
                    <div className="h-px flex-1 bg-black/10" />
                  </div>

                  <button
                    type="button"
                    onClick={handleStartRegistration}
                    disabled={isLoading}
                    className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[var(--pa-primary)] px-5 py-4 text-sm font-bold text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)] disabled:cursor-wait disabled:opacity-75"
                  >
                    {t("auth.registerWithEmail")}
                  </button>
                </div>
              </>
            ) : null}

            {!isRegister && hasSocialAuth ? (
              <>
                <div className="mt-6 grid gap-3">
                  {isGoogleAuthEnabled ? (
                    <button
                      type="button"
                      onClick={() => handleOAuth("google")}
                      disabled={isLoading}
                      className="relative flex items-center justify-center gap-3 overflow-hidden rounded-2xl border border-[#c9dbff] bg-[#f8fbff] px-4 py-3 text-sm font-bold text-[#25302d] shadow-sm transition hover:border-[#9fc0ff] hover:bg-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-4 top-0 h-1 rounded-b-full bg-[var(--pa-feed-action)]"
                      />
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/10">
                        <GoogleIcon />
                      </span>
                      {t("auth.continueGoogle")}
                    </button>
                  ) : null}

                  {isFacebookAuthEnabled ? (
                    <button
                      type="button"
                      onClick={() => handleOAuth("facebook")}
                      disabled={isLoading}
                      className="flex items-center justify-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold text-[#25302d] transition hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1877f2] text-xs font-black text-white">
                        f
                      </span>
                      {t("auth.continueFacebook")}
                    </button>
                  ) : null}
                </div>

                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-black/10" />
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#52636a]">
                    {t("auth.or")}
                  </p>
                  <div className="h-px flex-1 bg-black/10" />
                </div>
              </>
            ) : null}

            {isRegister ? (
              null
            ) : (
              <form
                onSubmit={handleEmailAuth}
                action="/auth/login"
                method="post"
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-bold"
                  >
                    {t("common.email")}
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={isLoading}
                    autoComplete="email"
                    aria-invalid={credentialsInvalid || undefined}
                    aria-describedby={
                      credentialsInvalid ? authErrorId : undefined
                    }
                    className="w-full rounded-2xl border border-black/10 bg-[var(--background)] px-4 py-3 text-base font-semibold outline-none transition placeholder:text-[#25302d]/30 focus:border-[#6f8793] focus:bg-white disabled:cursor-wait disabled:opacity-70 sm:text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="mb-2 block text-sm font-bold"
                  >
                    {t("auth.password")}
                  </label>
                  <PasswordField
                    id="password"
                    name="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={isLoading}
                    autoComplete="current-password"
                    className="w-full rounded-2xl border border-black/10 bg-[var(--background)] px-4 py-3 text-base font-semibold outline-none transition placeholder:text-[#25302d]/30 focus:border-[#6f8793] focus:bg-white disabled:cursor-wait disabled:opacity-70 sm:text-sm"
                  />
                </div>

                <input
                  type="hidden"
                  name="turnstile_token"
                  value={turnstileToken}
                  data-clarity-mask="true"
                  data-hj-suppress=""
                />

                {returnTo ? (
                  <input type="hidden" name="returnTo" value={returnTo} />
                ) : null}

                {authChallengeRequired ? (
                  <TurnstileChallenge
                    refreshKey={turnstileRefreshKey}
                    onToken={setTurnstileToken}
                  />
                ) : null}

                <div className="flex justify-end">
                  <Link
                    href="/forgot-password"
                    className="-mr-2 inline-flex min-h-11 items-center rounded-xl px-2 text-sm font-bold text-[#45636f] transition hover:bg-[#eef4f6] focus:outline-none focus:ring-4 focus:ring-[#6f8793]/24"
                  >
                    {t("auth.forgotPassword")}
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--pa-primary)] px-5 py-4 text-sm font-bold text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)] disabled:cursor-wait disabled:opacity-75"
                >
                  {isLoading ? (
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin rounded-full border-2 border-[#25302d]/25 border-t-[#25302d]"
                    />
                  ) : null}
                  {isLoading ? t("auth.loginLoadingButton") : t("nav.login")}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
