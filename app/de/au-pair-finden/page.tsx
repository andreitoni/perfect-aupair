import Link from "next/link";
import { GermanSeoPage } from "@/app/de/_components/GermanSeoPage";
import { GermanAuPairCatalogPreview } from "@/app/de/_components/GermanAuPairCatalogPreview";
import { createGermanPublicPageMetadata } from "@/lib/seo/public-metadata";

export const metadata = createGermanPublicPageMetadata({
  title: "Au-pair suchen und finden in Deutschland | Profile",
  description:
    "Sie suchen ein Au-pair in Deutschland? Aktuelle Profile nach Sprache, Erfahrung und Verfügbarkeit vergleichen und ohne Kontaktgebühr anschreiben.",
  path: "/de/au-pair-finden",
});

const faq = [
  {
    question: "Wie kann ich in Deutschland ein Au-pair suchen?",
    answer:
      "Legen Sie zuerst Starttermin, Aufenthaltsdauer, Sprache und die wichtigsten Aufgaben fest. Vergleichen Sie dann passende Profile, schreiben Sie mehrere Au-pairs persönlich an und lernen Sie geeignete Kandidatinnen und Kandidaten in Videoanrufen kennen.",
  },
  {
    question: "Ist die Suche bei Perfect AuPair kostenlos?",
    answer:
      "Ja. Familien können Profile ansehen, sich registrieren und Nachrichten senden, ohne dafür eine Kontakt- oder Nachrichten­gebühr zu bezahlen.",
  },
  {
    question: "Ist Perfect AuPair eine Vermittlungsagentur?",
    answer:
      "Nein. Perfect AuPair ist eine Matching-Plattform. Familien und Au-pairs prüfen selbst, ob sie zueinander passen, und bleiben für Vertrag, Behördenwege und persönliche Prüfungen verantwortlich.",
  },
  {
    question: "Worauf sollte eine Familie bei der Auswahl achten?",
    answer:
      "Wichtig sind unter anderem Erfahrung mit Kindern, Sprache, gewünschter Beginn, Aufenthaltsdauer, Alltag, Aufgaben, Führerschein, Ernährung und Erwartungen an das Zusammenleben.",
  },
];

export default function FindAuPairGermanyPage() {
  return (
    <GermanSeoPage
      eyebrow="Für Gastfamilien"
      title="Au-pair suchen und finden: aktuelle Profile für Gastfamilien"
      description="Sie suchen ein Au-pair in Deutschland? Entdecken Sie aktuelle Profile, vergleichen Sie Sprache, Erfahrung und Verfügbarkeit und nehmen Sie direkt Kontakt auf. Bei Perfect AuPair sind Registrierung und Nachrichten kostenlos."
      path="/de/au-pair-finden"
      faq={faq}
    >
      <GermanAuPairCatalogPreview />

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          So können Sie ein passendes Au-pair suchen und finden
        </h2>
        <ol className="mt-3 list-inside list-decimal space-y-2">
          <li>
            Sehen Sie sich aktuelle <Link className="font-black text-[#25302d] underline" href="/search-aupair">Au-pair-Profile</Link> an.
          </li>
          <li>Vergleichen Sie Sprache, Herkunft, Erfahrung und persönliche Kriterien.</li>
          <li>Erstellen Sie ein ehrliches Familienprofil mit Alltag und Erwartungen.</li>
          <li>Führen Sie mehrere Videoanrufe und beziehen Sie die Kinder altersgerecht ein.</li>
          <li>Prüfen Sie Referenzen, Identität und die geltenden Einreisebestimmungen selbstständig.</li>
          <li>Halten Sie Aufgaben, Zeiten, Leistungen und Kündigungsregeln schriftlich fest.</li>
        </ol>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Profile gezielt vergleichen
        </h2>
        <p className="mt-2">
          Eine Suche nach dem nächsten freien Starttermin allein reicht selten
          aus. Filtern Sie Au-pair-Profile nach Wunschland, Sprache,
          Aufenthaltsdauer, Erfahrung mit Kindern, Führerschein und weiteren
          Kriterien. Lesen Sie anschließend die persönliche Vorstellung und
          prüfen Sie, ob Alltag und Erwartungen Ihrer Familie dazu passen.
        </p>
        <p className="mt-3">
          Öffnen Sie den vollständigen{" "}
          <Link className="font-black text-[#25302d] underline" href="/search-aupair">
            Au-pair-Katalog
          </Link>{" "}
          und kontaktieren Sie interessante Kandidatinnen und Kandidaten direkt
          über die private Nachrichtenfunktion.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Mehr als ein Lebenslauf
        </h2>
        <p className="mt-2">
          Ein gutes Matching hängt nicht nur von Erfahrung oder Sprachkenntnissen
          ab. Sprechen Sie über Tagesablauf, Erziehungsstil, Privatsphäre,
          Ernährung, Religion, Mobilität, Freizeit und den Umgang mit Konflikten.
          Beide Seiten sollten ausreichend Zeit für eine informierte Entscheidung
          haben.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Sicher kennenlernen
        </h2>
        <p className="mt-2">
          Senden Sie vor einer verlässlichen Prüfung kein Geld und teilen Sie
          sensible Dokumente nur, wenn sie für einen konkreten Behördenvorgang
          erforderlich sind. Nutzen Sie zunächst die private Kommunikation auf
          der Plattform und lesen Sie unser <Link className="font-black text-[#25302d] underline" href="/safety">Safety Center</Link>.
        </p>
      </section>
    </GermanSeoPage>
  );
}
