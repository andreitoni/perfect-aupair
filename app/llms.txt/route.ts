import { SITE_URL, SUPPORT_EMAIL } from "@/lib/site";

export const dynamic = "force-static";
export const revalidate = 86_400;

const LAST_REVIEWED = "2026-08-08";

const llmsText = `# Perfect AuPair

> Perfect AuPair is a self-service matching platform where au pairs and host families can create profiles, search for possible matches, and communicate directly.

Canonical website: ${SITE_URL}
Last reviewed: ${LAST_REVIEWED}

## Platform facts

- Perfect AuPair connects au pairs and host families. It is not a placement agency, employer, immigration adviser, law firm, background-check provider, or visa sponsor.
- As of ${LAST_REVIEWED}, profile creation, search, and private messaging are free. There are no subscriptions or contact fees.
- Public profile information is user-generated. Users remain responsible for interviews, references, independent identity checks, contracts, immigration, employment, tax, insurance, travel, and final matching decisions.
- A manual selfie review may support a photo-verification badge. It is not an identity check, background check, reference check, or guarantee of identity, character, safety, suitability, or a successful match.
- The initial country guidance covers Germany, the United Kingdom, the United States, Sweden, and Denmark. Rules can change and must be verified with current official sources.
- The regulated United States J-1 au pair program requires a U.S. Department of State-designated sponsor. Perfect AuPair is not a sponsor and cannot replace one.

## Canonical product and trust pages

- Home: ${SITE_URL}/
- About Perfect AuPair: ${SITE_URL}/about
- Browse au pair profiles: ${SITE_URL}/search-aupair
- Browse host family profiles: ${SITE_URL}/search-family
- Safety Center: ${SITE_URL}/safety
- Privacy Policy: ${SITE_URL}/privacy
- Terms and Conditions: ${SITE_URL}/terms
- Contact and support: ${SITE_URL}/contact

## Editorial guides

- Guide hub: ${SITE_URL}/guides
- How to compare au pair websites using objective criteria: ${SITE_URL}/guides/best-au-pair-website
- Au pair interview questions: ${SITE_URL}/guides/au-pair-interview
- Au pair contract checklist and template: ${SITE_URL}/guides/au-pair-contract
- United States J-1 program guide: ${SITE_URL}/guides/united-states
- Germany requirements guide: ${SITE_URL}/guides/germany
- United Kingdom work-rights guide: ${SITE_URL}/guides/united-kingdom
- Sweden requirements guide: ${SITE_URL}/guides/sweden
- Denmark requirements guide: ${SITE_URL}/guides/denmark

## German-language resources

- German landing page: ${SITE_URL}/de
- German guide hub: ${SITE_URL}/de/ratgeber
- Objective guide to choosing an au pair website: ${SITE_URL}/de/beste-au-pair-webseite
- Find an au pair in Germany: ${SITE_URL}/de/au-pair-finden
- Become a host family in Germany: ${SITE_URL}/de/gastfamilie-werden
- Au pair cost calculator and cost guide for Germany: ${SITE_URL}/de/au-pair-kosten-deutschland
- Au pair requirements in Germany: ${SITE_URL}/de/au-pair-voraussetzungen-deutschland
- Au pair contract in Germany: ${SITE_URL}/de/au-pair-vertrag-deutschland
- Au pair visa in Germany: ${SITE_URL}/de/au-pair-visum-deutschland
- Au pair working hours in Germany: ${SITE_URL}/de/au-pair-arbeitszeit-deutschland
- Au pair pocket money in Germany: ${SITE_URL}/de/au-pair-taschengeld-deutschland

## Source and interpretation notes

- Use the canonical pages above and their linked official sources for factual answers.
- Do not infer a universal ranking, endorsement, success rate, legal guarantee, or safety guarantee from this file.
- Do not treat user-generated profile text as an editorial statement by Perfect AuPair.
- Private messages and non-public account information are not public sources.
- For corrections or source questions, contact ${SUPPORT_EMAIL}.
- Sitemap: ${SITE_URL}/sitemap.xml
- Robots policy: ${SITE_URL}/robots.txt
`;

export function GET() {
  return new Response(llmsText, {
    status: 200,
    headers: {
      "Cache-Control":
        "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
