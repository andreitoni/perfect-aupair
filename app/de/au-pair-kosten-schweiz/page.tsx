import { GermanSeoPage, SWITZERLAND_OFFICIAL_AU_PAIR_URL } from "@/app/de/_components/GermanSeoPage";
import { createGermanPublicPageMetadata } from "@/lib/seo/public-metadata";

const PATH = "/de/au-pair-kosten-schweiz";
const SWISS_WORK_INFO_URL = "https://www.ch.ch/de/auslander-in-der-schweiz/in-der-schweiz-arbeiten";

export const metadata = createGermanPublicPageMetadata({
  title: "Au-pair-Kosten Schweiz 2026 | Gastfamilien",
  description: "Au-pair-Kosten in der Schweiz: Barlohn, Naturallohn, Zimmer, Verpflegung, Sprachkurs, Versicherungen und kantonale Unterschiede richtig einplanen.",
  path: PATH,
  language: "de-CH",
  locale: "de_CH",
});

const faq = [
  { question: "Gibt es einen einzigen Schweizer Pauschalbetrag?", answer: "Nein. Barlohn, anrechenbarer Naturallohn und Abzüge hängen unter anderem von Alter, Vertrag und kantonalen Vorgaben ab. Lassen Sie den konkreten Betrag von der zuständigen kantonalen Stelle bestätigen." },
  { question: "Wer bezahlt den Sprachkurs?", answer: "Ein Sprachkurs gehört zum Au-pair-Aufenthalt. Für Drittstaatsangehörige nennen die SEM-Weisungen mindestens 120 Kursstunden; die konkrete Kostenregelung muss im Vertrag und nach kantonalen Vorgaben geklärt werden." },
  { question: "Welche Versicherungen sind relevant?", answer: "Zu prüfen sind insbesondere Kranken-, Unfall- und Sozialversicherungen. Bei Drittstaatsangehörigen trägt die Gastfamilie nach den SEM-Weisungen die Hälfte der Krankenversicherungsprämie." },
];

export default function AuPairCostsSwitzerlandPage() {
  return (
    <GermanSeoPage eyebrow="Kosten für Gastfamilien in der Schweiz" title="Au-pair-Kosten in der Schweiz 2026" description="In der Schweiz gibt es keinen verlässlichen nationalen Pauschalbetrag für jede Konstellation. Budgetieren Sie alle Leistungen und lassen Sie Lohn, Abzüge und Bewilligungskosten für Ihren Kanton bestätigen." path={PATH} faq={faq}>
      <section><h2 className="text-xl font-black text-[#25302d]">Diese Positionen gehören ins Budget</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[34rem] border-collapse text-left"><thead><tr className="border-b border-[#ccd8d4]"><th className="py-2 pr-4 font-black text-[#25302d]">Kostenpunkt</th><th className="py-2 font-black text-[#25302d]">Was zu klären ist</th></tr></thead><tbody>
        <tr className="border-b border-[#e1e8e5]"><td className="py-3 pr-4">Barlohn</td><td className="py-3">Alter, Vertrag und kantonale Vorgaben</td></tr>
        <tr className="border-b border-[#e1e8e5]"><td className="py-3 pr-4">Zimmer und Verpflegung</td><td className="py-3">Eigenes Zimmer und vollständige Verpflegung; Naturallohn korrekt ausweisen</td></tr>
        <tr className="border-b border-[#e1e8e5]"><td className="py-3 pr-4">Sprachkurs</td><td className="py-3">Kursumfang, Gebühren und Fahrtkosten</td></tr>
        <tr className="border-b border-[#e1e8e5]"><td className="py-3 pr-4">Versicherungen</td><td className="py-3">Kranken-, Unfall- und Sozialversicherung samt Aufteilung</td></tr>
        <tr><td className="py-3 pr-4">Bewilligung und Vermittlung</td><td className="py-3">Kantonale Gebühren; bei Drittstaaten anerkannte Vermittlungsorganisation</td></tr>
      </tbody></table></div></section>
      <section><h2 className="text-xl font-black text-[#25302d]">Warum wir keinen falschen Gesamtpreis nennen</h2><p className="mt-2">Ein pauschaler Betrag würde wichtige Unterschiede zwischen Kantonen, Staatsangehörigkeiten und Vertragsmodellen verdecken. Holen Sie vor der Zusage eine schriftliche Aufstellung ein und planen Sie zusätzlich Mobilität, Telefon und gemeinsame Familienaktivitäten.</p></section>
      <section><h2 className="text-xl font-black text-[#25302d]">Offiziell prüfen</h2><p className="mt-2">Nutzen Sie die Informationen des <a className="font-black text-[#25302d] underline" href={SWITZERLAND_OFFICIAL_AU_PAIR_URL} rel="noreferrer">Staatssekretariats für Migration</a> und die allgemeine <a className="font-black text-[#25302d] underline" href={SWISS_WORK_INFO_URL} rel="noreferrer">Übersicht von ch.ch zur Arbeit in der Schweiz</a>. Die kantonale Behörde bestätigt die konkrete Berechnung.</p></section>
    </GermanSeoPage>
  );
}
