import Link from "next/link";
import { getServerLocale } from "@/lib/i18n/server";
import { getLocaleTag, type LanguageCode } from "@/lib/i18n/config";
import {
  SITE_NAME,
  SITE_URL,
  SOCIAL_PREVIEW_PATH,
} from "@/lib/site";

const labels: Record<
  LanguageCode,
  { lastReviewed: string; published: string; publishedBy: string }
> = {
  en: {
    lastReviewed: "Last reviewed",
    published: "Published",
    publishedBy: "Published by",
  },
  es: {
    lastReviewed: "Última revisión",
    published: "Publicado",
    publishedBy: "Publicado por",
  },
  de: {
    lastReviewed: "Zuletzt geprüft",
    published: "Veröffentlicht",
    publishedBy: "Veröffentlicht von",
  },
  fr: {
    lastReviewed: "Dernière vérification",
    published: "Publié",
    publishedBy: "Publié par",
  },
  nl: {
    lastReviewed: "Laatst gecontroleerd",
    published: "Gepubliceerd",
    publishedBy: "Gepubliceerd door",
  },
  it: {
    lastReviewed: "Ultima verifica",
    published: "Pubblicato",
    publishedBy: "Pubblicato da",
  },
};

export async function GuideArticleMeta({
  dateModified,
  datePublished,
  description,
  headline,
  inLanguage,
  path,
}: {
  dateModified: string;
  datePublished: string;
  description: string;
  headline: string;
  inLanguage: "de" | "en";
  path: string;
}) {
  const locale = await getServerLocale();
  const pageUrl = `${SITE_URL}${path}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${pageUrl}#article`,
    mainEntityOfPage: pageUrl,
    headline,
    description,
    image: `${SITE_URL}${SOCIAL_PREVIEW_PATH}`,
    datePublished,
    dateModified,
    inLanguage,
    author: {
      "@id": `${SITE_URL}/#organization`,
    },
    publisher: {
      "@id": `${SITE_URL}/#organization`,
    },
  };
  const formatDate = (date: string) =>
    new Intl.DateTimeFormat(getLocaleTag(locale), {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00Z`));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <p className="text-xs font-bold text-[#52636a]">
        {labels[locale].publishedBy}{" "}
        <Link className="font-black text-[#25302d]" href="/about">
          {SITE_NAME}
        </Link>{" "}
        · {labels[locale].published}{" "}
        <time dateTime={datePublished}>{formatDate(datePublished)}</time> ·{" "}
        {labels[locale].lastReviewed}{" "}
        <time dateTime={dateModified}>{formatDate(dateModified)}</time>
      </p>
    </>
  );
}
