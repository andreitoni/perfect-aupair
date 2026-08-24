import { AUSTRIA_OFFICIAL_AU_PAIR_URL, GermanSeoPage } from "@/app/de/_components/GermanSeoPage";
import { createGermanPublicPageMetadata } from "@/lib/seo/public-metadata";

const PATH = "/de/gastfamilie-werden-oesterreich";
const AUSTRIA_MODEL_CONTRACT_URL = "https://www.oesterreich.gv.at/dam/jcr%3A5f3dbef2-901a-4416-aa14-393e4e8b7344/Au-pair-Mustervertrag.pdf";

export const metadata = createGermanPublicPageMetadata({
  title: "Gastfamilie werden in Österreich | Au-pair aufnehmen",
  description: "Gastfamilie in Österreich werden: Voraussetzungen, Vertrag, AMS-Meldung, Sozialversicherung, Zimmer und fairen Familienalltag vorbereiten.",
  path: PATH,
  language: "de-AT",
  locale: "de_AT",
});

const faq = [
  { question: "Wie alt darf ein Au-pair in Österreich sein?", answer: "Die offizielle österreichische Übersicht beschreibt Au-pairs grundsätzlich als Personen zwischen 18 und 28 Jahren. Für Drittstaatsangehörige müssen die konkreten AMS- und Aufenthaltsvoraussetzungen zusätzlich erfüllt sein." },
  { question: "Muss die Gastfamilie das Au-pair anmelden?", answer: "Ja. Das Au-pair ist bei der gesetzlichen Sozialversicherung anzumelden. Bei Drittstaatsangehörigen ist außerdem die vorgesehene Au-pair-Beschäftigung beim AMS anzuzeigen und die passende Aufenthaltsberechtigung abzuwarten." },
  { question: "Gibt es einen offiziellen Mustervertrag?", answer: "Ja. Österreich.gv.at stellt einen Au-pair-Mustervertrag bereit. Vertrag und tatsächliche Ausgestaltung sollten zur aktuellen persönlichen Situation passen." },
];

export default function BecomeHostFamilyAustriaPage() {
  return (
    <GermanSeoPage eyebrow="Für Familien in Österreich" title="Gastfamilie werden und ein Au-pair aufnehmen" description="Ein Au-pair unterstützt begrenzt bei Kinderbetreuung und leichten Hausarbeiten und soll gleichzeitig Sprache und Kultur kennenlernen. Dafür braucht es ein eigenes Zimmer, klare Regeln und echte Einbindung in den Familienalltag." path={PATH} faq={faq}>
      <section><h2 className="text-xl font-black text-[#25302d]">Vor der Suche prüfen</h2><ul className="mt-3 list-inside list-disc space-y-2"><li>Passt kultureller Austausch wirklich zu Ihrer Familie?</li><li>Können Sie ein eigenes Zimmer und kostenlose Verpflegung bereitstellen?</li><li>Bleiben Aufgaben und Zeiten im zulässigen Rahmen?</li><li>Gibt es genügend Zeit für Sprachkurs, Freizeit und Kontakte?</li><li>Sind Entgelt, Sonderzahlungen und Versicherung vollständig eingeplant?</li></ul></section>
      <section><h2 className="text-xl font-black text-[#25302d]">Behörden- und Vertragscheckliste</h2><ol className="mt-3 list-inside list-decimal space-y-2"><li>Staatsangehörigkeit und Aufenthaltsstatus prüfen.</li><li>Bei Drittstaaten die Beschäftigung rechtzeitig dem zuständigen AMS anzeigen.</li><li>Passende Aufenthaltsberechtigung abwarten; vorher darf die Tätigkeit nicht beginnen.</li><li>Schriftlichen Vertrag mit Aufgaben, Zeit, Entgelt, Freizeit und Kündigung schließen.</li><li>Au-pair bei der gesetzlichen Sozialversicherung anmelden.</li></ol></section>
      <section><h2 className="text-xl font-black text-[#25302d]">Offizielle Unterlagen</h2><p className="mt-2">Nutzen Sie die aktuelle <a className="font-black text-[#25302d] underline" href={AUSTRIA_OFFICIAL_AU_PAIR_URL} rel="noreferrer">Behördenübersicht</a> und den <a className="font-black text-[#25302d] underline" href={AUSTRIA_MODEL_CONTRACT_URL} rel="noreferrer">offiziellen Mustervertrag</a> als Ausgangspunkt. Bei Unsicherheit helfen AMS und Aufenthaltsbehörde.</p></section>
    </GermanSeoPage>
  );
}
