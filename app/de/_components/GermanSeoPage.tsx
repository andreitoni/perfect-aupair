import { LegalPage } from "@/components/layout/LegalPage";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { getDictionary } from "@/lib/i18n/translations";
import Link from "next/link";
import type { ReactNode } from "react";
import { SITE_NAME, SITE_URL } from "@/lib/site";

type FaqItem = {
  question: string;
  answer: string;
};

type GermanSeoPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  path: string;
  children: ReactNode;
  editorialSources?: { href: string; name: string }[];
  faq?: FaqItem[];
  reviewedAt?: string;
};

export function GermanSeoPage({
  eyebrow,
  title,
  description,
  path,
  children,
  editorialSources = [],
  faq = [],
  reviewedAt = "2026-08-13",
}: GermanSeoPageProps) {
  const faqStructuredData = faq.length
    ? {
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
      }
    : null;
  const articleStructuredData = editorialSources.length
    ? {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        description,
        inLanguage: "de-DE",
        mainEntityOfPage: `${SITE_URL}${path}`,
        dateModified: reviewedAt,
        author: {
          "@type": "Organization",
          name: `${SITE_NAME} Redaktion`,
          url: `${SITE_URL}/about`,
        },
        publisher: {
          "@type": "Organization",
          name: SITE_NAME,
          url: SITE_URL,
        },
        citation: editorialSources.map((source) => source.href),
      }
    : null;

  return (
    <I18nProvider
      initialLocale="de"
      dictionary={getDictionary("de")}
      preferInitialLocale
    >
      <LegalPage
        eyebrow={eyebrow}
        title={title}
        description={description}
        showLanguageMenu={false}
        breadcrumbs={[
          { name: "Ratgeber für Gastfamilien", path: "/de/ratgeber" },
          ...(path === "/de/ratgeber" ? [] : [{ name: title, path }]),
        ]}
      >
      {articleStructuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleStructuredData) }}
        />
      ) : null}
      {faqStructuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
        />
      ) : null}

      {editorialSources.length ? (
        <aside
          aria-label="Redaktionelle Informationen"
          className="rounded-[1.15rem] bg-white p-4 ring-1 ring-[#d8e4e0]"
        >
          <p className="font-black text-[#25302d]">Perfect AuPair Redaktion</p>
          <p className="mt-1 text-xs leading-5 text-[#66736f]">
            Redaktionell geprüft am{" "}
            <time dateTime={reviewedAt}>13. August 2026</time> anhand der
            unten genannten offiziellen Quellen. Wir erklären die Vorgaben in
            verständlicher Form und ergänzen praktische Planungshilfen; wir
            ersetzen keine Rechts- oder Visumberatung.
          </p>
          <p className="mt-2 text-xs font-black text-[#52636a]">
            Offizielle Quellen:{" "}
            {editorialSources.map((source, index) => (
              <span key={source.href}>
                {index > 0 ? " · " : ""}
                <a
                  className="underline"
                  href={source.href}
                  rel="noreferrer"
                >
                  {source.name}
                </a>
              </span>
            ))}
          </p>
        </aside>
      ) : null}

      {children}

      {faq.length ? (
        <section>
          <h2 className="text-xl font-black text-[#25302d]">
            Häufige Fragen
          </h2>
          <div className="mt-3 space-y-4">
            {faq.map((item) => (
              <div key={item.question}>
                <h3 className="font-black text-[#25302d]">{item.question}</h3>
                <p className="mt-1">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[1.15rem] bg-[#eef5f3] p-5 ring-1 ring-[#cdded9]">
        <h2 className="text-xl font-black text-[#25302d]">
          Kostenlos bei Perfect AuPair starten
        </h2>
        <p className="mt-2">
          Familien können aktuelle Au-pair-Profile ansehen, ein eigenes Profil
          erstellen und Nachrichten senden. Registrierung und Nachrichten sind
          kostenlos – ohne versteckte Kontaktgebühr.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href="/search-aupair"
            className="rounded-full bg-[#25302d] px-5 py-2.5 text-sm font-black text-white transition hover:bg-[#35413e]"
          >
            Au-pairs ansehen
          </a>
          <Link
            href="/login?mode=register&account_type=family"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-[#25302d] ring-1 ring-[#bccbc7] transition hover:bg-[#f8fbfa]"
          >
            Als Familie registrieren
          </Link>
        </div>
      </section>

      <nav aria-label="Weitere Ratgeber für Gastfamilien">
        <h2 className="text-xl font-black text-[#25302d]">Mehr erfahren</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <h3 className="font-black text-[#25302d]">Deutschland</h3>
            <div className="mt-1 flex flex-col items-start gap-1">
              <Link className="font-black text-[#25302d] underline" href="/de/au-pair-finden">Au-pair finden</Link>
              <Link className="font-black text-[#25302d] underline" href="/de/gastfamilie-werden">Gastfamilie werden</Link>
              <Link className="font-black text-[#25302d] underline" href="/de/au-pair-kosten-deutschland">Kosten</Link>
              <Link className="font-black text-[#25302d] underline" href="/de/au-pair-voraussetzungen-deutschland">Voraussetzungen</Link>
              <Link className="font-black text-[#25302d] underline" href="/de/au-pair-vertrag-deutschland">Vertrag</Link>
              <Link className="font-black text-[#25302d] underline" href="/de/au-pair-visum-deutschland">Visum</Link>
              <Link className="font-black text-[#25302d] underline" href="/de/au-pair-arbeitszeit-deutschland">Arbeitszeit</Link>
              <Link className="font-black text-[#25302d] underline" href="/de/au-pair-taschengeld-deutschland">Taschengeld</Link>
            </div>
          </div>
          <div>
            <h3 className="font-black text-[#25302d]">Österreich</h3>
            <div className="mt-1 flex flex-col items-start gap-1">
              <Link className="font-black text-[#25302d] underline" href="/de/au-pair-finden-oesterreich">Au-pair finden</Link>
              <Link className="font-black text-[#25302d] underline" href="/de/gastfamilie-werden-oesterreich">Gastfamilie werden</Link>
              <Link className="font-black text-[#25302d] underline" href="/de/au-pair-kosten-oesterreich">Kosten</Link>
            </div>
          </div>
          <div>
            <h3 className="font-black text-[#25302d]">Schweiz</h3>
            <div className="mt-1 flex flex-col items-start gap-1">
              <Link className="font-black text-[#25302d] underline" href="/de/au-pair-finden-schweiz">Au-pair finden</Link>
              <Link className="font-black text-[#25302d] underline" href="/de/gastfamilie-werden-schweiz">Gastfamilie werden</Link>
              <Link className="font-black text-[#25302d] underline" href="/de/au-pair-kosten-schweiz">Kosten</Link>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs">
          Zuletzt anhand der verlinkten offiziellen Quellen geprüft:{" "}
          {editorialSources.length ? "13. August 2026" : "8. August 2026"}.
          Rechtliche und behördliche Anforderungen können sich ändern.
          Prüfen Sie Ihre Situation immer bei den zuständigen Behörden. Perfect
          AuPair ist eine Matching-Plattform und keine Vermittlungsagentur oder
          Rechtsberatung.
        </p>
      </nav>
      </LegalPage>
    </I18nProvider>
  );
}

export const GERMAN_FEDERAL_AU_PAIR_URL =
  "https://www.arbeitsagentur.de/unternehmen/arbeitskraefte/au-pair";

export const GERMAN_FEDERAL_AU_PAIR_CONTRACT_URL =
  "https://www.arbeitsagentur.de/datei/aupair-vertrag_ba030510.pdf";

export const GERMAN_FOREIGN_OFFICE_VISA_URL =
  "https://www.auswaertiges-amt.de/de/service/visa-und-aufenthalt/visabestimmungen-allgemein";

export const AUSTRIA_OFFICIAL_AU_PAIR_URL =
  "https://www.usp.gv.at/themen/mitarbeiter-und-gesundheit/einstellung-mitarbeiter-und-arten-der-beschaeftigung/weitere-informationen-auslaendische-beschaeftigte/au-pair.html";

export const SWITZERLAND_OFFICIAL_AU_PAIR_URL =
  "https://www.sem.admin.ch/sem/de/home/themen/arbeit/nicht-eu_efta-angehoerige/grundlagen_zur_arbeitsmarktzulassung.html";
