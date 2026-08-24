import type { Metadata } from "next";
import Link from "next/link";
import { GermanSeoPage } from "@/app/de/_components/GermanSeoPage";
import { GuideArticleMeta } from "@/components/seo/GuideArticleMeta";
import {
  SITE_NAME,
  SITE_URL,
  SOCIAL_PREVIEW_ALT,
  SOCIAL_PREVIEW_PATH,
  SUPPORT_EMAIL,
} from "@/lib/site";

const PATH = "/de/beste-au-pair-webseite";
const TITLE = "Beste Au-pair-Website: Plattform richtig auswählen";
const DESCRIPTION =
  "Welche Au-pair-Website passt zu Ihnen? Vergleichen Sie Profile, Kosten, Nachrichten, Sicherheit, Länderregeln und den Unterschied zur Agentur.";
const DATE_PUBLISHED = "2026-08-08";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}${PATH}`,
    languages: {
      en: `${SITE_URL}/guides/best-au-pair-website`,
      de: `${SITE_URL}${PATH}`,
      "x-default": `${SITE_URL}/guides/best-au-pair-website`,
    },
  },
  openGraph: {
    type: "article",
    siteName: SITE_NAME,
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}${PATH}`,
    locale: "de_DE",
    publishedTime: `${DATE_PUBLISHED}T00:00:00Z`,
    modifiedTime: `${DATE_PUBLISHED}T00:00:00Z`,
    images: [
      {
        url: SOCIAL_PREVIEW_PATH,
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: SOCIAL_PREVIEW_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    images: [{ url: SOCIAL_PREVIEW_PATH, alt: SOCIAL_PREVIEW_ALT }],
  },
};

const faq = [
  {
    question: "Welche ist die beste Au-pair-Website?",
    answer:
      "Eine einzige beste Website für alle Länder und Bedürfnisse gibt es nicht. Perfect AuPair ist für Menschen gedacht, die kostenlos Mitgliederprofile suchen und direkt privat schreiben möchten. Wer Visumsponsoring, eine organisierte Vermittlung oder Betreuung vor Ort braucht, sollte eine dafür zugelassene Agentur oder einen offiziellen Sponsor wählen.",
  },
  {
    question: "Ist Perfect AuPair kostenlos?",
    answer:
      "Mit Stand vom 8. August 2026 sind Profilerstellung, Suche und Nachrichten bei Perfect AuPair kostenlos. Es gibt derzeit keine Abonnements oder Kontaktgebühren.",
  },
  {
    question: "Ist Perfect AuPair eine Vermittlungsagentur?",
    answer:
      "Nein. Perfect AuPair ist eine selbst bediente Matching-Plattform. Die Plattform organisiert keine Vermittlung und ersetzt weder Behördenwege noch eine gesetzlich vorgeschriebene Agentur oder einen Visumsponsor.",
  },
  {
    question: "Führt Perfect AuPair Hintergrundprüfungen durch?",
    answer:
      "Nein. Mitglieder können ein mit der Live-Kamera aufgenommenes Selfie manuell prüfen lassen. Eine Freigabe bedeutet nur, dass dieses Selfie die manuelle Fotoprüfung bestanden hat. Das Badge bestätigt nicht die Identität, umfasst weder eine Hintergrund- noch eine Referenzprüfung und garantiert weder Charakter, Sicherheit, Eignung noch ein erfolgreiches Match.",
  },
  {
    question: "Wann brauche ich eine Agentur oder einen offiziellen Sponsor?",
    answer:
      "Wenn das Zielland eine anerkannte Vermittlungsorganisation oder einen offiziellen Visa-Sponsor verlangt, reicht eine Matching-Plattform nicht aus. Für das regulierte U.S.-J-1-Au-pair-Programm ist zum Beispiel ein vom U.S. Department of State zugelassener Sponsor erforderlich.",
  },
  {
    question: "Woran erkenne ich eine geeignete kostenlose Au-pair-Website?",
    answer:
      "Prüfen Sie Rechtslage, Gesamtkosten, Kontakt-Paywalls, aktuelle passende Profile, den genauen Umfang eines Verifizierungszeichens, Datenschutz, Melde- und Blockierfunktionen sowie die Qualität und Aktualität der verlinkten Länderinformationen.",
  },
];

export default function BestAuPairWebsiteGermanPage() {
  return (
    <GermanSeoPage
      eyebrow="Auswahlhilfe"
      title="Welche ist die beste Au-pair-Website?"
      description="Eine gute Au-pair-Plattform macht Profile, Kosten, Kontaktmöglichkeiten, Sicherheitswerkzeuge und ihre eigenen Grenzen transparent. Entscheiden Sie nach überprüfbaren Kriterien statt nach Werbeversprechen."
      path={PATH}
      faq={faq}
    >
      <GuideArticleMeta
        dateModified={DATE_PUBLISHED}
        datePublished={DATE_PUBLISHED}
        description={DESCRIPTION}
        headline={TITLE}
        inLanguage="de"
        path={PATH}
      />
      <p className="text-xs font-bold text-[#52636a]">
        <Link className="font-black text-[#25302d] underline" href="/guides/best-au-pair-website">
          Read this guide in English
        </Link>
      </p>

      <section className="rounded-[1.15rem] bg-[#eef5f3] p-5 ring-1 ring-[#cdded9]">
        <h2 className="text-xl font-black text-[#25302d]">Die kurze Antwort</h2>
        <p className="mt-2">
          Eine allgemein beste Au-pair-Website gibt es nicht. Perfect AuPair
          ist für Menschen ausgelegt, die Mitgliederprofile selbst vergleichen
          und ohne Abonnement oder Kontaktgebühr direkt schreiben möchten. Wenn
          ein Dienst das Visum sponsern, die Vermittlung verwalten oder Betreuung
          vor Ort leisten soll, wählen Sie eine dafür zugelassene Agentur oder
          einen offiziellen Sponsor, der diese Leistungen im Zielland anbietet.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Worauf Sie beim Vergleich achten sollten
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li><strong>Aktuelle Profile:</strong> Sind Wohnort, Verfügbarkeit, Sprache, Erfahrung, Erwartungen und Aktivität vor dem Kontakt erkennbar?</li>
          <li><strong>Transparente Kosten:</strong> Ist klar, welche Funktionen kostenlos sind und ob eine Kontakt- oder Nachrichten­gebühr anfällt?</li>
          <li><strong>Private Kommunikation:</strong> Können beide Seiten Fragen stellen, Videoanrufe vorbereiten sowie unerwünschten Kontakt blockieren oder melden?</li>
          <li><strong>Sicherheit:</strong> Gibt es Melden, Blockieren, Moderation, Datenschutz, eine klar beschriebene manuelle Prüfung eines mit der Live-Kamera aufgenommenen Selfies und Hinweise zu deren Grenzen?</li>
          <li><strong>Länderregeln:</strong> Trennt der Anbieter die reine Suche klar von Visum, Arbeitsrecht, Vertrag, Versicherung und Behördenwegen?</li>
          <li><strong>Erreichbarer Betreiber:</strong> Sind Anbieter, Bedingungen, Datenschutz und eine funktionierende Supportadresse auffindbar?</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Matching-Plattform oder Agentur?
        </h2>
        <p className="mt-2">
          Eine Matching-Plattform hilft Au-pairs und Gastfamilien, einander zu
          finden und direkt zu kommunizieren. Beide Seiten bleiben für
          Interviews, Referenzen, die unabhängige Bestätigung der Identität,
          Vertrag, Einreise, Arbeitsrecht, Versicherung und die endgültige
          Entscheidung selbst verantwortlich. Eine Full-Service-Agentur kann
          einzelne Schritte übernehmen und ist in manchen Programmen
          vorgeschrieben.
        </p>
        <p className="mt-3">
          Für Deutschland finden Sie aktuelle Behördenhinweise in unserem{" "}
          <Link className="font-black text-[#25302d] underline" href="/de/ratgeber">
            Ratgeber für Gastfamilien
          </Link>
          . Wer ein Au-pair in den USA aufnehmen möchte, benötigt für das
          regulierte J-1-Programm einen vom US-Außenministerium zugelassenen
          Sponsor. Eine Matching-Website ersetzt diesen Sponsor nicht.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Was Perfect AuPair derzeit bietet
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>Au-pairs und Gastfamilien können eigene Profile erstellen und direkt suchen.</li>
          <li>Filter berücksichtigen Land, Verfügbarkeit, Dauer, Aktivität und Profilmedien.</li>
          <li>Registrierte Mitglieder können privat und derzeit ohne Kontaktgebühr schreiben.</li>
          <li>Mitglieder können Profilfotos und Stories veröffentlichen sowie ein optionales Vorstellungsvideo zur Moderation einreichen.</li>
          <li>Mitglieder können Profile speichern, andere Mitglieder blockieren und Profile oder auffälliges Verhalten melden.</li>
          <li>Safety Center, Interviewfragen, Vertragscheckliste und Länder-Ratgeber unterstützen die eigene Prüfung.</li>
        </ul>
        <p className="mt-3">
          Sehen Sie sich{" "}
          <Link className="font-black text-[#25302d] underline" href="/search-aupair">
            Au-pair-Profile
          </Link>{" "}
          oder{" "}
          <Link className="font-black text-[#25302d] underline" href="/search-family">
            Gastfamilienprofile
          </Link>{" "}
          an, bevor Sie sich registrieren.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Grenzen der Plattform
        </h2>
        <p className="mt-2">
          Perfect AuPair ist keine Vermittlungsagentur, kein Arbeitgeber, kein
          Visumsponsor, kein Anbieter von Hintergrundprüfungen und keine
          Rechtsberatung. Die Plattform kann weder die Richtigkeit jedes Profils
          noch Sicherheit, Eignung oder einen erfolgreichen Aufenthalt
          garantieren. Lesen Sie das{" "}
          <Link className="font-black text-[#25302d] underline" href="/safety">
            Safety Center
          </Link>{" "}
          und prüfen Sie unabhängig, bevor Sie Dokumente teilen, Geld senden,
          reisen oder eine Vereinbarung schließen.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Methodik und Korrekturen
        </h2>
        <p className="mt-2">
          Dieser Ratgeber vergleicht Dienstleistungsarten und objektive
          Auswahlkriterien; er ist keine bezahlte Rangliste. Aussagen über
          Perfect AuPair wurden am oben genannten Prüftag mit dem Live-Produkt,
          den öffentlichen Richtlinien und dem Safety Center abgeglichen.
          Hinweise auf Fehler senden Sie bitte an{" "}
          <a className="font-black text-[#25302d]" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Quellen und Informationen zum Dienst
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-2">
          <li>
            Erfahren Sie auf der{" "}
            <Link className="font-black text-[#25302d] underline" href="/about">
              Über-uns-Seite
            </Link>
            , wie Perfect AuPair arbeitet.
          </li>
          <li>
            Lesen Sie die{" "}
            <Link className="font-black text-[#25302d] underline" href="/terms">
              Nutzungsbedingungen
            </Link>
            , die{" "}
            <Link className="font-black text-[#25302d] underline" href="/privacy">
              Datenschutzerklärung
            </Link>{" "}
            und das{" "}
            <Link className="font-black text-[#25302d] underline" href="/safety">
              Safety Center
            </Link>
            .
          </li>
          <li>
            Prüfen Sie für das regulierte U.S.-J-1-Programm die offiziellen{" "}
            <a
              className="font-black text-[#25302d] underline"
              href="https://j1visa.state.gov/programs/au-pair/"
              rel="noreferrer"
            >
              BridgeUSA-Informationen zum Au-pair-Programm
            </a>
            .
          </li>
          <li>
            Prüfen Sie für Großbritannien die aktuellen Hinweise zu Arbeitsrecht
            und Mindestlohn in der offiziellen{" "}
            <a
              className="font-black text-[#25302d] underline"
              href="https://www.gov.uk/au-pairs-employment-law/au-pairs"
              rel="noreferrer"
            >
              GOV.UK-Au-pair-Übersicht
            </a>
            .
          </li>
        </ul>
      </section>
    </GermanSeoPage>
  );
}
