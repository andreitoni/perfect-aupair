import Link from "next/link";
import { LegalPage } from "@/components/layout/LegalPage";
import { GuideArticleMeta } from "@/components/seo/GuideArticleMeta";
import { createPublicPageMetadata } from "@/lib/seo/public-metadata";

const PATH = "/guides/denmark";
const TITLE = "Au Pair in Denmark: Requirements and Guide";
const DESCRIPTION =
  "Understand Denmark's au pair permit, age limit, host family rules, hours, pocket money, accommodation, insurance, and contract.";

export const metadata = createPublicPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PATH,
  type: "article",
  publishedTime: "2026-08-03T00:00:00Z",
  modifiedTime: "2026-08-03T00:00:00Z",
});

export default function DenmarkGuidePage() {
  return (
    <LegalPage
      translationScope="/guides/denmark"
      eyebrow="Country guide"
      title="Au pair in Denmark: requirements and guide"
      description="Denmark's au pair scheme is a cultural exchange with detailed conditions for the au pair, host family, accommodation, duties, insurance, and contract. Check the Danish immigration authorities before making travel plans."
      breadcrumbs={[
        { name: "Au pair guides", path: "/guides" },
        { name: "Au pair in Denmark", path: "/guides/denmark" },
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
          <li>Check which residence rules apply to the au pair&apos;s nationality before the stay begins.</li>
          <li>For the Danish au pair permit, the applicant must be at least 18 and must not have turned 30 when applying.</li>
          <li>The au pair and host family must sign the official binding au pair contract.</li>
          <li>Confirm the private room, free food and accommodation, pocket money, insurance, duties, schedule, travel costs, and time off.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Permit and host family basics
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>The host family must include at least one adult and one child under 18 registered at the same address.</li>
          <li>Ordinary domestic duties and childcare are limited to 3–5 hours per day and 18–30 hours per week.</li>
          <li>Pocket money and the host family contribution for Danish lessons are updated regularly, so verify the current official rates.</li>
          <li>An au pair residence permit can be granted for a total of up to two years.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Official source</h2>
        <p className="mt-2">
          Read the current conditions, rates, and application steps from the
          Danish Agency for International Recruitment and Integration (SIRI):{" "}
          <a
            className="font-black text-[#25302d]"
            href="https://www.nyidanmark.dk/en-GB/You-want-to-apply/Au-pair"
          >
            nyidanmark.dk – Au pair
          </a>
          .
        </p>
        <p className="mt-3">
          Browse current{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/search-family?country=Denmark"
          >
            host families in Denmark
          </Link>{" "}
          or{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/search-aupair?country=Denmark"
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
