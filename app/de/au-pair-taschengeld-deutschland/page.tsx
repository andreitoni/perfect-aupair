import {
  GERMAN_FEDERAL_AU_PAIR_URL,
  GermanSeoPage,
} from "@/app/de/_components/GermanSeoPage";
import { createGermanPublicPageMetadata } from "@/lib/seo/public-metadata";

const PATH = "/de/au-pair-taschengeld-deutschland";

export const metadata = createGermanPublicPageMetadata({
  title: "Au-pair-Taschengeld Deutschland 2026 | 280 Euro",
  description:
    "Au-pair-Taschengeld in Deutschland: 280 Euro monatlich sowie Sprachkurs, Fahrtkosten, Versicherung, Unterkunft und Verpflegung erklärt.",
  path: PATH,
});

const faq = [
  {
    question: "Wie hoch ist das Au-pair-Taschengeld in Deutschland?",
    answer:
      "Das Merkblatt der Bundesagentur für Arbeit nennt 280 Euro Taschengeld pro Monat. Dieser Betrag ist kein üblicher Arbeitslohn.",
  },
  {
    question: "Darf die Gastfamilie Unterkunft oder Essen abziehen?",
    answer:
      "Nein. Ein eigenes Zimmer sowie Unterkunft und Verpflegung gehören zum Au-pair-Verhältnis und werden von der Gastfamilie kostenlos bereitgestellt.",
  },
  {
    question: "Ist der Sprachkurs im Taschengeld enthalten?",
    answer:
      "Nein. Die Beteiligung der Gastfamilie am tatsächlich besuchten Sprachkurs und die erforderlichen Fahrtkosten kommen zusätzlich zum Taschengeld hinzu.",
  },
];

export default function AuPairPocketMoneyGermanyPage() {
  return (
    <GermanSeoPage
      eyebrow="Monatliche Leistungen der Gastfamilie"
      title="Au-pair-Taschengeld in Deutschland 2026"
      description="Die Bundesagentur für Arbeit nennt 280 Euro Taschengeld pro Monat. Hinzu kommen kostenlose Unterkunft und Verpflegung sowie Leistungen für Sprachkurs, Fahrtkosten und Versicherung."
      path={PATH}
      faq={faq}
      editorialSources={[
        {
          name: "Bundesagentur für Arbeit: Au-pair",
          href: GERMAN_FEDERAL_AU_PAIR_URL,
        },
      ]}
    >
      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          280 Euro monatliches Taschengeld
        </h2>
        <p className="mt-2">
          Das Taschengeld beträgt nach dem aktuellen Merkblatt 280 Euro pro
          Monat. Es handelt sich nicht um eine klassische Vergütung nach
          Arbeitsstunden. Vereinbaren Sie einen festen Zahlungstermin und nutzen
          Sie nach Möglichkeit einen nachvollziehbaren Zahlungsweg.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Was die Gastfamilie zusätzlich übernimmt
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Ein eigenes, angemessenes Zimmer.</li>
          <li>Kostenlose Verpflegung auch an freien Tagen und im Urlaub.</li>
          <li>Mindestens 70 Euro monatlich für einen tatsächlich besuchten Deutschkurs.</li>
          <li>Erforderliche Fahrtkosten zum nächstgelegenen geeigneten Deutschkurs.</li>
          <li>Beiträge für den erforderlichen Kranken- und Unfallversicherungsschutz.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Weitere Kosten fair besprechen
        </h2>
        <p className="mt-2">
          Nahverkehr, Telefon, gemeinsame Reisen oder private Autonutzung sind
          nicht in jeder Familie gleich geregelt. Halten Sie vor dem Match fest,
          welche Kosten übernommen werden und welche Ausgaben das Au-pair selbst
          trägt. Das Taschengeld sollte nicht nachträglich durch unklare Abzüge
          verringert werden.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Quelle und Aktualität
        </h2>
        <p className="mt-2">
          Die Beträge basieren auf den aktuell veröffentlichten Informationen
          der{" "}
          <a
            className="font-black text-[#25302d] underline"
            href={GERMAN_FEDERAL_AU_PAIR_URL}
            rel="noreferrer"
          >
            Bundesagentur für Arbeit
          </a>
          . Prüfen Sie die Werte vor Vertragsabschluss erneut, da sich offizielle
          Vorgaben ändern können.
        </p>
      </section>

      <section className="rounded-[1.15rem] bg-[#eef5f3] p-5 ring-1 ring-[#cdded9]">
        <h2 className="text-xl font-black text-[#25302d]">
          Gesamtkosten statt nur Taschengeld planen
        </h2>
        <p className="mt-2">
          Berechnen Sie Taschengeld, Sprachkurs, Fahrtkosten, Versicherung und
          Haushaltsmehrkosten mit dem kostenlosen{" "}
          <a
            className="font-black text-[#25302d] underline"
            href="/de/au-pair-kosten-deutschland"
          >
            Au-pair-Kostenrechner für Deutschland
          </a>
          .
        </p>
      </section>
    </GermanSeoPage>
  );
}
