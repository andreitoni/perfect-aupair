import { AuPairCostCalculator } from "@/app/de/_components/AuPairCostCalculator";
import { GermanSeoPage, GERMAN_FEDERAL_AU_PAIR_URL } from "@/app/de/_components/GermanSeoPage";
import { createGermanPublicPageMetadata } from "@/lib/seo/public-metadata";

export const metadata = createGermanPublicPageMetadata({
  title: "Au-pair-Kosten in Deutschland 2026 | Gastfamilien",
  description:
    "Au-pair-Kosten in Deutschland berechnen: kostenloser Rechner für Taschengeld, Sprachkurs, Fahrtkosten, Versicherung und Verpflegung.",
  path: "/de/au-pair-kosten-deutschland",
});

const faq = [
  {
    question: "Wie hoch ist das Taschengeld für ein Au-pair in Deutschland?",
    answer:
      "Das Merkblatt der Bundesagentur für Arbeit nennt 280 Euro pro Monat. Es handelt sich um Taschengeld und nicht um einen üblichen Arbeitslohn.",
  },
  {
    question: "Wer bezahlt den Deutschkurs?",
    answer:
      "Die Gastfamilie beteiligt sich an tatsächlich entstehenden Kosten des Spracherwerbs mit mindestens 70 Euro pro Monat beziehungsweise bis zu 840 Euro bei zwölf Monaten. Erforderliche Fahrtkosten zum geeigneten nächstgelegenen Deutschkurs kommen hinzu.",
  },
  {
    question: "Wer trägt die Versicherungskosten?",
    answer:
      "Für Krankheit, Schwangerschaft und Geburt sowie Unfall muss Versicherungsschutz bestehen. Nach dem Merkblatt der Bundesagentur für Arbeit trägt die Gastfamilie die Versicherungsbeiträge.",
  },
];

export default function AuPairCostsGermanyPage() {
  const calculatorStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Au-pair-Kostenrechner Deutschland",
    description:
      "Kostenloser Rechner für die voraussichtlichen monatlichen und gesamten Au-pair-Kosten einer Gastfamilie in Deutschland.",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any",
    url: "https://perfectaupair.example/de/au-pair-kosten-deutschland",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
    },
  };

  return (
    <GermanSeoPage
      eyebrow="Kostenübersicht für Gastfamilien"
      title="Au-pair-Kosten in Deutschland 2026"
      description="Neben dem monatlichen Taschengeld entstehen Kosten für Sprachförderung, Fahrt zum Sprachkurs, Versicherung sowie Unterkunft und Verpflegung. Planen Sie zusätzlich einen realistischen Puffer für den Familienalltag ein."
      path="/de/au-pair-kosten-deutschland"
      faq={faq}
      editorialSources={[
        {
          name: "Bundesagentur für Arbeit: Au-pair",
          href: GERMAN_FEDERAL_AU_PAIR_URL,
        },
      ]}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(calculatorStructuredData),
        }}
      />

      <AuPairCostCalculator />

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Pflichtbestandteile im Überblick</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#ccd8d4]">
                <th className="py-2 pr-4 font-black text-[#25302d]">Kostenpunkt</th>
                <th className="py-2 pr-4 font-black text-[#25302d]">Richtwert</th>
                <th className="py-2 font-black text-[#25302d]">Hinweis</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#e1e8e5]"><td className="py-3 pr-4">Taschengeld</td><td className="py-3 pr-4">280 € monatlich</td><td className="py-3">Unabhängig von der konkreten Stundenzahl</td></tr>
              <tr className="border-b border-[#e1e8e5]"><td className="py-3 pr-4">Sprachkurs</td><td className="py-3 pr-4">mindestens 70 € monatlich</td><td className="py-3">Nur soweit entsprechende Ausgaben tatsächlich anfallen</td></tr>
              <tr className="border-b border-[#e1e8e5]"><td className="py-3 pr-4">Fahrt zum Sprachkurs</td><td className="py-3 pr-4">je nach Wohnort</td><td className="py-3">Zusätzlich zum Sprachkursbeitrag</td></tr>
              <tr className="border-b border-[#e1e8e5]"><td className="py-3 pr-4">Versicherung</td><td className="py-3 pr-4">je nach Tarif</td><td className="py-3">Kranken- und Unfallversicherung erforderlich</td></tr>
              <tr><td className="py-3 pr-4">Zimmer und Verpflegung</td><td className="py-3 pr-4">individuell</td><td className="py-3">Für das Au-pair kostenlos bereitzustellen</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Zusätzliche Ausgaben einplanen</h2>
        <p className="mt-2">
          Je nach Familie kommen Kosten für ein Nahverkehrsticket, gemeinsame
          Ausflüge, Telefon, zusätzliche Lebensmittel oder die Nutzung eines
          Autos hinzu. An- und Rückreise trägt nach dem Merkblatt grundsätzlich
          das Au-pair, Familien können sich aber freiwillig beteiligen.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Quelle und Aktualität</h2>
        <p className="mt-2">
          Die Beträge basieren auf den aktuell veröffentlichten Informationen der{" "}
          <a className="font-black text-[#25302d] underline" href={GERMAN_FEDERAL_AU_PAIR_URL} rel="noreferrer">
            Bundesagentur für Arbeit
          </a>. Prüfen Sie die Angaben vor Vertragsabschluss erneut.
        </p>
      </section>
    </GermanSeoPage>
  );
}
