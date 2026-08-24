import Link from "next/link";
import { LegalPage } from "@/components/layout/LegalPage";
import { GuideArticleMeta } from "@/components/seo/GuideArticleMeta";
import { createPublicPageMetadata } from "@/lib/seo/public-metadata";

const PATH = "/guides/germany";
const TITLE = "Au Pair Germany Requirements: Complete 2026 Guide";
const DESCRIPTION =
  "Check the requirements for an au pair in Germany: age, German level, visa, working hours, pocket money, insurance, accommodation, contract, and host-family rules.";

const faq = [
  {
    question: "What age must an au pair be in Germany?",
    answer:
      "An au pair must be at least 18 when joining the family. Applicants who require a residence permit must be under 27 when they apply for it.",
  },
  {
    question: "Does an au pair need to speak German?",
    answer:
      "Basic German is expected. The Federal Employment Agency describes at least A1 level for applicants whose language ability is assessed during the residence process.",
  },
  {
    question: "How many hours can an au pair work in Germany?",
    answer:
      "Official guidance sets a normal maximum of six hours per day and 30 hours per week, including childcare.",
  },
  {
    question: "How much pocket money does an au pair receive?",
    answer:
      "The current Federal Employment Agency guide states 280 euros per month. Accommodation and meals are provided separately by the host family.",
  },
];

export const metadata = createPublicPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PATH,
  type: "article",
  publishedTime: "2026-06-19T00:00:00Z",
  modifiedTime: "2026-08-08T00:00:00Z",
});

export default function GermanyGuidePage() {
  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <LegalPage
      translationScope="/guides/germany"
      eyebrow="Country guide"
      title="Requirements for an au pair in Germany"
      description="Check age, German level, visa status, working time, pocket money, accommodation, insurance, and host-family duties before agreeing to a match."
      breadcrumbs={[
        { name: "Au pair guides", path: "/guides" },
        { name: "Au pair in Germany", path: PATH },
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Requirements at a glance
        </h2>
        <p className="mt-2">
          An au pair in Germany must normally be at least 18, have basic German,
          live with a qualifying host family, and stay for 6 to 12 months.
          Applicants who need a residence permit must be under 27 when applying.
          Official guidance limits duties to 6 hours per day and 30 hours per
          week. The host family provides a private room and meals, pays the
          required insurance, contributes at least €70 per month toward an
          actually attended language course plus necessary travel, and pays €280
          monthly pocket money. The arrangement should be recorded in a written
          contract before the stay begins.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          What to confirm early
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Confirm whether the au pair needs a visa before entering Germany.</li>
          <li>Discuss German language learning, expected childcare hours, household help, pocket money, room, meals, insurance, holidays, and transport.</li>
          <li>Make sure the arrangement is written clearly before anyone travels.</li>
          <li>Use official embassy, consulate, and Federal Foreign Office information for visa questions.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Questions for a first call
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Which visa or residence rules apply to this nationality?</li>
          <li>What language course support is available?</li>
          <li>How many hours and what duties are expected?</li>
          <li>What private room, meals, and insurance arrangements are included?</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Frequently asked questions
        </h2>
        <div className="mt-3 space-y-5">
          {faq.map((item) => (
            <article key={item.question}>
              <h3 className="font-black text-[#25302d]">{item.question}</h3>
              <p className="mt-1">{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Official source</h2>
        <p className="mt-2">
          Read the official English-language{" "}
          <a
            className="font-black text-[#25302d] underline"
            href="https://www.arbeitsagentur.de/api/download/datei/au-pair-in-germany-en_ba030535.pdf"
          >
            Federal Employment Agency guide for au pairs in German families
          </a>{" "}
          and check visa requirements with the{" "}
          <a
            className="font-black text-[#25302d] underline"
            href="https://www.auswaertiges-amt.de/en/visa-service/215870-215870"
          >
            German Federal Foreign Office
          </a>
          .
        </p>
        <p className="mt-3">
          Browse current{" "}
          <Link
            className="font-black text-[#25302d]"
            href="/search-family?country=Germany"
          >
            host families in Germany
          </Link>{" "}
          or{" "}
          <Link className="font-black text-[#25302d]" href="/search-aupair">
            available au pair profiles
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
      </section>
    </LegalPage>
  );
}
