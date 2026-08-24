import { PublicLandingPage } from "@/components/home/PublicLandingPage";
import {
  AU_PAIR_SOCIAL_PREVIEW_ALT,
  AU_PAIR_SOCIAL_PREVIEW_PATH,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";
import type { Metadata } from "next";

const HOME_TITLE = "Perfect AuPair | Find Au Pairs and Host Families";
const HOME_DESCRIPTION =
  "Perfect AuPair helps au pairs and host families find each other in Germany, the UK, the US, and worldwide. Browse profiles and start matching today.";

export const metadata: Metadata = {
  title: {
    absolute: HOME_TITLE,
  },
  description: HOME_DESCRIPTION,
  alternates: {
    canonical: SITE_URL,
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
    url: SITE_URL,
    images: [
      {
        url: AU_PAIR_SOCIAL_PREVIEW_PATH,
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: AU_PAIR_SOCIAL_PREVIEW_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [
      {
        url: AU_PAIR_SOCIAL_PREVIEW_PATH,
        alt: AU_PAIR_SOCIAL_PREVIEW_ALT,
      },
    ],
  },
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  return <PublicLandingPage searchParams={searchParams} />;
}
