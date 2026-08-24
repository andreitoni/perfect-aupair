import { LegalPage } from "@/components/layout/LegalPage";
import { createPublicPageMetadata } from "@/lib/seo/public-metadata";

export const metadata = createPublicPageMetadata({
  title: "Au Pair Guides for Families and Au Pairs",
  description:
    "Practical au pair guides covering contracts, interviews, safety, visas, and country requirements for Germany, the UK, the US, Sweden, and Denmark.",
  path: "/guides",
});

const guides = [
  {
    href: "/guides/best-au-pair-website",
    title: "How to choose an au pair website",
    text: "Compare legal fit, costs, profile information, communication, safety tools, and when an agency or sponsor is the better choice.",
  },
  {
    href: "/guides/au-pair-contract",
    title: "Au pair contract",
    text: "A practical agreement checklist and downloadable Perfect AuPair template before anyone travels.",
  },
  {
    href: "/guides/au-pair-interview",
    title: "Au pair interview",
    text: "Video-call questions for host families and au pairs before deciding whether to match.",
  },
  {
    href: "/guides/united-states",
    title: "United States",
    text: "J-1 au pair program basics, host family requirements, work limits, and official sponsor links.",
  },
  {
    href: "/guides/germany",
    title: "Germany",
    text: "Official information points for au pairs considering Germany and families checking program expectations.",
  },
  {
    href: "/guides/united-kingdom",
    title: "United Kingdom",
    text: "Right-to-work checks, minimum wage notes, and GOV.UK guidance for families hiring someone at home.",
  },
  {
    href: "/guides/sweden",
    title: "Sweden",
    text: "Residence rules, age, language study, hours, compensation, insurance, and official Swedish guidance.",
  },
  {
    href: "/guides/denmark",
    title: "Denmark",
    text: "Au pair permit, host family conditions, hours, pocket money, accommodation, insurance, and official Danish guidance.",
  },
];

export default function CountryGuidesPage() {
  return (
    <LegalPage
      translationScope="/guides"
      eyebrow="Guides"
      title="Au pair guides for families and au pairs"
      description="Use these guides as a starting point before agreeing to an au pair arrangement. Always verify current immigration, employment, tax, and childcare rules with official sources."
      breadcrumbs={[{ name: "Au pair guides", path: "/guides" }]}
    >
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {guides.map((guide) => (
          <a
            key={guide.href}
            href={guide.href}
            className="rounded-[1.25rem] bg-[var(--background)] p-5 ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-sm"
          >
            <h2 className="text-xl font-black text-[#25302d]">
              {guide.title}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#25302d]/70">
              {guide.text}
            </p>
          </a>
        ))}
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Important note
        </h2>
        <p className="mt-2">
          Perfect AuPair is not a law firm, visa sponsor, employment agency, or
          tax adviser. These pages are practical checklists and links to official
          sources. Rules can change, and individual circumstances matter.
        </p>
      </section>
    </LegalPage>
  );
}
