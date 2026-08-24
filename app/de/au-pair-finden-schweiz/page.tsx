import Link from "next/link";
import { GermanSeoPage, SWITZERLAND_OFFICIAL_AU_PAIR_URL } from "@/app/de/_components/GermanSeoPage";
import { createGermanPublicPageMetadata } from "@/lib/seo/public-metadata";

const PATH = "/de/au-pair-finden-schweiz";

export const metadata = createGermanPublicPageMetadata({
  title: "Au-pair in der Schweiz kostenlos finden | Gastfamilien",
  description: "Au-pair für die Schweiz kostenlos finden: Profile vergleichen und Regeln nach Staatsangehörigkeit und Kanton vor einer Zusage prüfen.",
  path: PATH,
  language: "de-CH",
  locale: "de_CH",
});

const faq = [
  { question: "Ist die Suche für Schweizer Gastfamilien kostenlos?", answer: "Ja. Familien können Profile ansehen, sich registrieren und Nachrichten senden, ohne eine Kontaktgebühr zu bezahlen." },
  { question: "Gelten für alle Au-pairs dieselben Regeln?", answer: "Nein. Die Vorgaben unterscheiden sich nach Staatsangehörigkeit und Kanton. Besonders für Personen außerhalb EU/EFTA gelten strengere Zulassungsbedingungen." },
  { question: "Braucht ein Au-pair aus einem Drittstaat eine Agentur?", answer: "Ja. Das Staatssekretariat für Migration verlangt für Drittstaatsangehörige eine Vermittlung durch eine in der Schweiz anerkannte Organisation." },
];

export default function FindAuPairSwitzerlandPage() {
  return (
    <GermanSeoPage eyebrow="Für Gastfamilien in der Schweiz" title="Au-pair in der Schweiz kostenlos finden" description="Suchen Sie nach Verfügbarkeit, Erfahrung, Sprache und persönlichen Erwartungen. Prüfen Sie anschließend Staatsangehörigkeit, Kanton und Bewilligungsweg, bevor beide Seiten verbindlich zusagen." path={PATH} faq={faq}>
      <section><h2 className="text-xl font-black text-[#25302d]">Vom Profil zum sicheren Match</h2><ol className="mt-3 list-inside list-decimal space-y-2"><li>Sehen Sie sich <Link className="font-black text-[#25302d] underline" href="/search-aupair">aktuelle Au-pair-Profile</Link> an; der Länderfilter beschreibt den aktuellen Wohnort und nicht automatisch das gewünschte Gastland.</li><li>Fragen Sie konkret nach Wunschland, Startdatum, Dauer und Erfahrung.</li><li>Führen Sie mehrere Videoanrufe und prüfen Sie Identität und Referenzen.</li><li>Klären Sie Staatsangehörigkeit und Wohnkanton vor einer Zusage.</li><li>Bestätigen Sie den zulässigen Weg direkt bei Kanton beziehungsweise SEM.</li></ol></section>
      <section><h2 className="text-xl font-black text-[#25302d]">Drittstaaten: besondere Bedingungen</h2><p className="mt-2">Für Au-pairs aus Staaten außerhalb EU/EFTA nennt das SEM unter anderem ein Alter von 18 bis 25 Jahren, höchstens zwölf Monate Aufenthalt und die Vermittlung durch eine anerkannte Schweizer Organisation. Auch Sprachregion, Kurs und Familiensituation spielen eine Rolle. Die Matching-Plattform ersetzt diese vorgeschriebene Vermittlung nicht.</p></section>
      <section><h2 className="text-xl font-black text-[#25302d]">EU/EFTA und kantonale Prüfung</h2><p className="mt-2">Für EU-/EFTA-Staatsangehörige gelten andere Zulassungsregeln. Da Bewilligung und praktische Anforderungen kantonal umgesetzt werden, sollte die Gastfamilie vor Vertragsabschluss die zuständige kantonale Behörde kontaktieren.</p><p className="mt-3">Starten Sie mit den <a className="font-black text-[#25302d] underline" href={SWITZERLAND_OFFICIAL_AU_PAIR_URL} rel="noreferrer">offiziellen Informationen des SEM</a>.</p></section>
    </GermanSeoPage>
  );
}
