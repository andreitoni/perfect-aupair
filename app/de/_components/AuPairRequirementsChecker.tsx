"use client";

import { useState } from "react";

type Answer = "yes" | "no" | null;

type CheckItem = {
  id: string;
  label: string;
  help: string;
};

const checks: CheckItem[] = [
  {
    id: "adult",
    label: "Das Au-pair ist bei Beginn mindestens 18 Jahre alt.",
    help: "Bei Drittstaatsangehörigen darf das 27. Lebensjahr bei Antragstellung noch nicht erreicht sein.",
  },
  {
    id: "language",
    label: "Grundkenntnisse der deutschen Sprache sind vorhanden.",
    help: "Für Au-pairs aus Drittstaaten wird mindestens Niveau A1 erwartet.",
  },
  {
    id: "child",
    label: "Mindestens ein minderjähriges Kind lebt dauerhaft im Haushalt.",
    help: "Die Unterstützung bei der Betreuung minderjähriger Kinder gehört zum Kern des Au-pair-Modells.",
  },
  {
    id: "room",
    label: "Ein eigenes Zimmer und kostenlose Verpflegung stehen zur Verfügung.",
    help: "Das Zimmer befindet sich grundsätzlich innerhalb der Familienwohnung oder des Familienhauses.",
  },
  {
    id: "duration",
    label: "Der geplante Aufenthalt dauert zwischen 6 und 12 Monaten.",
    help: "Das Au-pair-Verhältnis ist als zeitlich begrenzter kultureller Austausch vorgesehen.",
  },
  {
    id: "schedule",
    label: "Der Plan bleibt bei höchstens 30 Stunden pro Woche.",
    help: "Dazu gehören Kinderbetreuung und leichte Hausarbeiten; freie Tage, Abende und Urlaub müssen eingeplant werden.",
  },
];

export function AuPairRequirementsChecker() {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const answeredCount = checks.filter((check) => answers[check.id]).length;
  const openChecks = checks.filter((check) => answers[check.id] === "no");
  const isComplete = answeredCount === checks.length;

  return (
    <section
      aria-labelledby="voraussetzungen-check-title"
      className="overflow-hidden rounded-[1.35rem] border border-[#cdded9] bg-[#f5faf8] shadow-[0_18px_50px_rgba(37,48,45,0.08)]"
    >
      <div className="bg-[#25302d] px-5 py-5 text-white sm:px-7">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#bed8d1]">
          Kostenloser Schnellcheck
        </p>
        <h2 id="voraussetzungen-check-title" className="mt-1 text-2xl font-black">
          Passen die Grundvoraussetzungen?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#e4eeeb]">
          Beantworten Sie sechs grundlegende Fragen. Ihre Angaben bleiben in
          diesem Browser und werden nicht gespeichert oder übertragen.
        </p>
      </div>

      <div className="space-y-4 p-5 sm:p-7">
        {checks.map((check, index) => (
          <fieldset
            key={check.id}
            className="rounded-xl bg-white p-4 ring-1 ring-[#d8e4e0]"
          >
            <legend className="px-1 text-sm font-black text-[#25302d]">
              {index + 1}. {check.label}
            </legend>
            <p className="mt-1 text-xs leading-5 text-[#66736f]">{check.help}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { value: "yes" as const, label: "Ja" },
                { value: "no" as const, label: "Noch nicht / Nein" },
              ].map((option) => {
                const selected = answers[check.id] === option.value;

                return (
                  <label
                    key={option.value}
                    className={`cursor-pointer rounded-full px-4 py-2 text-sm font-black ring-1 transition focus-within:ring-2 focus-within:ring-[#6f929f] ${
                      selected
                        ? "bg-[#25302d] text-white ring-[#25302d]"
                        : "bg-white text-[#25302d] ring-[#bccbc7] hover:bg-[#eef5f3]"
                    }`}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name={`requirements-${check.id}`}
                      value={option.value}
                      checked={selected}
                      onChange={() =>
                        setAnswers((current) => ({
                          ...current,
                          [check.id]: option.value,
                        }))
                      }
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        <div
          aria-live="polite"
          data-testid="requirements-check-result"
          className={`rounded-xl p-4 ring-1 ${
            isComplete && openChecks.length === 0
              ? "bg-[#eaf7f1] text-[#145c4d] ring-[#afd8ca]"
              : openChecks.length > 0
                ? "bg-[#fff7e8] text-[#755314] ring-[#ead5a4]"
                : "bg-white text-[#52636a] ring-[#d8e4e0]"
          }`}
        >
          <p className="font-black">
            {!isComplete
              ? `${answeredCount} von ${checks.length} Punkten beantwortet`
              : openChecks.length === 0
                ? "Die grundlegenden Punkte passen zusammen."
                : `${openChecks.length} Punkt${openChecks.length === 1 ? "" : "e"} sollten Sie vor einer Zusage klären.`}
          </p>
          <p className="mt-1 text-xs font-semibold leading-5">
            Der Schnellcheck ist eine Orientierung und keine verbindliche
            Prüfung. Staatsangehörigkeit, Familiensprache und der Einzelfall
            können zusätzliche Anforderungen auslösen.
          </p>
        </div>
      </div>
    </section>
  );
}
