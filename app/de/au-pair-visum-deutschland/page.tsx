import {
  GERMAN_FEDERAL_AU_PAIR_URL,
  GERMAN_FOREIGN_OFFICE_VISA_URL,
  GermanSeoPage,
} from "@/app/de/_components/GermanSeoPage";
import { AuPairPreparationChecklist } from "@/app/de/_components/AuPairPreparationChecklist";
import { createGermanPublicPageMetadata } from "@/lib/seo/public-metadata";

const PATH = "/de/au-pair-visum-deutschland";

export const metadata = createGermanPublicPageMetadata({
  title: "Au-pair-Visum Deutschland 2026 | Voraussetzungen",
  description:
    "Au-pair-Visum für Deutschland: Wer ein Visum benötigt, welche Voraussetzungen gelten und welche Schritte Gastfamilie und Au-pair vorbereiten sollten.",
  path: PATH,
});

const faq = [
  {
    question: "Brauchen EU-Bürger ein Au-pair-Visum für Deutschland?",
    answer:
      "Staatsangehörige der EU, des EWR und der Schweiz sind freizügigkeitsberechtigt und benötigen für die Au-pair-Tätigkeit in Deutschland grundsätzlich kein Visum. Die allgemeine Meldepflicht bleibt bestehen.",
  },
  {
    question: "Welches Visum benötigen Au-pairs aus Drittstaaten?",
    answer:
      "Für einen längerfristigen Au-pair-Aufenthalt wird grundsätzlich ein nationaler Aufenthaltstitel benötigt, der die Au-pair-Tätigkeit ausdrücklich erlaubt. Der konkrete Antragsweg hängt von Staatsangehörigkeit und Wohnort ab.",
  },
  {
    question: "Kann ein Au-pair schon vor Erteilung des Aufenthaltstitels arbeiten?",
    answer:
      "Nein. Nach den Informationen der Bundesagentur für Arbeit darf die Au-pair-Tätigkeit erst aufgenommen werden, wenn der Aufenthaltstitel sie ausdrücklich erlaubt.",
  },
];

export default function AuPairVisaGermanyPage() {
  return (
    <GermanSeoPage
      eyebrow="Aufenthalt und Einreise"
      title="Au-pair-Visum für Deutschland 2026"
      description="Ob ein Visum erforderlich ist, hängt vor allem von der Staatsangehörigkeit ab. Gastfamilie und Au-pair sollten den offiziellen Antragsweg früh prüfen und erst mit einem Aufenthaltstitel starten, der die Au-pair-Tätigkeit erlaubt."
      path={PATH}
      faq={faq}
      editorialSources={[
        {
          name: "Bundesagentur für Arbeit: Au-pair",
          href: GERMAN_FEDERAL_AU_PAIR_URL,
        },
        {
          name: "Auswärtiges Amt: Visa für Deutschland",
          href: GERMAN_FOREIGN_OFFICE_VISA_URL,
        },
      ]}
    >
      <AuPairPreparationChecklist variant="visa" />

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          EU, EWR und Schweiz oder Drittstaat?
        </h2>
        <p className="mt-2">
          Staatsangehörige der EU, des EWR und der Schweiz können aufgrund der
          Freizügigkeit ohne Au-pair-Visum nach Deutschland kommen. Für
          Drittstaatsangehörige ist in der Regel ein nationaler Aufenthaltstitel
          erforderlich. Einige Staatsangehörigkeiten dürfen den erforderlichen
          Aufenthaltstitel nach der Einreise beantragen; deshalb muss immer die
          aktuelle Staatenliste des Auswärtigen Amts geprüft werden.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Voraussetzungen für Au-pairs aus Drittstaaten
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Bei Antragstellung ist das 27. Lebensjahr noch nicht erreicht.</li>
          <li>Grundkenntnisse der deutschen Sprache, mindestens Niveau A1.</li>
          <li>Ein konkreter, unterschriebener Au-pair-Vertrag.</li>
          <li>Eine geeignete Gastfamilie mit mindestens einem minderjährigen Kind im Haushalt.</li>
          <li>Ein Aufenthaltstitel, der die Au-pair-Beschäftigung ausdrücklich erlaubt.</li>
          <li>Erfüllung der weiteren Unterlagenanforderungen der zuständigen Auslandsvertretung.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Typischer Ablauf
        </h2>
        <ol className="mt-3 list-inside list-decimal space-y-2">
          <li>Gastfamilie und Au-pair lernen sich gründlich kennen und prüfen die Voraussetzungen.</li>
          <li>Beide Seiten füllen den Au-pair-Vertrag und die erforderlichen Formulare aus.</li>
          <li>Das Au-pair prüft die Vorgaben der zuständigen deutschen Auslandsvertretung.</li>
          <li>Der Antrag wird mit vollständigen Unterlagen eingereicht.</li>
          <li>Die Au-pair-Tätigkeit beginnt erst nach Erteilung der erforderlichen Erlaubnis.</li>
          <li>Nach der Einreise werden Meldepflicht und gegebenenfalls Aufenthaltstitel fristgerecht erledigt.</li>
        </ol>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Offizielle Informationen prüfen
        </h2>
        <p className="mt-2">
          Maßgeblich sind die aktuellen{" "}
          <a
            className="font-black text-[#25302d] underline"
            href={GERMAN_FOREIGN_OFFICE_VISA_URL}
            rel="noreferrer"
          >
            Visabestimmungen des Auswärtigen Amts
          </a>{" "}
          sowie die{" "}
          <a
            className="font-black text-[#25302d] underline"
            href={GERMAN_FEDERAL_AU_PAIR_URL}
            rel="noreferrer"
          >
            Au-pair-Informationen der Bundesagentur für Arbeit
          </a>
          . Botschaften und Ausländerbehörden entscheiden über den Einzelfall;
          Perfect AuPair erteilt keine Rechts- oder Visumberatung.
        </p>
      </section>
    </GermanSeoPage>
  );
}
