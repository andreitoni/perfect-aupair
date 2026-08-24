import Link from "next/link";
import { AUSTRIA_OFFICIAL_AU_PAIR_URL, GermanSeoPage } from "@/app/de/_components/GermanSeoPage";
import { createGermanPublicPageMetadata } from "@/lib/seo/public-metadata";

const PATH = "/de/au-pair-finden-oesterreich";

export const metadata = createGermanPublicPageMetadata({
  title: "Au-pair in Österreich kostenlos finden | Gastfamilien",
  description: "Au-pair für Österreich kostenlos finden: Profile vergleichen, direkt Kontakt aufnehmen und AMS-, Aufenthalts- sowie Vertragsfragen rechtzeitig klären.",
  path: PATH,
  language: "de-AT",
  locale: "de_AT",
});

const faq = [
  { question: "Ist die Suche für österreichische Familien kostenlos?", answer: "Ja. Profile, Registrierung und Nachrichten sind bei Perfect AuPair kostenlos. Behördenwege, Vertrag und persönliche Prüfungen übernehmen Familie und Au-pair selbst." },
  { question: "Braucht jedes Au-pair eine Beschäftigungsbewilligung?", answer: "Nein. EU-/EWR- und Schweizer Staatsangehörige benötigen grundsätzlich keine arbeitsmarktbehördliche Bewilligung. Für Drittstaatsangehörige gelten zusätzliche AMS- und Aufenthaltsvorgaben." },
  { question: "Wo prüfe ich die aktuellen Regeln?", answer: "Verbindliche Informationen geben das Unternehmensserviceportal, das AMS sowie die zuständige Aufenthaltsbehörde. Die Anforderungen hängen besonders von Staatsangehörigkeit und Aufenthaltsdauer ab." },
];

export default function FindAuPairAustriaPage() {
  return (
    <GermanSeoPage eyebrow="Für Gastfamilien in Österreich" title="Au-pair in Österreich kostenlos finden" description="Vergleichen Sie aktuelle Au-pair-Profile und klären Sie Verfügbarkeit, Kinderbetreuung, Deutschkenntnisse und Erwartungen direkt. Der Wohnortfilter meint dabei den aktuellen Aufenthaltsort – nicht das gewünschte Gastland." path={PATH} faq={faq}>
      <section>
        <h2 className="text-xl font-black text-[#25302d]">Die Suche richtig beginnen</h2>
        <ol className="mt-3 list-inside list-decimal space-y-2">
          <li>Öffnen Sie die <Link className="font-black text-[#25302d] underline" href="/search-aupair">aktuellen Au-pair-Profile</Link>, ohne fälschlich nur Personen auszuwählen, die bereits in Österreich wohnen.</li>
          <li>Klären Sie gewünschtes Gastland, Startdatum, Dauer, Erfahrung und Sprachkenntnisse im Gespräch.</li>
          <li>Führen Sie mehrere Videoanrufe und prüfen Sie Identität und Referenzen.</li>
          <li>Prüfen Sie vor einer Zusage, welche AMS- und Aufenthaltsregeln für die Staatsangehörigkeit gelten.</li>
          <li>Halten Sie Aufgaben, Arbeitszeit, Entgelt, Freizeit und Kündigung schriftlich fest.</li>
        </ol>
      </section>
      <section>
        <h2 className="text-xl font-black text-[#25302d]">EU/EWR/Schweiz oder Drittstaat?</h2>
        <p className="mt-2">EU-/EWR- und Schweizer Staatsangehörige benötigen grundsätzlich keine arbeitsmarktbehördliche Bewilligung. Bei einem Aufenthalt über drei Monate ist in der Regel eine Anmeldebescheinigung zu beantragen. Drittstaatsangehörige benötigen eine passende Aufenthaltsberechtigung und dürfen erst beginnen, wenn die erforderlichen Schritte abgeschlossen sind.</p>
      </section>
      <section>
        <h2 className="text-xl font-black text-[#25302d]">Offizielle Informationen</h2>
        <p className="mt-2">Prüfen Sie die aktuelle Übersicht im <a className="font-black text-[#25302d] underline" href={AUSTRIA_OFFICIAL_AU_PAIR_URL} rel="noreferrer">Unternehmensserviceportal Österreich</a> und die verlinkten Informationen des AMS, bevor Sie einen Vertrag schließen.</p>
      </section>
    </GermanSeoPage>
  );
}
