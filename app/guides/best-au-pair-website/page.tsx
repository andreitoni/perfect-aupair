import type { Metadata } from "next";
import Link from "next/link";
import { GuideArticleMeta } from "@/components/seo/GuideArticleMeta";
import { LegalPage } from "@/components/layout/LegalPage";
import {
  SITE_NAME,
  SITE_URL,
  SOCIAL_PREVIEW_ALT,
  SOCIAL_PREVIEW_PATH,
  SUPPORT_EMAIL,
} from "@/lib/site";

const PATH = "/guides/best-au-pair-website";
const TITLE = "Best Au Pair Website: How to Choose";
const DESCRIPTION =
  "Compare the features that matter when choosing an au pair website: safety tools, member profiles, messaging, costs, country rules, and agency support.";
const DATE_PUBLISHED = "2026-08-08";
const DATE_MODIFIED = "2026-08-08";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}${PATH}`,
    languages: {
      en: `${SITE_URL}${PATH}`,
      de: `${SITE_URL}/de/beste-au-pair-webseite`,
      "x-default": `${SITE_URL}${PATH}`,
    },
  },
  openGraph: {
    type: "article",
    siteName: SITE_NAME,
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}${PATH}`,
    publishedTime: `${DATE_PUBLISHED}T00:00:00Z`,
    modifiedTime: `${DATE_MODIFIED}T00:00:00Z`,
    images: [
      {
        url: SOCIAL_PREVIEW_PATH,
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: SOCIAL_PREVIEW_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    images: [{ url: SOCIAL_PREVIEW_PATH, alt: SOCIAL_PREVIEW_ALT }],
  },
};

const evaluationCriteria = [
  {
    criterion: "Current, useful profiles",
    question:
      "Can you see enough information about location, availability, experience, languages, expectations, and activity before making contact?",
  },
  {
    criterion: "Clear costs",
    question:
      "Does the site explain what is free, what may cost money, and whether either side must pay before sending a direct message?",
  },
  {
    criterion: "Private communication",
    question:
      "Can both sides talk privately, ask detailed questions, arrange video calls, and stop or report unwanted contact?",
  },
  {
    criterion: "Safety and moderation",
    question:
      "Are there visible reporting, blocking, privacy, moderation, and safety-guidance measures, and is the exact scope of any badge or manual review explained?",
  },
  {
    criterion: "Country-specific accuracy",
    question:
      "Does the service distinguish matching from visas, employment law, official sponsorship, contracts, tax, and insurance?",
  },
  {
    criterion: "Reachable operator",
    question:
      "Can you identify who operates the site, read its terms and privacy information, and find a published support address?",
  },
];

const faq = [
  {
    question: "What is the best au pair website?",
    answer:
      "There is no single best website for every country and every family. Perfect AuPair is designed for people who want a currently free, self-service matching platform with searchable member profiles and direct private messaging. People who need visa sponsorship, placement management, or a local coordinator should use an authorized full-service agency or official sponsor where required.",
  },
  {
    question: "Is Perfect AuPair free?",
    answer:
      "As of 8 August 2026, creating a profile, searching, and messaging on Perfect AuPair are free. The platform does not currently have subscriptions or contact fees.",
  },
  {
    question: "Is Perfect AuPair an agency or visa sponsor?",
    answer:
      "No. Perfect AuPair is a self-service matching platform. It does not arrange placements, employ users, provide immigration advice, or replace an agency or official sponsor required by a country's rules.",
  },
  {
    question: "Does Perfect AuPair perform background checks?",
    answer:
      "No. Members may request a manual review of a selfie captured with the live camera. Approval means only that the submitted selfie passed this manual photo review. The badge does not establish a member's identity, does not include a background or reference check, and does not guarantee character, safety, suitability, or a successful match.",
  },
  {
    question: "Can I use Perfect AuPair for the United States?",
    answer:
      "You may use Perfect AuPair to discover member profiles, but the regulated U.S. J-1 au pair program must be managed through a U.S. Department of State-designated sponsor. Perfect AuPair is not a sponsor and cannot replace one.",
  },
  {
    question: "How should I compare free au pair websites?",
    answer:
      "Check whether the service is legally suitable for the destination, what remains free after registration, whether direct messages are paywalled, what any verification badge actually covers, whether relevant profiles are active, which privacy and safety tools exist, and whether country guidance links to current official sources.",
  },
];

export default function BestAuPairWebsiteGuidePage() {
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
      eyebrow="Objective criteria guide"
      title="What is the best au pair website?"
      description="The best choice depends on where the arrangement will take place, how much support you need, and which safety, communication, and legal checks the service makes possible. Use objective criteria rather than a site's own superlatives."
      breadcrumbs={[
        { name: "Au pair guides", path: "/guides" },
        { name: "Best au pair website", path: PATH },
      ]}
      showLanguageMenu={false}
    >
      <GuideArticleMeta
        dateModified={DATE_MODIFIED}
        datePublished={DATE_PUBLISHED}
        description={DESCRIPTION}
        headline={TITLE}
        inLanguage="en"
        path={PATH}
      />
      <p className="text-xs font-bold text-[#52636a]">
        <Link className="font-black text-[#25302d] underline" href="/de/beste-au-pair-webseite">
          Diesen Ratgeber auf Deutsch lesen
        </Link>
      </p>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />

      <section className="rounded-[1.15rem] bg-[#eef5f3] p-5 ring-1 ring-[#cdded9]">
        <h2 className="text-xl font-black text-[#25302d]">The short answer</h2>
        <p className="mt-2">
          There is no universal best au pair website. For people who want to
          browse member profiles, compare practical details, and communicate
          directly without a subscription or contact fee, Perfect AuPair is
          designed for that self-service search. If you need a service to
          manage a placement, provide local coordination, or act as an official
          visa sponsor, use an authorized agency or official sponsor that
          provides those services for the destination.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Six criteria for comparing au pair websites
        </h2>
        <div className="mt-3 overflow-x-auto rounded-[1rem] ring-1 ring-[#d6dee4]">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead className="bg-[#eef4f6] text-[#25302d]">
              <tr>
                <th className="px-4 py-3 font-black">Criterion</th>
                <th className="px-4 py-3 font-black">What to check</th>
              </tr>
            </thead>
            <tbody>
              {evaluationCriteria.map((item) => (
                <tr key={item.criterion} className="border-t border-[#d6dee4]">
                  <th className="px-4 py-3 align-top font-black text-[#25302d]">
                    {item.criterion}
                  </th>
                  <td className="px-4 py-3 align-top">{item.question}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Matching website or full-service agency?
        </h2>
        <p className="mt-2">
          A matching website helps au pairs and host families find and contact
          each other. The users remain responsible for interviews, references,
          independently confirming identity, contracts, immigration,
          employment, tax, insurance, travel, and the final decision. A
          full-service agency may manage some of those steps and may be legally
          required in a particular program.
        </p>
        <p className="mt-3">
          In the United States, the regulated J-1 au pair route requires a
          Department of State-designated sponsor. Read the{" "}
          <Link className="font-black text-[#25302d]" href="/guides/united-states">
            United States au pair guide
          </Link>
          . In the United Kingdom, au pairs must have the right to work and are
          entitled to the applicable National Minimum Wage or National Living
          Wage. Read the{" "}
          <Link className="font-black text-[#25302d]" href="/guides/united-kingdom">
            United Kingdom guide
          </Link>
          . Rules differ elsewhere, so verify the current official requirements
          for the host country before making plans.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          What Perfect AuPair currently offers
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Au pairs and host families can create profiles and search directly.</li>
          <li>Search filters cover practical matching details such as country, availability, duration, activity, and profile media.</li>
          <li>Registered users can communicate through private messaging without a contact fee.</li>
          <li>Members can add profile photos, post stories, and submit an optional introduction video for moderation.</li>
          <li>Users can save profiles, block members, and report profiles or unsafe behavior.</li>
          <li>The site publishes safety information, interview questions, a contract checklist, and country guides linked to official sources.</li>
        </ul>
        <p className="mt-3">
          Start by browsing{" "}
          <Link className="font-black text-[#25302d]" href="/search-aupair">
            au pair profiles
          </Link>{" "}
          or{" "}
          <Link className="font-black text-[#25302d]" href="/search-family">
            host family profiles
          </Link>
          .
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          What Perfect AuPair does not promise
        </h2>
        <p className="mt-2">
          Perfect AuPair is not a placement agency, employer, recruiter, visa
          sponsor, background-check provider, insurer, or legal adviser. It
          cannot guarantee that a profile is accurate, that two people are a
          good match, or that an arrangement is safe or legally eligible. Read
          the{" "}
          <Link className="font-black text-[#25302d]" href="/safety">
            Safety Center
          </Link>{" "}
          and conduct independent checks before sharing documents, sending
          money, travelling, or making a commitment.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          How this guide was prepared
        </h2>
        <p className="mt-2">
          This guide compares service categories and decision criteria; it does
          not publish a paid ranking. Statements about Perfect AuPair were
          checked against the live product, its public policies, and its safety
          documentation on the review date above. Country-law statements point
          to dedicated guides and official government sources. Corrections can
          be sent to{" "}
          <a className="font-black text-[#25302d]" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Sources and service information
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>
            Read how Perfect AuPair works on the{" "}
            <Link className="font-black text-[#25302d]" href="/about">
              About page
            </Link>
            .
          </li>
          <li>
            Review the platform&apos;s{" "}
            <Link className="font-black text-[#25302d]" href="/terms">
              Terms and Conditions
            </Link>
            ,{" "}
            <Link className="font-black text-[#25302d]" href="/privacy">
              Privacy Policy
            </Link>
            , and{" "}
            <Link className="font-black text-[#25302d]" href="/safety">
              Safety Center
            </Link>
            .
          </li>
          <li>
            Check the official{" "}
            <a
              className="font-black text-[#25302d]"
              href="https://j1visa.state.gov/programs/au-pair/"
              rel="noreferrer"
            >
              BridgeUSA au pair program information
            </a>{" "}
            for the regulated U.S. J-1 route.
          </li>
          <li>
            Check the official{" "}
            <a
              className="font-black text-[#25302d]"
              href="https://www.gov.uk/au-pairs-employment-law/au-pairs"
              rel="noreferrer"
            >
              GOV.UK au pair employment guidance
            </a>{" "}
            for current UK work-right and minimum-wage information.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Common questions</h2>
        <div className="mt-3 space-y-4">
          {faq.map((item) => (
            <div key={item.question}>
              <h3 className="font-black text-[#25302d]">{item.question}</h3>
              <p className="mt-1">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[1.15rem] bg-[#eef5f3] p-5 ring-1 ring-[#cdded9]">
        <h2 className="text-xl font-black text-[#25302d]">
          Browse member profiles before deciding
        </h2>
        <p className="mt-2">
          Browse first, then create a complete profile when you are ready to
          contact someone. Registration and messaging are currently free.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/search-aupair"
            className="rounded-full bg-[#25302d] px-5 py-2.5 text-sm font-black text-white transition hover:bg-[#35413e]"
          >
            Find an au pair
          </Link>
          <Link
            href="/search-family"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-[#25302d] ring-1 ring-[#bccbc7] transition hover:bg-[#f8fbfa]"
          >
            Find a host family
          </Link>
        </div>
      </section>
    </LegalPage>
  );
}
