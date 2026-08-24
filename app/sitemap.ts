import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const STATIC_ROUTES = [
  { path: "", lastModified: "2026-08-13" },
  { path: "/about", lastModified: "2026-08-08" },
  { path: "/search-aupair", lastModified: "2026-08-08" },
  { path: "/search-family", lastModified: "2026-08-08" },
  { path: "/privacy", lastModified: "2026-08-09" },
  { path: "/terms", lastModified: "2026-08-08" },
  { path: "/cookie-policy", lastModified: "2026-08-08" },
  { path: "/contact", lastModified: "2026-08-08" },
  { path: "/data-deletion", lastModified: "2026-08-08" },
  { path: "/safety", lastModified: "2026-08-08" },
  { path: "/guides", lastModified: "2026-08-08" },
  { path: "/guides/best-au-pair-website", lastModified: "2026-08-08" },
  { path: "/guides/au-pair-contract", lastModified: "2026-08-08" },
  { path: "/guides/au-pair-interview", lastModified: "2026-08-08" },
  { path: "/guides/united-states", lastModified: "2026-08-08" },
  { path: "/guides/germany", lastModified: "2026-08-08" },
  { path: "/guides/united-kingdom", lastModified: "2026-08-08" },
  { path: "/guides/sweden", lastModified: "2026-08-08" },
  { path: "/guides/denmark", lastModified: "2026-08-08" },
  { path: "/de", lastModified: "2026-08-13" },
  { path: "/de/ratgeber", lastModified: "2026-08-08" },
  { path: "/de/beste-au-pair-webseite", lastModified: "2026-08-08" },
  { path: "/de/au-pair-finden", lastModified: "2026-08-08" },
  { path: "/de/gastfamilie-werden", lastModified: "2026-08-13" },
  { path: "/de/au-pair-kosten-deutschland", lastModified: "2026-08-13" },
  {
    path: "/de/au-pair-voraussetzungen-deutschland",
    lastModified: "2026-08-13",
  },
  { path: "/de/au-pair-vertrag-deutschland", lastModified: "2026-08-13" },
  { path: "/de/au-pair-visum-deutschland", lastModified: "2026-08-13" },
  {
    path: "/de/au-pair-arbeitszeit-deutschland",
    lastModified: "2026-08-08",
  },
  {
    path: "/de/au-pair-taschengeld-deutschland",
    lastModified: "2026-08-13",
  },
  { path: "/de/au-pair-finden-oesterreich", lastModified: "2026-08-08" },
  { path: "/de/au-pair-kosten-oesterreich", lastModified: "2026-08-08" },
  {
    path: "/de/gastfamilie-werden-oesterreich",
    lastModified: "2026-08-08",
  },
  { path: "/de/au-pair-finden-schweiz", lastModified: "2026-08-08" },
  { path: "/de/au-pair-kosten-schweiz", lastModified: "2026-08-08" },
  {
    path: "/de/gastfamilie-werden-schweiz",
    lastModified: "2026-08-08",
  },
] as const;

function staticRoutePriority(route: string) {
  if (route === "") return 1;
  if (route === "/search-aupair" || route === "/search-family") return 0.85;
  if (route === "/safety" || route === "/guides" || route === "/de") return 0.75;
  if (route.startsWith("/de/")) return 0.8;

  return 0.7;
}

function staticRouteFrequency(route: string): MetadataRoute.Sitemap[number]["changeFrequency"] {
  if (route === "") return "weekly";
  if (route === "/search-aupair" || route === "/search-family") return "daily";

  return "monthly";
}

function staticRouteAlternates(
  route: string,
): MetadataRoute.Sitemap[number]["alternates"] {
  if (route === "" || route === "/de") {
    return {
      languages: {
        en: SITE_URL,
        de: `${SITE_URL}/de`,
        "x-default": SITE_URL,
      },
    };
  }

  if (
    route === "/guides/best-au-pair-website" ||
    route === "/de/beste-au-pair-webseite"
  ) {
    return {
      languages: {
        en: `${SITE_URL}/guides/best-au-pair-website`,
        de: `${SITE_URL}/de/beste-au-pair-webseite`,
        "x-default": `${SITE_URL}/guides/best-au-pair-website`,
      },
    };
  }

  return undefined;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return STATIC_ROUTES.map(({ path, lastModified }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: `${lastModified}T00:00:00.000Z`,
    changeFrequency: staticRouteFrequency(path),
    priority: staticRoutePriority(path),
    alternates: staticRouteAlternates(path),
  }));
}
