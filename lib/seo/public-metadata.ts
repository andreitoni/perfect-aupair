import type { Metadata } from "next";
import {
  SITE_NAME,
  SITE_URL,
  SOCIAL_PREVIEW_ALT,
  SOCIAL_PREVIEW_PATH,
} from "@/lib/site";

type PublicPageMetadataOptions = {
  alternateLocale?: string[];
  description: string;
  languages?: Record<string, string>;
  locale?: string;
  modifiedTime?: string;
  path: string;
  publishedTime?: string;
  title: string;
  type?: "article" | "website";
};

type GermanPublicPageMetadataOptions = Pick<
  PublicPageMetadataOptions,
  "description" | "path" | "title"
> & {
  language?: "de-AT" | "de-CH" | "de-DE";
  locale?: "de_AT" | "de_CH" | "de_DE";
  type?: "article" | "website";
};

export function createPublicPageMetadata({
  alternateLocale,
  description,
  languages,
  locale = "en_US",
  modifiedTime,
  path,
  publishedTime,
  title,
  type = "website",
}: PublicPageMetadataOptions): Metadata {
  const canonicalUrl = `${SITE_URL}${path}`;
  const socialTitle = title.includes(SITE_NAME)
    ? title
    : `${title} | ${SITE_NAME}`;
  const commonOpenGraph = {
    siteName: SITE_NAME,
    title: socialTitle,
    description,
    url: canonicalUrl,
    locale,
    alternateLocale,
    images: [
      {
        url: SOCIAL_PREVIEW_PATH,
        width: 1200,
        height: 630,
        type: "image/jpeg" as const,
        alt: SOCIAL_PREVIEW_ALT,
      },
    ],
  };

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages,
    },
    openGraph:
      type === "article"
        ? {
            ...commonOpenGraph,
            type: "article",
            publishedTime,
            modifiedTime,
          }
        : {
            ...commonOpenGraph,
            type: "website",
          },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [
        {
          url: SOCIAL_PREVIEW_PATH,
          alt: SOCIAL_PREVIEW_ALT,
        },
      ],
    },
  };
}

export function createGermanPublicPageMetadata({
  description,
  language = "de-DE",
  locale = "de_DE",
  path,
  title,
  type = "article",
}: GermanPublicPageMetadataOptions): Metadata {
  return createPublicPageMetadata({
    title,
    description,
    path,
    languages: {
      [language]: `${SITE_URL}${path}`,
    },
    locale,
    type,
  });
}
