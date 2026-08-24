import {
  GERMAN_FEDERAL_AU_PAIR_CONTRACT_URL,
  GERMAN_FEDERAL_AU_PAIR_URL,
  GermanSeoPage,
} from "@/app/de/_components/GermanSeoPage";
import { AuPairPreparationChecklist } from "@/app/de/_components/AuPairPreparationChecklist";
import { createGermanPublicPageMetadata } from "@/lib/seo/public-metadata";

const PATH = "/de/au-pair-vertrag-deutschland";

export const metadata = createGermanPublicPageMetadata({
  title: "Au-pair-Vertrag Deutschland 2026 | Muster & Checkliste",
  description:
    "Was gehört in einen Au-pair-Vertrag? Offizielles Muster der Bundesagentur für Arbeit, Arbeitszeit, Taschengeld, Urlaub und Kündigung im Überblick.",
  path: PATH,
});

const faq = [
  {
    question: "Gibt es einen offiziellen Mustervertrag für Au-pairs?",
    answer:
      "Die Bundesagentur für Arbeit veröffentlicht einen rechtsunverbindlichen Mustertext für eine Au-pair-Beschäftigung. Familien sollten ihn vollständig ausfüllen und bei individuellen Rechtsfragen fachkundigen Rat einholen.",
  },
  {
    question: "Wann sollte der Au-pair-Vertrag unterschrieben werden?",
    answer:
      "Der Vertrag sollte vor Beginn des Aufenthalts und bei einem Visumverfahren rechtzeitig vor dem Antrag vollständig besprochen und von beiden Seiten unterschrieben werden.",
  },
  {
    question: "Sollten Arbeitszeiten und Aufgaben im Vertrag stehen?",
    answer:
      "Ja. Ein Wochenplan oder eine ergänzende schriftliche Vereinbarung verhindert Missverständnisse zu Kinderbetreuung, leichten Hausarbeiten, freien Abenden und zusätzlichen Betreuungszeiten.",
  },
];

export default function AuPairContractGermanyPage() {
  return (
    <GermanSeoPage
      eyebrow="Vereinbarung für Gastfamilie und Au-pair"
      title="Au-pair-Vertrag in Deutschland: Muster und Checkliste"
      description="Ein klarer Vertrag schützt beide Seiten. Er sollte nicht nur Beginn und Ende nennen, sondern auch Aufgaben, Arbeitszeit, Freizeit, Urlaub, Taschengeld, Sprachkurs, Versicherung und die Regeln für eine Beendigung festhalten."
      path={PATH}
      faq={faq}
      editorialSources={[
        {
          name: "Bundesagentur für Arbeit: Au-pair",
          href: GERMAN_FEDERAL_AU_PAIR_URL,
        },
        {
          name: "Offizieller Mustervertrag der Bundesagentur für Arbeit",
          href: GERMAN_FEDERAL_AU_PAIR_CONTRACT_URL,
        },
      ]}
    >
      <AuPairPreparationChecklist variant="contract" />

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Offiziellen Mustervertrag verwenden
        </h2>
        <p className="mt-2">
          Die Bundesagentur für Arbeit stellt einen rechtsunverbindlichen{" "}
          <a
            className="font-black text-[#25302d] underline"
            href={GERMAN_FEDERAL_AU_PAIR_CONTRACT_URL}
            rel="noreferrer"
          >
            Mustervertrag für Au-pairs als PDF
          </a>{" "}
          bereit. Das Muster ist eine gute Grundlage, ersetzt aber keine
          individuelle Rechtsberatung und keine Prüfung der aktuellen
          Visumvorgaben.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Diese Punkte sollten schriftlich geregelt sein
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Vollständige Angaben von Gastfamilie und Au-pair.</li>
          <li>Beginn, Ende und geplante Dauer des Au-pair-Verhältnisses.</li>
          <li>Konkrete Aufgaben bei Kinderbetreuung und leichten Hausarbeiten.</li>
          <li>Arbeitszeit, Babysitting, freie Abende und freie Tage.</li>
          <li>Taschengeld sowie Zahlungszeitpunkt und Zahlungsweg.</li>
          <li>Eigenes Zimmer, Verpflegung und Nutzung gemeinsamer Bereiche.</li>
          <li>Sprachkursbeitrag und Fahrtkosten zum Sprachkurs.</li>
          <li>Kranken-, Unfall- und erforderlicher weiterer Versicherungsschutz.</li>
          <li>Urlaub, Feiertage, Reisen und Abwesenheiten der Gastfamilie.</li>
          <li>Kündigungsfrist und Vorgehen bei Konflikten oder einem Rematch.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Den Familienalltag zusätzlich beschreiben
        </h2>
        <p className="mt-2">
          Der Mustervertrag kann durch einen realistischen Wochenplan ergänzt
          werden. Halten Sie fest, wann die Kinder betreut werden, welche Wege
          anfallen, welche Hausarbeiten leicht und kindbezogen sind und welche
          Aufgaben ausdrücklich nicht erwartet werden. Besprechen Sie außerdem
          Privatsphäre, Gäste, Auto, Internet, Ernährung und gemeinsame Reisen.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Quelle und Aktualität
        </h2>
        <p className="mt-2">
          Prüfen Sie vor der Unterschrift die aktuellen Hinweise und Downloads
          der{" "}
          <a
            className="font-black text-[#25302d] underline"
            href={GERMAN_FEDERAL_AU_PAIR_URL}
            rel="noreferrer"
          >
            Bundesagentur für Arbeit
          </a>
          . Bei einem Visumverfahren können die zuständige deutsche
          Auslandsvertretung und Ausländerbehörde weitere Unterlagen verlangen.
        </p>
      </section>

      <section className="rounded-[1.15rem] bg-[#eef5f3] p-5 ring-1 ring-[#cdded9]">
        <h2 className="text-xl font-black text-[#25302d]">
          Kosten vor der Unterschrift berechnen
        </h2>
        <p className="mt-2">
          Nutzen Sie den kostenlosen{" "}
          <a
            className="font-black text-[#25302d] underline"
            href="/de/au-pair-kosten-deutschland"
          >
            Au-pair-Kostenrechner
          </a>
          , um die im Vertrag vereinbarten Leistungen vollständig zu budgetieren.
        </p>
      </section>
    </GermanSeoPage>
  );
}
