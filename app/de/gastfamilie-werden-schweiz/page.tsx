import { GermanSeoPage, SWITZERLAND_OFFICIAL_AU_PAIR_URL } from "@/app/de/_components/GermanSeoPage";
import { createGermanPublicPageMetadata } from "@/lib/seo/public-metadata";

const PATH = "/de/gastfamilie-werden-schweiz";

export const metadata = createGermanPublicPageMetadata({
  title: "Gastfamilie werden in der Schweiz | Au-pair aufnehmen",
  description: "Gastfamilie in der Schweiz werden: Arbeitszeit, Zimmer, Sprachkurs, Vertrag, Bewilligung und besondere Regeln für Drittstaaten vorbereiten.",
  path: PATH,
  language: "de-CH",
  locale: "de_CH",
});

const faq = [
  { question: "Wie viele Stunden darf ein Au-pair arbeiten?", answer: "Die offiziellen Vorgaben nennen grundsätzlich höchstens 30 Stunden pro Woche. Kinderbetreuung und leichte Hausarbeiten stehen im Mittelpunkt." },
  { question: "Braucht das Au-pair ein eigenes Zimmer?", answer: "Ja. Ein eigenes Zimmer und Verpflegung gehören zur Aufnahme in der Gastfamilie." },
  { question: "Welche Freizeit ist vorgesehen?", answer: "Die offiziellen Bedingungen sehen mindestens einen ganzen freien Tag pro Woche vor. Arbeitsplan, freie Zeit und Urlaub sollten im Vertrag eindeutig festgehalten werden." },
];

export default function BecomeHostFamilySwitzerlandPage() {
  return (
    <GermanSeoPage eyebrow="Für Familien in der Schweiz" title="Gastfamilie werden und ein Au-pair aufnehmen" description="Eine Schweizer Gastfamilie bietet kulturellen Austausch, ein eigenes Zimmer, Sprachförderung und einen fair geregelten Alltag. Bewilligung und Vertrag müssen vor Arbeitsbeginn zur konkreten Staatsangehörigkeit und zum Kanton passen." path={PATH} faq={faq}>
      <section><h2 className="text-xl font-black text-[#25302d]">Passt das Modell zu Ihrer Familie?</h2><ul className="mt-3 list-inside list-disc space-y-2"><li>Kinderbetreuung und leichte Hausarbeiten bleiben der Kern der Tätigkeit.</li><li>Ein Elternteil kann das Au-pair im Familienalltag anleiten; bei Drittstaaten muss mindestens die Hälfte der Arbeitszeit unter Aufsicht eines Elternteils erfolgen.</li><li>Ein eigenes Zimmer und vollständige Verpflegung sind vorhanden.</li><li>Der Plan lässt Sprachkurs, mindestens einen ganzen freien Tag pro Woche und echte Freizeit zu.</li><li>Alle Kosten einschließlich Versicherung und Behördenweg sind budgetiert.</li></ul></section>
      <section><h2 className="text-xl font-black text-[#25302d]">Schritt für Schritt</h2><ol className="mt-3 list-inside list-decimal space-y-2"><li>Staatsangehörigkeit des Au-pairs und zuständigen Kanton bestimmen.</li><li>Kantonale Zulassungsbedingungen vor der Zusage bestätigen lassen.</li><li>Bei Drittstaaten eine anerkannte Schweizer Vermittlungsorganisation einschalten.</li><li>Schriftlichen Vertrag mit Aufgaben, Lohn, Arbeitszeit, Freizeit, Kurs und Kündigung schließen.</li><li>Bewilligung abwarten und Anmeldung sowie Versicherungen rechtzeitig erledigen.</li></ol></section>
      <section><h2 className="text-xl font-black text-[#25302d]">Besonderheiten bei Drittstaaten</h2><p className="mt-2">Das SEM nennt ein Alter von 18 bis 25 Jahren, höchstens zwölf Monate Aufenthalt, eine andere Familiensprache als die Muttersprache des Au-pairs, mindestens 120 Stunden Sprachkurs und die Vermittlung durch eine anerkannte Organisation. Eine Plattform-Suche ersetzt diese Organisation nicht.</p><p className="mt-3">Prüfen Sie die <a className="font-black text-[#25302d] underline" href={SWITZERLAND_OFFICIAL_AU_PAIR_URL} rel="noreferrer">aktuellen SEM-Vorgaben</a> und die Hinweise Ihres Kantons.</p></section>
    </GermanSeoPage>
  );
}
