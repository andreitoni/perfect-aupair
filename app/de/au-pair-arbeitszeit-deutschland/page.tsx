import {
  GERMAN_FEDERAL_AU_PAIR_URL,
  GermanSeoPage,
} from "@/app/de/_components/GermanSeoPage";
import { createGermanPublicPageMetadata } from "@/lib/seo/public-metadata";

const PATH = "/de/au-pair-arbeitszeit-deutschland";

export const metadata = createGermanPublicPageMetadata({
  title: "Au-pair-Arbeitszeit Deutschland 2026 | Stunden & Urlaub",
  description:
    "Au-pair-Arbeitszeit in Deutschland: maximal 6 Stunden täglich und 30 Stunden wöchentlich, freie Tage, Abende, Urlaub und Babysitting erklärt.",
  path: PATH,
});

const faq = [
  {
    question: "Wie viele Stunden darf ein Au-pair in Deutschland arbeiten?",
    answer:
      "Die Aufgaben einschließlich Kinderbetreuung sollen grundsätzlich auf höchstens sechs Stunden täglich und 30 Stunden wöchentlich begrenzt sein.",
  },
  {
    question: "Zählt Babysitting zur Arbeitszeit?",
    answer:
      "Ja. Auch abendliche Kinderbetreuung gehört zu den Aufgaben und muss bei der vereinbarten Gesamtarbeitszeit berücksichtigt werden.",
  },
  {
    question: "Wie viel Urlaub erhält ein Au-pair?",
    answer:
      "Bei einem Aufenthalt von zwölf Monaten nennt das Merkblatt der Bundesagentur für Arbeit vier Wochen bezahlten Erholungsurlaub. Bei kürzerer Dauer wird der Urlaub anteilig vereinbart.",
  },
];

export default function AuPairWorkingHoursGermanyPage() {
  return (
    <GermanSeoPage
      eyebrow="Zeitplan für den Familienalltag"
      title="Au-pair-Arbeitszeit in Deutschland 2026"
      description="Ein Au-pair ist keine Vollzeit-Nanny. Kinderbetreuung und leichte Hausarbeiten müssen in einem begrenzten, transparenten Zeitrahmen bleiben, damit kultureller Austausch, Sprachkurs und Erholung möglich sind."
      path={PATH}
      faq={faq}
    >
      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Arbeitszeit und Freizeit im Überblick
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#ccd8d4]">
                <th className="py-2 pr-4 font-black text-[#25302d]">Bereich</th>
                <th className="py-2 font-black text-[#25302d]">Richtwert</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#e1e8e5]"><td className="py-3 pr-4">Täglich</td><td className="py-3">höchstens 6 Stunden</td></tr>
              <tr className="border-b border-[#e1e8e5]"><td className="py-3 pr-4">Wöchentlich</td><td className="py-3">höchstens 30 Stunden</td></tr>
              <tr className="border-b border-[#e1e8e5]"><td className="py-3 pr-4">Freie Tage</td><td className="py-3">mindestens 1,5 volle Tage pro Woche</td></tr>
              <tr className="border-b border-[#e1e8e5]"><td className="py-3 pr-4">Freie Abende</td><td className="py-3">mindestens 4 pro Woche</td></tr>
              <tr className="border-b border-[#e1e8e5]"><td className="py-3 pr-4">Sonntag</td><td className="py-3">mindestens 1 freier Sonntag pro Monat</td></tr>
              <tr><td className="py-3 pr-4">Urlaub bei 12 Monaten</td><td className="py-3">4 Wochen bezahlt</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Was zählt zur Arbeitszeit?
        </h2>
        <p className="mt-2">
          Zur Arbeitszeit gehören alle vereinbarten Aufgaben: Kinder wecken und
          fertig machen, Wege zu Schule oder Kindergarten, Betreuung,
          Zubereitung einfacher Mahlzeiten für die Kinder, kindbezogene Wäsche,
          leichte Hausarbeiten und Babysitting. Bereitschaftszeiten sollten
          ebenfalls vorab besprochen und realistisch berücksichtigt werden.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Einen verlässlichen Wochenplan erstellen
        </h2>
        <p className="mt-2">
          Tragen Sie feste Arbeitsblöcke, Sprachkurs, freie Abende und freie Tage
          in einen gemeinsamen Wochenplan ein. Ändert sich der Bedarf, sollte
          die Familie dies rechtzeitig ansprechen. Zusätzliche Stunden werden
          nicht zur dauerhaften Normalität, sondern durch entsprechende
          Freizeit ausgeglichen.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Quelle und Aktualität
        </h2>
        <p className="mt-2">
          Die Angaben orientieren sich am aktuellen Merkblatt der{" "}
          <a
            className="font-black text-[#25302d] underline"
            href={GERMAN_FEDERAL_AU_PAIR_URL}
            rel="noreferrer"
          >
            Bundesagentur für Arbeit
          </a>
          . Halten Sie Arbeitszeit, Urlaub und Freizeit zusätzlich im
          Au-pair-Vertrag fest.
        </p>
      </section>
    </GermanSeoPage>
  );
}
