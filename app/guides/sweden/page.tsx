import Link from "next/link";
import { LegalPage } from "@/components/layout/LegalPage";
import { GuideArticleMeta } from "@/components/seo/GuideArticleMeta";
import { createPublicPageMetadata } from "@/lib/seo/public-metadata";

const PATH = "/guides/sweden";
const TITLE = "Au Pair in Sweden: Requirements and Guide";
const DESCRIPTION =
  "Understand Sweden's au pair residence rules, age limit, hours, language study, compensation, insurance, and host family agreement.";

export const metadata = createPublicPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PATH,
  type: "article",
  publishedTime: "2026-08-03T00:00:00Z",
  modifiedTime: "2026-08-03T00:00:00Z",
});

export default function SwedenGuidePage() {
  return (
    <LegalPage
      translationScope="/guides/sweden"
      eyebrow="Country guide"
      title="Au pair in Sweden: requirements and guide"
      description="Sweden treats an au pair stay as a cultural and language-learning experience with childcare and light household duties. Residence rules depend on nationality, so check the Swedish Migration Agency before making travel plans."
      breadcrumbs={[
        { name: "Au pair guides", path: "/guides" },
        { name: "Au pair in Sweden", path: "/guides/sweden" },
      ]}
    >
      <GuideArticleMeta
        dateModified="2026-08-03"
        datePublished="2026-08-03"
        description={DESCRIPTION}
        headline={TITLE}
        inLanguage="en"
        path={PATH}
      />
      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          What to confirm early
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Check whether the au pair needs a residence permit or has EU/EEA right of residence.</li>
          <li>For the non-EU/EEA au pair permit, the applicant must be at least 18 and under 30 when the decision is made.</li>
          <li>The written agreement must limit childcare and light household work to 25 hours per week and leave time for Swedish studies.</li>
          <li>Confirm compensation, free food and accommodation, accident insurance, comprehensive health insurance, duties, and time off in writing.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Permit and host family basics
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>The host family starts the online application for a non-EU/EEA au pair.</li>
          <li>Work and Swedish studies together must not exceed 40 hours per week.</li>
          <li>The official minimum compensation is linked to Sweden&apos;s current price base amount, so verify the latest figure before signing.</li>
          <li>An au pair residence permit can be granted for up to one year and cannot be extended.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Official source</h2>
        <p className="mt-2">
          Read the current requirements and application steps from the Swedish
          Migration Agency:{" "}
          <a
            className="font-black text-[#25302d]"
            href="https://www.migrationsverket.se/en/you-want-to-apply/work/temporary-work-in-sweden/au-pairs.html"
          >
            migrationsverket.se – Au pairs
          </a>
          .
        </p>
        <p className="mt-3">
          Browse current{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/search-family?country=Sweden"
          >
            host families in Sweden
          </Link>{" "}
          or{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/search-aupair?country=Sweden"
          >
            au pair profiles
          </Link>
          . Before deciding, use the{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/guides/au-pair-interview"
          >
            au pair interview guide
          </Link>{" "}
          and review the{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/guides/au-pair-contract"
          >
            au pair contract checklist
          </Link>
          .
        </p>
        <p className="mt-3">
          <Link className="font-black text-[#25302d]" href="/guides">
            Back to country guides
          </Link>
        </p>
      </section>
    </LegalPage>
  );
}
