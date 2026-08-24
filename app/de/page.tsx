import { PublicLandingPage } from "@/components/home/PublicLandingPage";
import {
  SITE_NAME,
  SITE_URL,
  SOCIAL_PREVIEW_ALT,
  SOCIAL_PREVIEW_PATH,
} from "@/lib/site";
import type { Metadata } from "next";

const HOME_TITLE = "Perfect AuPair | Au-pairs und Gastfamilien finden";
const HOME_DESCRIPTION =
  "Perfect AuPair verbindet Au-pairs und Gastfamilien in Deutschland und weltweit. Profile ansehen, kostenlos registrieren und passende Menschen kennenlernen.";

export const metadata: Metadata = {
  title: {
    absolute: HOME_TITLE,
  },
  description: HOME_DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}/de`,
    languages: {
      en: SITE_URL,
      de: `${SITE_URL}/de`,
      "x-default": SITE_URL,
    },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: `${SITE_URL}/de`,
    locale: "de_DE",
    images: [
      {
        url: SOCIAL_PREVIEW_PATH,
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: SOCIAL_PREVIEW_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [
      {
        url: SOCIAL_PREVIEW_PATH,
        alt: SOCIAL_PREVIEW_ALT,
      },
    ],
  },
};

export default async function GermanHomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  return (
    <PublicLandingPage
      searchParams={searchParams}
      localeOverride="de"
      basePath="/de"
    />
  );
}
