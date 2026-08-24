import Link from "next/link";
import { LegalPage } from "@/components/layout/LegalPage";
import { GuideArticleMeta } from "@/components/seo/GuideArticleMeta";
import { createPublicPageMetadata } from "@/lib/seo/public-metadata";

const PATH = "/guides/united-kingdom";
const TITLE = "Au Pair in the UK: Work Rights and Guide";
const DESCRIPTION =
  "Understand UK right-to-work checks, minimum wage, duties, accommodation, employer responsibilities, and written agreements for au pairs and host families.";

export const metadata = createPublicPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PATH,
  type: "article",
  publishedTime: "2026-06-19T00:00:00Z",
  modifiedTime: "2026-08-08T00:00:00Z",
});

export default function UnitedKingdomGuidePage() {
  return (
    <LegalPage
      translationScope="/guides/united-kingdom"
      eyebrow="Country guide"
      title="Au pair in the UK: work rights and guide"
      description="Au pairs in the UK must have the right to work and are entitled to the applicable National Minimum Wage or National Living Wage. Host families should check current GOV.UK rules before making plans."
      breadcrumbs={[
        { name: "Au pair guides", path: "/guides" },
        { name: "Au pair in the UK", path: "/guides/united-kingdom" },
      ]}
    >
      <GuideArticleMeta
        dateModified="2026-08-08"
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
          <li>Confirm the au pair&apos;s right to live and work in the UK before any arrangement starts.</li>
          <li>Budget for at least the applicable National Minimum Wage or National Living Wage; accommodation can affect the calculation, and employer or tax obligations may also apply.</li>
          <li>Agree duties, hours, pocket money or pay, accommodation, meals, holidays, transport, and household rules in writing.</li>
          <li>Be especially careful with childcare duties, overnight responsibility, and any paid work outside the family.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Questions for a first call
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>What visa or immigration status allows the arrangement?</li>
          <li>How many hours are expected each week?</li>
          <li>What private room and living arrangements are provided?</li>
          <li>How will expenses, pay, and time off be handled?</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Official source</h2>
        <p className="mt-2">
          Read the official GOV.UK page on au pairs and employment law:{" "}
          <a
            className="font-black text-[#25302d]"
            href="https://www.gov.uk/au-pairs-employment-law/au-pairs"
          >
            gov.uk/au-pairs-employment-law/au-pairs
          </a>
          .
        </p>
        <p className="mt-3">
          Browse current{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/search-family?country=United%20Kingdom"
          >
            host families in the UK
          </Link>{" "}
          or{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/search-aupair?country=United%20Kingdom"
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
