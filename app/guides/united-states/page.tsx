import Link from "next/link";
import { LegalPage } from "@/components/layout/LegalPage";
import { GuideArticleMeta } from "@/components/seo/GuideArticleMeta";
import { createPublicPageMetadata } from "@/lib/seo/public-metadata";

const PATH = "/guides/united-states";
const TITLE = "Au Pair in the USA: J-1 Program Guide";
const DESCRIPTION =
  "Understand the regulated J-1 au pair route, designated sponsors, eligibility, childcare limits, support, and matching questions in the USA.";

export const metadata = createPublicPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PATH,
  type: "article",
  publishedTime: "2026-06-19T00:00:00Z",
  modifiedTime: "2026-08-01T00:00:00Z",
});

export default function UnitedStatesGuidePage() {
  return (
    <LegalPage
      translationScope="/guides/united-states"
      eyebrow="Country guide"
      title="Au pair in the USA: J-1 program guide"
      description="The U.S. au pair route is a regulated J-1 exchange visitor program. Families and au pairs should use official sponsor and Department of State guidance before making commitments."
      breadcrumbs={[
        { name: "Au pair guides", path: "/guides" },
        { name: "Au pair in the USA", path: "/guides/united-states" },
      ]}
    >
      <GuideArticleMeta
        dateModified="2026-08-01"
        datePublished="2026-06-19"
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
          <li>Use a Department of State-designated sponsor for the J-1 au pair program.</li>
          <li>Confirm eligibility, program duration, childcare hours, weekly stipend, education requirements, and local support rules with the sponsor.</li>
          <li>Discuss duties, schedule, time off, accommodation, transport, insurance, driving, and household rules before matching.</li>
          <li>Do not rely on informal arrangements that bypass J-1 program requirements.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Questions for a first call
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Which sponsor will manage the placement?</li>
          <li>What will a normal weekday and weekend look like?</li>
          <li>What childcare experience is expected?</li>
          <li>What support is available if the match does not work?</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Official source</h2>
        <p className="mt-2">
          Read the official BridgeUSA au pair program page:{" "}
          <a
            className="font-black text-[#25302d]"
            href="https://j1visa.state.gov/programs/au-pair/"
          >
            j1visa.state.gov/programs/au-pair
          </a>
          .
        </p>
        <p className="mt-3">
          Browse current{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/search-family?country=United%20States"
          >
            host family profiles in the USA
          </Link>{" "}
          or{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/search-aupair?country=United%20States"
          >
            au pair profiles
          </Link>
          . Perfect AuPair does not replace the required designated sponsor.
          Use the{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/guides/au-pair-interview"
          >
            interview guide
          </Link>{" "}
          to prepare questions before contacting a sponsor.
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
