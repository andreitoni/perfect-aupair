import { redirect } from "next/navigation";
import { LoginPageClient } from "@/components/auth/LoginPageClient";
import { authHomeHref, safeAuthReturnTo } from "@/lib/auth/return-to";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseSessionCookie } from "@/lib/supabase/has-session-cookie";
import type { Metadata } from "next";

type LoginSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeInitialUserType(value: string | string[] | undefined) {
  const firstValue = firstSearchParam(value);

  if (firstValue === "family" || firstValue === "au_pair") {
    return firstValue;
  }

  return undefined;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: LoginSearchParams;
}): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const isRegister =
    firstSearchParam(params.mode) === "register" ||
    Boolean(
      normalizeInitialUserType(params.accountType) ??
        normalizeInitialUserType(params.account_type),
    );

  return {
    title: isRegister ? "Register" : "Login",
    description: isRegister
      ? "Create a free Perfect AuPair account."
      : "Log in to your Perfect AuPair account.",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: LoginSearchParams;
}) {
  const params = (await searchParams) ?? {};
  const returnTo = safeAuthReturnTo(params.returnTo);
  const user = (await hasSupabaseSessionCookie())
    ? (await (await createClient()).auth.getUser()).data.user
    : null;

  if (user) {
    redirect(authHomeHref(returnTo));
  }

  const initialMode =
    firstSearchParam(params.mode) === "register" ? "register" : "login";
  const initialUserType =
    normalizeInitialUserType(params.accountType) ??
    normalizeInitialUserType(params.account_type) ??
    "family";

  return (
    <LoginPageClient
      initialAuthState={firstSearchParam(params.auth) ?? ""}
      initialError={firstSearchParam(params.error) ?? ""}
      initialMode={initialMode}
      initialReturnTo={returnTo ?? undefined}
      initialUserType={initialUserType}
    />
  );
}
