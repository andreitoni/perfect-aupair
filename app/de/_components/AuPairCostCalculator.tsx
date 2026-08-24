"use client";

import { useState } from "react";

const currencyFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

type CostInputProps = {
  help: string;
  id: string;
  label: string;
  max?: number;
  onChange: (value: number) => void;
  value: number;
};

function normalizeCost(rawValue: string, max: number) {
  const value = Number(rawValue);

  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), max);
}

function CostInput({
  help,
  id,
  label,
  max = 5000,
  onChange,
  value,
}: CostInputProps) {
  return (
    <div>
      <label className="block text-sm font-black text-[#25302d]" htmlFor={id}>
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          max={max}
          step="5"
          value={value}
          onChange={(event) => onChange(normalizeCost(event.target.value, max))}
          className="min-h-12 w-full rounded-xl border border-[#bccbc7] bg-white px-3 pr-10 text-base font-bold text-[#25302d] outline-none transition focus:border-[#55736b] focus:ring-2 focus:ring-[#b8d1ca]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-black text-[#66736f]"
        >
          €
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-[#66736f]">{help}</p>
    </div>
  );
}

export function AuPairCostCalculator() {
  const [months, setMonths] = useState(12);
  const [pocketMoney, setPocketMoney] = useState(280);
  const [languageCourse, setLanguageCourse] = useState(70);
  const [courseTravel, setCourseTravel] = useState(0);
  const [insurance, setInsurance] = useState(0);
  const [foodAndUtilities, setFoodAndUtilities] = useState(0);
  const [extras, setExtras] = useState(0);
  const [oneTimeCosts, setOneTimeCosts] = useState(0);

  const monthlyCosts =
    pocketMoney +
    languageCourse +
    courseTravel +
    insurance +
    foodAndUtilities +
    extras;
  const totalCosts = monthlyCosts * months + oneTimeCosts;
  const averageMonthlyCosts = totalCosts / months;

  return (
    <section
      aria-labelledby="kostenrechner-title"
      className="overflow-hidden rounded-[1.35rem] border border-[#cdded9] bg-[#f5faf8] shadow-[0_18px_50px_rgba(37,48,45,0.08)]"
    >
      <div className="border-b border-[#cdded9] bg-[#25302d] px-5 py-5 text-white sm:px-7">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#bed8d1]">
          Kostenloses Planungstool
        </p>
        <h2 id="kostenrechner-title" className="mt-1 text-2xl font-black">
          Au-pair-Kostenrechner Deutschland
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#e4eeeb]">
          Passen Sie die variablen Beträge an Ihre Familie und Ihren Wohnort an.
          Das Ergebnis ist eine Planungshilfe, kein verbindliches Angebot.
        </p>
      </div>

      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.78fr)]">
        <div>
          <div>
            <label
              className="block text-sm font-black text-[#25302d]"
              htmlFor="cost-duration"
            >
              Aufenthaltsdauer
            </label>
            <div className="relative mt-1.5 max-w-xs">
              <input
                id="cost-duration"
                data-testid="cost-duration"
                type="number"
                inputMode="numeric"
                min="1"
                max="24"
                step="1"
                value={months}
                onChange={(event) =>
                  setMonths(
                    Math.min(
                      Math.max(Math.round(Number(event.target.value) || 1), 1),
                      24,
                    ),
                  )
                }
                className="min-h-12 w-full rounded-xl border border-[#bccbc7] bg-white px-3 pr-20 text-base font-bold text-[#25302d] outline-none transition focus:border-[#55736b] focus:ring-2 focus:ring-[#b8d1ca]"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-black text-[#66736f]"
              >
                Monate
              </span>
            </div>
          </div>

          <h3 className="mt-6 text-base font-black text-[#25302d]">
            Monatliche Kosten
          </h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <CostInput
              id="cost-pocket-money"
              label="Taschengeld"
              help="Aktueller Richtwert der Bundesagentur für Arbeit: 280 € monatlich."
              value={pocketMoney}
              onChange={setPocketMoney}
            />
            <CostInput
              id="cost-language-course"
              label="Sprachkurszuschuss"
              help="Mindestens 70 € monatlich, soweit tatsächliche Kurskosten anfallen."
              value={languageCourse}
              onChange={setLanguageCourse}
            />
            <CostInput
              id="cost-course-travel"
              label="Fahrt zum Sprachkurs"
              help="Zum Beispiel Monatskarte oder einzelne Fahrten."
              value={courseTravel}
              onChange={setCourseTravel}
            />
            <CostInput
              id="cost-insurance"
              label="Versicherung"
              help="Tragen Sie den Beitrag Ihres Kranken- und Unfallversicherungstarifs ein."
              value={insurance}
              onChange={setInsurance}
            />
            <CostInput
              id="cost-food-utilities"
              label="Verpflegung und Nebenkosten"
              help="Geschätzte Mehrkosten für Lebensmittel, Strom, Wasser und Heizung."
              value={foodAndUtilities}
              onChange={setFoodAndUtilities}
            />
            <CostInput
              id="cost-extras"
              label="Weitere Leistungen"
              help="Zum Beispiel Telefon, Freizeit, ÖPNV oder freiwillige Zuschüsse."
              value={extras}
              onChange={setExtras}
            />
          </div>

          <div className="mt-5 max-w-md">
            <CostInput
              id="cost-one-time"
              label="Einmalige Kosten für den gesamten Aufenthalt"
              help="Zum Beispiel Anreisebeteiligung, Behördengänge oder Erstausstattung."
              max={20000}
              value={oneTimeCosts}
              onChange={setOneTimeCosts}
            />
          </div>
        </div>

        <aside
          aria-live="polite"
          className="self-start rounded-[1.15rem] bg-white p-5 ring-1 ring-[#cdded9] sm:p-6 lg:sticky lg:top-6"
        >
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#66736f]">
            Ihre Schätzung
          </p>
          <div className="mt-4 border-b border-[#e1e8e5] pb-4">
            <p className="text-sm text-[#66736f]">Pro Monat</p>
            <p
              data-testid="monthly-cost-total"
              className="mt-1 text-3xl font-black text-[#25302d]"
            >
              {currencyFormatter.format(monthlyCosts)}
            </p>
          </div>
          <div className="border-b border-[#e1e8e5] py-4">
            <p className="text-sm text-[#66736f]">
              Gesamt für {months} {months === 1 ? "Monat" : "Monate"}
            </p>
            <p
              data-testid="stay-cost-total"
              className="mt-1 text-3xl font-black text-[#16735f]"
            >
              {currencyFormatter.format(totalCosts)}
            </p>
          </div>
          <div className="pt-4">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-[#66736f]">Einmalige Kosten</span>
              <strong className="text-[#25302d]">
                {currencyFormatter.format(oneTimeCosts)}
              </strong>
            </div>
            <div className="mt-2 flex items-center justify-between gap-4 text-sm">
              <span className="text-[#66736f]">Monatsdurchschnitt inkl. einmalig</span>
              <strong className="text-[#25302d]">
                {currencyFormatter.format(averageMonthlyCosts)}
              </strong>
            </div>
          </div>

          {insurance === 0 ? (
            <p className="mt-5 rounded-xl bg-[#fff7e8] px-3 py-2.5 text-xs font-bold leading-5 text-[#755314]">
              Versicherungsschutz ist erforderlich. Ergänzen Sie Ihren Tarif,
              damit die Schätzung vollständig ist.
            </p>
          ) : null}

          <p className="mt-4 text-xs leading-5 text-[#66736f]">
            Nicht eingerechnet ist ein möglicher Mietwert des bereitgestellten
            Zimmers. Unterkunft und Verpflegung sind dem Au-pair kostenlos zur
            Verfügung zu stellen.
          </p>
        </aside>
      </div>
    </section>
  );
}
