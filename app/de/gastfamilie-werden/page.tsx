import { GermanSeoPage, GERMAN_FEDERAL_AU_PAIR_URL } from "@/app/de/_components/GermanSeoPage";
import { createGermanPublicPageMetadata } from "@/lib/seo/public-metadata";

export const metadata = createGermanPublicPageMetadata({
  title: "Gastfamilie werden in Deutschland | Au-pair aufnehmen",
  description:
    "Gastfamilie werden: Erfahren Sie, was Familien in Deutschland vor der Aufnahme eines Au-pairs zu Alltag, Zimmer, Vertrag und Pflichten wissen sollten.",
  path: "/de/gastfamilie-werden",
});

const faq = [
  {
    question: "Braucht ein Au-pair ein eigenes Zimmer?",
    answer:
      "Nach dem Merkblatt der Bundesagentur für Arbeit steht dem Au-pair grundsätzlich ein eigenes Zimmer innerhalb der Familienwohnung zur Verfügung. Unterkunft und Verpflegung werden von der Gastfamilie unentgeltlich gestellt.",
  },
  {
    question: "Welche Aufgaben darf ein Au-pair übernehmen?",
    answer:
      "Im Mittelpunkt stehen Kinderbetreuung und leichte Hausarbeiten. Kranken- oder Altenpflege gehört nicht zu den üblichen Aufgaben eines Au-pairs.",
  },
  {
    question: "Muss die Vereinbarung schriftlich sein?",
    answer:
      "Nach dem Merkblatt der Bundesagentur für Arbeit ist vor Beginn ein schriftlicher Vertrag über die gegenseitigen Rechte und Pflichten abzuschließen.",
  },
];

export default function BecomeHostFamilyGermanyPage() {
  return (
    <GermanSeoPage
      eyebrow="Für Familien in Deutschland"
      title="Gastfamilie werden und ein Au-pair aufnehmen"
      description="Ein Au-pair wird für eine begrenzte Zeit Teil des Familienalltags. Eine gute Gastfamilie bietet nicht nur Unterkunft, sondern auch klare Absprachen, Privatsphäre, Sprachförderung und respektvolle Zusammenarbeit."
      path="/de/gastfamilie-werden"
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
          Passt das Au-pair-Modell zu Ihrer Familie?
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Mindestens ein minderjähriges Kind lebt dauerhaft im Haushalt.</li>
          <li>Sie können ein eigenes Zimmer sowie kostenlose Verpflegung bereitstellen.</li>
          <li>Sie wünschen kulturellen Austausch und nicht nur günstige Kinderbetreuung.</li>
          <li>Der Tagesplan lässt Sprachkurs, Freizeit und regelmäßige freie Zeiten zu.</li>
          <li>Alle Erwachsenen im Haushalt tragen die Entscheidung mit.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Vor dem Einzug gemeinsam klären
        </h2>
        <p className="mt-2">
          Besprechen Sie schriftlich die täglichen Aufgaben, Arbeitszeiten,
          freien Tage, Taschengeld, Sprachkurs, Fahrtkosten, Versicherung,
          Urlaub, Nutzung von Auto oder öffentlichen Verkehrsmitteln,
          Hausregeln, Besucher und Kündigung. Überraschungen nach der Anreise
          belasten beide Seiten.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">Offizielle Informationen</h2>
        <p className="mt-2">
          Die verbindliche Ausgangsbasis für Familien ist die aktuelle Seite der{" "}
          <a className="font-black text-[#25302d] underline" href={GERMAN_FEDERAL_AU_PAIR_URL} rel="noreferrer">
            Bundesagentur für Arbeit
          </a>. Dort finden Sie auch Merkblatt, Fragebogen und Mustervertrag.
        </p>
      </section>

      <section className="rounded-[1.15rem] bg-[#eef5f3] p-5 ring-1 ring-[#cdded9]">
        <h2 className="text-xl font-black text-[#25302d]">
          Budget vor der Suche festlegen
        </h2>
        <p className="mt-2">
          Unser kostenloser{" "}
          <a
            className="font-black text-[#25302d] underline"
            href="/de/au-pair-kosten-deutschland"
          >
            Au-pair-Kostenrechner für Deutschland
          </a>{" "}
          zeigt die monatlichen und gesamten Ausgaben für Ihre Planung.
        </p>
      </section>
    </GermanSeoPage>
  );
}
