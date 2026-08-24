"use client";

import { useState } from "react";

type ChecklistVariant = "contract" | "visa";

const checklistContent: Record<
  ChecklistVariant,
  { eyebrow: string; title: string; description: string; items: string[] }
> = {
  visa: {
    eyebrow: "Zum Abhaken und Ausdrucken",
    title: "Au-pair-Visum: Vorbereitungscheckliste",
    description:
      "Die genaue Unterlagenliste bestimmt die zuständige deutsche Auslandsvertretung. Nutzen Sie diese Liste für die gemeinsame Vorbereitung.",
    items: [
      "Staatsangehörigkeit und zuständigen Antragsweg geprüft",
      "Gültigen Reisepass und geforderte Passfotos vorbereitet",
      "Vollständig ausgefüllten und unterschriebenen Au-pair-Vertrag vorbereitet",
      "Au-pair-Fragebogen der Bundesagentur für Arbeit ausgefüllt",
      "Nachweis über Deutschkenntnisse gemäß Vorgabe der Auslandsvertretung vorbereitet",
      "Angaben und Unterlagen der Gastfamilie vollständig zusammengestellt",
      "Versicherungsschutz und geplanten Beginn schriftlich geklärt",
      "Aktuelle Unterlagenliste, Terminweg und Gebühren bei der Auslandsvertretung geprüft",
    ],
  },
  contract: {
    eyebrow: "Zum Abhaken und Ausdrucken",
    title: "Au-pair-Vertrag: Gesprächscheckliste",
    description:
      "Diese Punkte sollten vor der Unterschrift konkret besprochen und nachvollziehbar dokumentiert sein.",
    items: [
      "Beginn, Ende und Aufenthaltsdauer eingetragen",
      "Kinderbetreuung und leichte Hausarbeiten konkret beschrieben",
      "Wochenplan, Babysitting und Höchstarbeitszeit abgestimmt",
      "Freie Tage, freie Abende und Urlaub vereinbart",
      "Taschengeld, Zahlungstermin und Zahlungsweg festgelegt",
      "Eigenes Zimmer und kostenlose Verpflegung bestätigt",
      "Sprachkursbeitrag und Fahrtkosten geregelt",
      "Kranken- und Unfallversicherung vor Beginn geklärt",
      "Hausregeln, Mobilität, Reisen und Privatsphäre besprochen",
      "Kündigungsfrist und Vorgehen bei Konflikten festgehalten",
    ],
  },
};

export function AuPairPreparationChecklist({
  variant,
}: {
  variant: ChecklistVariant;
}) {
  const content = checklistContent[variant];
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;

  return (
    <section
      aria-labelledby={`${variant}-checklist-title`}
      className="pa-print-checklist rounded-[1.35rem] border border-[#cdded9] bg-[#f5faf8] p-5 shadow-[0_18px_50px_rgba(37,48,45,0.08)] sm:p-7"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#52736a]">
            {content.eyebrow}
          </p>
          <h2
            id={`${variant}-checklist-title`}
            className="mt-1 text-2xl font-black text-[#25302d]"
          >
            {content.title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#52636a]">
            {content.description}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="pa-print-hide shrink-0 rounded-full bg-[#25302d] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#35413e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f929f]"
        >
          Drucken / als PDF speichern
        </button>
      </div>

      <div className="mt-5 space-y-2">
        {content.items.map((item, index) => (
          <label
            key={item}
            className="flex cursor-pointer items-start gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-[#d8e4e0]"
          >
            <input
              type="checkbox"
              checked={checkedItems[index] ?? false}
              onChange={(event) =>
                setCheckedItems((current) => ({
                  ...current,
                  [index]: event.target.checked,
                }))
              }
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#16735f]"
            />
            <span className="text-sm font-bold leading-6 text-[#25302d]">
              {item}
            </span>
          </label>
        ))}
      </div>

      <p className="mt-4 text-xs font-black text-[#52636a]" aria-live="polite">
        {checkedCount} von {content.items.length} Punkten abgehakt
      </p>
      <p className="mt-1 text-xs leading-5 text-[#66736f]">
        Planungshilfe, keine Rechts- oder Visumberatung. Prüfen Sie die aktuelle
        Liste immer bei der zuständigen Behörde.
      </p>
    </section>
  );
}
