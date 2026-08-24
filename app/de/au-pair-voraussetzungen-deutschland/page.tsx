import { AuPairRequirementsChecker } from "@/app/de/_components/AuPairRequirementsChecker";
import { GermanSeoPage, GERMAN_FEDERAL_AU_PAIR_URL } from "@/app/de/_components/GermanSeoPage";
import { createGermanPublicPageMetadata } from "@/lib/seo/public-metadata";

export const metadata = createGermanPublicPageMetadata({
  title: "Au-pair Voraussetzungen Deutschland 2026",
  description:
    "Au-pair-Voraussetzungen in Deutschland: Alter, Deutsch A1, Arbeitszeit, Aufenthaltsstatus, Dauer und Anforderungen an Gastfamilien.",
  path: "/de/au-pair-voraussetzungen-deutschland",
});

const faq = [
  {
    question: "Wie alt darf ein Au-pair in Deutschland sein?",
    answer:
      "Das Mindestalter bei Beschäftigungsbeginn beträgt 18 Jahre. Bei einem erforderlichen Aufenthaltstitel darf das Höchstalter von 27 Jahren bei der Beantragung noch nicht erreicht sein.",
  },
  {
    question: "Wie gut muss ein Au-pair Deutsch sprechen?",
    answer:
      "Für Au-pairs aus Drittstaaten werden Grundkenntnisse der deutschen Sprache mindestens auf Niveau A1 erwartet. Die zuständige Auslandsvertretung oder Ausländerbehörde stellt die Kenntnisse fest.",
  },
  {
    question: "Wie lange darf ein Au-pair in Deutschland bleiben?",
    answer:
      "Das Au-pair-Verhältnis dauert nach dem Merkblatt mindestens sechs Monate und höchstens ein Jahr. Die konkrete Aufenthaltsberechtigung hängt von Staatsangehörigkeit und Einzelfall ab.",
  },
];

export default function AuPairRequirementsGermanyPage() {
  return (
    <GermanSeoPage
      eyebrow="Regeln für Au-pair und Gastfamilie"
      title="Au-pair Voraussetzungen in Deutschland 2026"
      description="Die Voraussetzungen unterscheiden sich insbesondere nach Staatsangehörigkeit. Familien und Au-pairs sollten Alter, Sprache, Aufenthaltsstatus, Familienkonstellation und den geplanten Alltag vor einer Zusage sorgfältig prüfen."
      path="/de/au-pair-voraussetzungen-deutschland"
      faq={faq}
      editorialSources={[
        {
          name: "Bundesagentur für Arbeit: Au-pair",
          href: GERMAN_FEDERAL_AU_PAIR_URL,
        },
      ]}
    >
      <AuPairRequirementsChecker />

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Anforderungen an das Au-pair</h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Mindestens 18 Jahre bei Beginn des Au-pair-Verhältnisses.</li>
          <li>Bei einem erforderlichen Aufenthaltstitel: bei Antragstellung noch nicht 27 Jahre alt.</li>
          <li>Grundkenntnisse der deutschen Sprache, bei Drittstaaten mindestens Niveau A1.</li>
          <li>Bereitschaft zu Kinderbetreuung, leichten Hausarbeiten und kulturellem Austausch.</li>
          <li>Für Drittstaatsangehörige ein Aufenthaltstitel, der die Au-pair-Tätigkeit ausdrücklich erlaubt.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Anforderungen an die Gastfamilie</h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Mindestens ein Kind unter 18 Jahren lebt dauerhaft im Haushalt.</li>
          <li>Ein eigenes Zimmer sowie kostenlose Unterkunft und Verpflegung stehen zur Verfügung.</li>
          <li>Die Familie ermöglicht einen Deutschkurs und übernimmt die vorgesehenen Beiträge und Fahrtkosten.</li>
          <li>Arbeitszeit, Freizeit, Versicherung, Urlaub und Aufgaben werden verlässlich geregelt.</li>
          <li>Bei Drittstaatsangehörigen gelten zusätzliche Anforderungen an Familiensprache und Staatsangehörigkeit eines erwachsenen Familienmitglieds.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Arbeitszeit und Freizeit</h2>
        <p className="mt-2">
          Die Aufgaben einschließlich Kinderbetreuung sollen grundsätzlich
          höchstens sechs Stunden täglich und 30 Stunden wöchentlich umfassen.
          Vorgesehen sind mindestens 1,5 volle Ruhetage pro Woche, mindestens
          ein freier Sonntag im Monat und vier freie Abende pro Woche. Bei zwölf
          Monaten nennt das Merkblatt vier Wochen bezahlten Urlaub.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">EU/EWR/Schweiz oder Drittstaat?</h2>
        <p className="mt-2">
          Au-pairs aus EU-/EWR-Staaten und der Schweiz benötigen keine Erlaubnis
          der Bundesagentur für Arbeit. Drittstaatsangehörige benötigen in der
          Regel vor der Einreise ein Visum beziehungsweise einen passenden
          Aufenthaltstitel. Maßgeblich sind immer Staatsangehörigkeit und
          individuelle Situation.
        </p>
        <p className="mt-3">
          Prüfen Sie die vollständigen aktuellen Vorgaben direkt bei der{" "}
          <a className="font-black text-[#25302d] underline" href={GERMAN_FEDERAL_AU_PAIR_URL} rel="noreferrer">
            Bundesagentur für Arbeit
          </a>{" "}
          und der zuständigen deutschen Auslandsvertretung oder Ausländerbehörde.
        </p>
      </section>

      <section className="rounded-[1.15rem] bg-[#eef5f3] p-5 ring-1 ring-[#cdded9]">
        <h2 className="text-xl font-black text-[#25302d]">
          Kosten gleich mitprüfen
        </h2>
        <p className="mt-2">
          Wenn die Grundvoraussetzungen passen, können Gastfamilien Taschengeld,
          Sprachkurs, Versicherung und weitere Ausgaben mit unserem kostenlosen{" "}
          <a
            className="font-black text-[#25302d] underline"
            href="/de/au-pair-kosten-deutschland"
          >
            Au-pair-Kostenrechner für Deutschland
          </a>{" "}
          realistisch planen.
        </p>
      </section>
    </GermanSeoPage>
  );
}
