import { GermanSeoPage } from "@/app/de/_components/GermanSeoPage";
import { createGermanPublicPageMetadata } from "@/lib/seo/public-metadata";
import Link from "next/link";

const PATH = "/de/ratgeber";

export const metadata = createGermanPublicPageMetadata({
  title: "Au-pair in Deutschland: Ratgeber für Gastfamilien",
  description:
    "Kostenlose Ratgeber für deutsche Gastfamilien: Au-pair finden, Voraussetzungen, Kosten, Vertrag und sicherer erster Kontakt.",
  path: PATH,
  type: "website",
});

const guides = [
  {
    href: "/de/beste-au-pair-webseite",
    title: "Die passende Au-pair-Webseite wählen",
    text: "Kosten, Profile, Kontakt, Sicherheit und den Unterschied zwischen Matching-Plattform und Agentur objektiv vergleichen.",
  },
  {
    href: "/de/au-pair-finden",
    title: "Au-pair kostenlos finden",
    text: "Profile vergleichen, Erwartungen klären und ohne Kontaktgebühr eine passende Person kennenlernen.",
  },
  {
    href: "/de/gastfamilie-werden",
    title: "Gastfamilie werden",
    text: "Was Familien vor der Suche über Zimmer, Alltag, Sprache, Vertrag und Verantwortung wissen sollten.",
  },
  {
    href: "/de/au-pair-kosten-deutschland",
    title: "Au-pair-Kosten in Deutschland",
    text: "Taschengeld, Sprachkurs, Fahrtkosten, Versicherung sowie Unterkunft und Verpflegung im Überblick.",
  },
  {
    href: "/de/au-pair-voraussetzungen-deutschland",
    title: "Voraussetzungen in Deutschland",
    text: "Alter, Sprache, Aufenthaltsstatus, Arbeitszeit und Anforderungen an die Gastfamilie verständlich erklärt.",
  },
  {
    href: "/de/au-pair-vertrag-deutschland",
    title: "Au-pair-Vertrag",
    text: "Offizielles Vertragsmuster, Aufgaben, Arbeitszeit, Urlaub und Kündigung vollständig vorbereiten.",
  },
  {
    href: "/de/au-pair-visum-deutschland",
    title: "Au-pair-Visum",
    text: "Einreise, Aufenthaltstitel und Voraussetzungen für Au-pairs aus Drittstaaten sicher prüfen.",
  },
  {
    href: "/de/au-pair-arbeitszeit-deutschland",
    title: "Arbeitszeit und Urlaub",
    text: "Stunden, freie Tage, freie Abende, Babysitting und Urlaub transparent planen.",
  },
  {
    href: "/de/au-pair-taschengeld-deutschland",
    title: "Taschengeld und Leistungen",
    text: "Taschengeld, Sprachkurs, Versicherung, Unterkunft und Verpflegung richtig einordnen.",
  },
];

const countryGuides = [
  {
    href: "/de/au-pair-finden-oesterreich",
    title: "Au-pair in Österreich",
    text: "Suche, Kosten und Behördenwege für österreichische Gastfamilien.",
  },
  {
    href: "/de/au-pair-finden-schweiz",
    title: "Au-pair in der Schweiz",
    text: "Suche, Kosten und kantonale Regeln für Schweizer Gastfamilien.",
  },
];

export default function GermanGuideHubPage() {
  return (
    <GermanSeoPage
      eyebrow="Deutschland-Ratgeber"
      title="Au-pair in Deutschland: Ratgeber für Gastfamilien"
      description="Ein Au-pair lebt als vorübergehendes Familienmitglied im Haushalt und unterstützt bei der Kinderbetreuung und leichten Hausarbeiten. Hier finden Familien klare Informationen für die Suche und Vorbereitung."
      path={PATH}
    >
      <section className="grid gap-4 sm:grid-cols-2">
        {guides.map((guide) => (
          <Link
            key={guide.href}
            href={guide.href}
            className="rounded-[1.15rem] bg-[var(--background)] p-5 ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-sm"
          >
            <h2 className="text-xl font-black text-[#25302d]">{guide.title}</h2>
            <p className="mt-2 text-sm leading-6">{guide.text}</p>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Warum eine gute Vorbereitung wichtig ist
        </h2>
        <p className="mt-2">
          Ein Au-pair ist weder eine Vollzeit-Nanny noch eine Haushaltshilfe.
          Das Modell verbindet kulturellen Austausch, Spracherwerb und eine
          begrenzte Unterstützung im Familienalltag. Klare Absprachen zu
          Aufgaben, Arbeitszeiten, Freizeit, Sprache und Zusammenleben schützen
          beide Seiten.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-black text-[#25302d]">
          Ratgeber für Österreich und die Schweiz
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {countryGuides.map((guide) => (
            <Link
              key={guide.href}
              href={guide.href}
              className="rounded-[1.15rem] bg-[var(--background)] p-5 ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-sm"
            >
              <h3 className="text-lg font-black text-[#25302d]">{guide.title}</h3>
              <p className="mt-2 text-sm leading-6">{guide.text}</p>
            </Link>
          ))}
        </div>
      </section>
    </GermanSeoPage>
  );
}
