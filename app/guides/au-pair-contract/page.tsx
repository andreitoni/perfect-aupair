import Link from "next/link";
import { LegalPage } from "@/components/layout/LegalPage";
import { GuideArticleMeta } from "@/components/seo/GuideArticleMeta";
import { createPublicPageMetadata } from "@/lib/seo/public-metadata";

const PATH = "/guides/au-pair-contract";
const TITLE = "Au Pair Contract Template";
const DESCRIPTION =
  "Download a practical au pair agreement template and review what to discuss before a stay begins.";

const contractDownloadHref =
  "/downloads/perfect-aupair-au-pair-agreement-template.pdf";

export const metadata = createPublicPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PATH,
  type: "article",
  publishedTime: "2026-06-29T00:00:00Z",
  modifiedTime: "2026-08-01T00:00:00Z",
});

export default function AuPairContractGuidePage() {
  return (
    <LegalPage
      translationScope="/guides/au-pair-contract"
      eyebrow="Guide"
      title="Au pair contract template"
      description="A written agreement helps both sides confirm expectations before anyone travels. Use this guide as a practical checklist, then verify the rules for the host country."
      breadcrumbs={[
        { name: "Au pair guides", path: "/guides" },
        { name: "Au pair contract", path: "/guides/au-pair-contract" },
      ]}
    >
      <GuideArticleMeta
        dateModified="2026-08-01"
        datePublished="2026-06-29"
        description={DESCRIPTION}
        headline={TITLE}
        inLanguage="en"
        path={PATH}
      />
      <section>
        <a
          href={contractDownloadHref}
          download
          className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--pa-primary)] px-5 text-sm font-black text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)]"
        >
          Download contract template
        </a>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          What the agreement should cover
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Full names, addresses, start date, expected end date, and host country.</li>
          <li>Weekly schedule, childcare duties, light household tasks, free days, holidays, and curfew expectations if any.</li>
          <li>Allowance or pocket money, payment day, transport support, language course support, and other agreed costs.</li>
          <li>Private room, meals, insurance, emergency contacts, illness, travel, driving, and household rules.</li>
          <li>Notice period, what happens if the match does not work, and who helps with the transition.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Before signing
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Have at least two or three video calls before making travel plans.</li>
          <li>Discuss the agreement line by line so both sides understand the same words in the same way.</li>
          <li>Check visa, immigration, tax, childcare, employment, minimum pay, and insurance rules for the specific country.</li>
          <li>Keep copies of the signed agreement and any later changes.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Important note
        </h2>
        <p className="mt-2">
          This template is a starting point, not legal advice. Some countries
          require specific wording or official forms. If the arrangement crosses
          borders, confirm the latest requirements with official sources before
          relying on a private agreement.
        </p>
        <p className="mt-3">
          Country rules differ. Continue with the guides for{" "}
          <Link className="font-black text-[#25302d]" href="/guides/germany">
            Germany
          </Link>
          , the{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/guides/united-kingdom"
          >
            United Kingdom
          </Link>
          , or the{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/guides/united-states"
          >
            United States
          </Link>
          .
        </p>
        <p className="mt-3">
          <Link className="font-black text-[#25302d]" href="/guides">
            Back to guides
          </Link>
        </p>
      </section>
    </LegalPage>
  );
}
