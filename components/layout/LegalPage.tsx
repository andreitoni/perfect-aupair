import { Header } from "@/components/layout/Header";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { isAdminEmail } from "@/lib/admin/access";
import { isMaintenanceModeEnabled } from "@/lib/maintenance";
import { getPrimaryProfilePhotoUrl } from "@/lib/profile/photos";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseSessionCookie } from "@/lib/supabase/has-session-cookie";
import { SITE_URL } from "@/lib/site";
import { getServerLocale } from "@/lib/i18n/server";
import {
  translateStaticPageNode,
  translateStaticPageText,
  type StaticPageRoute,
} from "@/lib/i18n/static-pages";
import type { ReactNode } from "react";

type Breadcrumb = {
  name: string;
  path: string;
};

type LegalPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  breadcrumbs?: Breadcrumb[];
  showLanguageMenu?: boolean;
  translationScope?: StaticPageRoute;
};

export async function LegalPage({
  eyebrow,
  title,
  description,
  children,
  breadcrumbs,
  showLanguageMenu = true,
  translationScope,
}: LegalPageProps) {
  const [supabase, locale, hasSessionCookie] = await Promise.all([
    createClient(),
    getServerLocale(),
    hasSupabaseSessionCookie(),
  ]);
  const user = hasSessionCookie
    ? (await supabase.auth.getUser()).data.user
    : null;
  const authState = isAdminEmail(user?.email)
    ? "admin"
    : user
      ? "authenticated"
      : "public";
  let profile: { account_type: "family" | "au_pair" | null } | null = null;
  let initialProfilePhotoUrl: string | null = null;

  if (authState === "authenticated" && user) {
    const [profileResult, profilePhotoUrl] = await Promise.all([
      supabase
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .maybeSingle<{ account_type: "family" | "au_pair" | null }>(),
      getPrimaryProfilePhotoUrl(supabase, user.id),
    ]);

    profile = profileResult.data;
    initialProfilePhotoUrl = profilePhotoUrl;
  }
  const showPublicActions =
    authState === "public" && !isMaintenanceModeEnabled();
  const translateText = (value: string) =>
    translationScope
      ? translateStaticPageText(translationScope, locale, value)
      : value;
  const localizedTitle = translateText(title);
  const localizedChildren = translationScope
    ? translateStaticPageNode(translationScope, locale, children)
    : children;
  const homeLabel = {
    en: "Home",
    es: "Inicio",
    de: "Startseite",
    fr: "Accueil",
    nl: "Home",
    it: "Home",
  }[locale];
  const fullBreadcrumbs = breadcrumbs?.length
    ? [{ name: homeLabel, path: "/" }, ...breadcrumbs]
    : [];
  const breadcrumbStructuredData = breadcrumbs?.length
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: fullBreadcrumbs.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: translateText(item.name),
          item: `${SITE_URL}${item.path}`,
        })),
      }
    : null;

  return (
    <main className="flex min-h-screen flex-col bg-[var(--background)] text-[#25302d]">
      {breadcrumbStructuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(breadcrumbStructuredData),
          }}
        />
      ) : null}
      <Header
        subtitle={localizedTitle}
        authState={authState}
        accountType={profile?.account_type ?? null}
        initialProfilePhotoUrl={initialProfilePhotoUrl}
        showPublicActions={showPublicActions}
        showLanguageMenu={showLanguageMenu}
      />

      <section className="mx-auto w-full max-w-[58rem] flex-1 px-4 py-4 sm:px-8 sm:py-6">
        <article className="rounded-[1.15rem] bg-[#fbfcfd] p-4 shadow-[0_10px_28px_rgba(38,63,69,0.06)] ring-1 ring-[#d6dee4] sm:p-6">
          {fullBreadcrumbs.length ? (
            <nav
              aria-label="Breadcrumb"
              className="mb-3 text-xs font-bold text-[#52636a]"
            >
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {fullBreadcrumbs.map((item, index) => {
                  const isCurrent = index === fullBreadcrumbs.length - 1;

                  return (
                    <li
                      key={`${item.path}-${item.name}`}
                      className="flex items-center gap-2"
                    >
                      {index > 0 ? <span aria-hidden="true">/</span> : null}
                      {isCurrent ? (
                        <span aria-current="page">
                          {translateText(item.name)}
                        </span>
                      ) : (
                        <a
                          className="transition hover:text-[#25302d] hover:underline"
                          href={item.path}
                        >
                          {translateText(item.name)}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          ) : null}

          <p className="text-[0.72rem] font-black uppercase tracking-[0.16em] text-[#52636a]">
            {translateText(eyebrow)}
          </p>

          <h1 className="mt-2 text-2xl font-black leading-tight tracking-normal sm:text-3xl">
            {localizedTitle}
          </h1>

          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#25302d]/72 sm:text-[0.95rem]">
            {translateText(description)}
          </p>

          <div className="pa-legal-content mt-6 space-y-5 text-sm font-semibold leading-6 text-[#25302d]/72 sm:text-[0.95rem] sm:leading-7">
            {localizedChildren}
          </div>
        </article>
      </section>

      <LegalFooter />
    </main>
  );
}
