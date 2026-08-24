import type { MetadataRoute } from "next";
import { isMaintenanceModeEnabled } from "@/lib/maintenance";
import { SITE_URL } from "@/lib/site";

const PUBLIC_LEGAL_PATHS = [
  "/about",
  "/about/",
  "/privacy",
  "/privacy/",
  "/terms",
  "/terms/",
  "/cookie-policy",
  "/cookie-policy/",
  "/contact",
  "/contact/",
  "/data-deletion",
  "/data-deletion/",
  "/safety",
  "/safety/",
];

const PRIVATE_APP_PATHS = [
  "/account",
  "/admin",
  "/messages",
  "/onboarding",
  "/profile/photos",
  "/report",
  "/saved",
  "/stories",
  "/stories/new",
];

export default function robots(): MetadataRoute.Robots {
  if (isMaintenanceModeEnabled()) {
    return {
      rules: [
        {
          userAgent: "facebookexternalhit",
          allow: "/",
        },
        {
          userAgent: "Facebot",
          allow: "/",
        },
        {
          userAgent: "*",
          allow: PUBLIC_LEGAL_PATHS,
          disallow: PRIVATE_APP_PATHS,
        },
      ],
      sitemap: `${SITE_URL}/sitemap.xml`,
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/about",
          "/search-aupair",
          "/search-family",
          "/profile/",
          "/privacy",
          "/terms",
          "/cookie-policy",
          "/contact",
          "/data-deletion",
          "/safety",
          "/guides",
          "/guides/",
          "/de",
          "/de/",
        ],
        disallow: PRIVATE_APP_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
