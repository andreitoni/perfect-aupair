import { AUSTRIA_OFFICIAL_AU_PAIR_URL, GermanSeoPage } from "@/app/de/_components/GermanSeoPage";
import { createGermanPublicPageMetadata } from "@/lib/seo/public-metadata";

const PATH = "/de/au-pair-kosten-oesterreich";

export const metadata = createGermanPublicPageMetadata({
  title: "Au-pair-Kosten Österreich 2026 | Gastfamilien",
  description: "Au-pair-Kosten in Österreich 2026: Mindestentgelt, Sonderzahlungen, Sozialversicherung, Unterkunft, Verpflegung und Sprachkurs im Überblick.",
  path: PATH,
  language: "de-AT",
  locale: "de_AT",
});

const faq = [
  { question: "Wie hoch ist das Mindestentgelt 2026?", answer: "Das österreichische Unternehmensserviceportal nennt für 2026 mindestens 551,10 Euro monatlich bei 16,5 Wochenstunden einschließlich Bereitschaftszeiten." },
  { question: "Gibt es Sonderzahlungen?", answer: "Ja. Laut offizieller Übersicht wird das monatliche Mindestentgelt 15-mal pro Jahr gezahlt: zusätzlich zwei Urlaubs- und eine Weihnachts-Sonderzahlung, bei kürzerer Dauer anteilig." },
  { question: "Dürfen Zimmer und Essen vom Mindestentgelt abgezogen werden?", answer: "Kostenlose Unterkunft und Verpflegung zählen laut offizieller Übersicht nicht zum Entgelt. Auch private Krankenversicherung und Ausgaben für Sprachkurs oder kulturelle Veranstaltungen werden nicht als Entgelt gerechnet." },
];

export default function AuPairCostsAustriaPage() {
  return (
    <GermanSeoPage eyebrow="Kosten für Gastfamilien in Österreich" title="Au-pair-Kosten in Österreich 2026" description="Zum Mindestentgelt kommen Sozialversicherung, Unterkunft, Verpflegung und je nach Situation Krankenversicherung, Sprachkurs, Mobilität sowie Behördenkosten. Planen Sie den Gesamtaufwand vor der Zusage realistisch." path={PATH} faq={faq}>
      <section>
        <h2 className="text-xl font-black text-[#25302d]">Pflichtbestandteile im Überblick</h2>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[34rem] border-collapse text-left"><thead><tr className="border-b border-[#ccd8d4]"><th className="py-2 pr-4 font-black text-[#25302d]">Kostenpunkt</th><th className="py-2 pr-4 font-black text-[#25302d]">Stand 2026</th><th className="py-2 font-black text-[#25302d]">Hinweis</th></tr></thead><tbody>
          <tr className="border-b border-[#e1e8e5]"><td className="py-3 pr-4">Mindestentgelt</td><td className="py-3 pr-4">551,10 € monatlich</td><td className="py-3">Für 16,5 Wochenstunden einschließlich Bereitschaft</td></tr>
          <tr className="border-b border-[#e1e8e5]"><td className="py-3 pr-4">Sonderzahlungen</td><td className="py-3 pr-4">3 zusätzliche Monatszahlungen</td><td className="py-3">Zwei für Urlaub, eine zu Weihnachten; anteilig bei kürzerer Dauer</td></tr>
          <tr className="border-b border-[#e1e8e5]"><td className="py-3 pr-4">Sozialversicherung</td><td className="py-3 pr-4">abhängig vom Fall</td><td className="py-3">Anmeldung bei der gesetzlichen Sozialversicherung ist erforderlich</td></tr>
          <tr><td className="py-3 pr-4">Zimmer und Verpflegung</td><td className="py-3 pr-4">individuell</td><td className="py-3">Kostenlos bereitzustellen, nicht Teil des Mindestentgelts</td></tr>
        </tbody></table></div>
      </section>
      <section><h2 className="text-xl font-black text-[#25302d]">Zusätzliche Kosten einplanen</h2><p className="mt-2">Je nach Staatsangehörigkeit und Vertrag kommen private Krankenversicherung, Sprachkurs, Freizeit- und Kulturangebote, Nahverkehr, Telefon, Haushaltsmehrkosten sowie Gebühren für Behördenwege hinzu. Ein pauschaler Gesamtbetrag wäre deshalb irreführend.</p></section>
      <section><h2 className="text-xl font-black text-[#25302d]">Quelle und Aktualität</h2><p className="mt-2">Die Beträge stammen aus der offiziellen <a className="font-black text-[#25302d] underline" href={AUSTRIA_OFFICIAL_AU_PAIR_URL} rel="noreferrer">Au-pair-Übersicht des österreichischen Unternehmensserviceportals</a>. Prüfen Sie sie unmittelbar vor Vertragsabschluss erneut.</p></section>
    </GermanSeoPage>
  );
}
