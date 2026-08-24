"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useActionState,
} from "react";
import {
  allowanceCurrencyOptions,
  getCountryFlagEmoji,
  type PhoneCountryCodeOption,
} from "@/lib/profile-options";
import {
  hasSuspiciousPersonNameCasing,
  normalizePersonName,
} from "@/lib/profile-name";
import { DateOfBirthValidationFix } from "@/components/onboarding/DateOfBirthValidationFix";
import { useLocale, useTranslations } from "@/components/i18n/I18nProvider";
import { trackFunnelEvent } from "@/lib/analytics/client";
import {
  formatChildrenInfo,
  formatCountryName,
  formatLanguageName,
  formatReligion,
  formatSmoking,
} from "@/lib/i18n/formatters";
import { getLocaleTag } from "@/lib/i18n/config";
import {
  createStartMonthOptions,
  normalizeStartMonthRange,
} from "@/lib/month-options";


type OnboardingActionState = {
  error: string;
};

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type ChoiceOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

export type OnboardingProfile = {
  account_type: "family" | "au_pair";
  onboarding_completed: boolean;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  street_address: string | null;
  phone_country_code: string | null;
  phone_number: string | null;
  country: string | null;
  city: string | null;
  nationality: string | null;
  preferred_host_countries: string[] | null;
  religion: string | null;
  already_in_germany: boolean | null;
  has_drivers_license: boolean | null;
  has_childcare_experience: boolean | null;
  has_infant_experience: boolean | null;
  has_first_aid: boolean | null;
  will_care_for_elderly: boolean | null;
  will_care_for_pets: boolean | null;
  mother_tongue: string | null;
  fluent_languages: string[] | null;
  basic_languages: string[] | null;
  availability_start: string | null;
  availability_start_from: string | null;
  availability_start_to: string | null;
  duration: string | null;
  duration_min_months: number | null;
  duration_max_months: number | null;
  smoking_status: string | null;
  bio: string | null;
  children_info: string | null;
  au_pair_allowance_amount: number | null;
  au_pair_allowance_currency: string | null;
  accommodation_info: string | null;
  expectations: string | null;
};

type OnboardingFormProps = {
  profile: OnboardingProfile;
  action?: (state: OnboardingActionState, formData: FormData) => Promise<OnboardingActionState>;
  onClientSubmit?: (formData: FormData) => Promise<OnboardingActionState | void>;
  externalError?: string;
  submitLabel?: string;
  savingLabel?: string;
  finalStepContent?: ReactNode;
  countries: string[];
  nationalities: string[];
  languageOptions: string[];
  phoneCountryCodes: PhoneCountryCodeOption[];
  childrenOptions: string[];
  religionOptions: string[];
  smokingOptions: { label: string; value: string }[];
};

async function idleOnboardingAction(
  _state: OnboardingActionState,
  _formData: FormData,
) {
  void _state;
  void _formData;

  return { error: "" };
}

const baseFieldClass =
  "h-12 w-full rounded-xl border border-[var(--pa-onboarding-border)] bg-[var(--pa-onboarding-field-bg)] px-4 text-sm font-semibold outline-none transition placeholder:text-[#25302d]/32 hover:border-[var(--pa-onboarding-accent)] focus:border-[var(--pa-onboarding-accent)] focus:bg-white focus:ring-4 focus:ring-[var(--pa-onboarding-ring)]";

const popularHostCountries = [
  "Germany",
  "Austria",
  "Switzerland",
  "United States",
  "United Kingdom",
  "France",
];

const preferredHostCountryLimit = 6;

const personNamePattern = "[\\p{L}\\p{M}][\\p{L}\\p{M} .,'’\\p{Pd}]{0,49}";
const cityPattern = "[\\p{L}\\p{M}][\\p{L}\\p{M} .,'’\\p{Pd}]{0,99}";
const streetAddressPattern =
  "[\\p{L}\\p{M}\\p{N}][\\p{L}\\p{M}\\p{N} .,'’#\\/\\p{Pd}]{1,99}";
const streetAddressRegex =
  /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,'’/#\p{Pd}]{1,99}$/u;
const personNameChars = /^[\p{L}\p{M} .,'’\p{Pd}]$/u;
const cityChars = /^[\p{L}\p{M} .,'’\p{Pd}]$/u;
const streetAddressChars = /^[\p{L}\p{M}\p{N} .,'’/#\p{Pd}]$/u;
const digitsOnlyChars = /^[0-9]$/;

const days = Array.from({ length: 31 }, (_, index) => String(index + 1));
const months = Array.from({ length: 12 }, (_, index) => String(index + 1));
const currentYear = new Date().getFullYear();
const AU_PAIR_MIN_BIRTH_YEAR = 1985;
const FAMILY_MIN_BIRTH_YEAR = 1936;

function birthMonthOptions(localeTag: string) {
  const formatter = new Intl.DateTimeFormat(localeTag, {
    month: "long",
    timeZone: "UTC",
  });

  return months.map((month) => ({
    value: month,
    label: formatter.format(new Date(Date.UTC(2026, Number(month) - 1, 1))),
  }));
}

function splitBirthDate(date?: string | null) {
  if (!date) return { year: "", month: "", day: "" };

  const [year, month, day] = date.split("-");

  return {
    year: year ?? "",
    month: month ? String(Number(month)) : "",
    day: day ? String(Number(day)) : "",
  };
}

function isValidBirthDate(dayValue: string, monthValue: string, yearValue: string) {
  const day = Number(dayValue);
  const month = Number(monthValue);
  const year = Number(yearValue);

  if (!day || !month || !year) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function booleanChoiceValue(value?: boolean | null) {
  if (value === true) return "yes";
  if (value === false) return "no";

  return null;
}

function prioritizeOptions(options: string[], priorityOptions: string[]) {
  const optionSet = new Set(options);
  const priority = priorityOptions.filter((option) => optionSet.has(option));
  const prioritySet = new Set(priority);

  return [...priority, ...options.filter((option) => !prioritySet.has(option))];
}

function RequiredMark({ required }: { required?: boolean }) {
  if (!required) return null;
  return <span className="text-[#d95f49]"> *</span>;
}

function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-[1.5rem] border border-transparent bg-transparent p-0 transition duration-200 sm:border-[var(--pa-onboarding-border)] sm:bg-[linear-gradient(180deg,#fff_0%,var(--pa-onboarding-section-bg)_100%)] sm:p-5 sm:shadow-[0_12px_32px_rgba(37,48,45,0.04)] sm:hover:border-[var(--pa-onboarding-accent)]"
    >
      <h2 className="mb-5 flex items-center gap-3 text-lg font-bold tracking-[-0.02em]">
        <span
          aria-hidden="true"
          className="h-3 w-3 rounded-full bg-[var(--pa-onboarding-accent)] shadow-[0_0_0_5px_var(--pa-onboarding-ring)]"
        />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  name,
  placeholder,
  defaultValue,
  required = false,
  pattern,
  title,
  inputMode,
  allowedChars,
  maxLength,
  normalizeOnBlur = false,
  capitalizationError,
}: {
  label: string;
  name: string;
  placeholder: string;
  defaultValue?: string | null;
  required?: boolean;
  pattern?: string;
  title?: string;
  inputMode?: "text" | "numeric" | "tel" | "email" | "url" | "search" | "decimal";
  allowedChars?: RegExp;
  maxLength?: number;
  normalizeOnBlur?: boolean;
  capitalizationError?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-2 block text-sm font-bold">
        {label}
        <RequiredMark required={required} />
      </label>
      <input
        id={name}
        name={name}
        data-error-label={label}
        required={required}
        pattern={pattern}
        title={title}
        inputMode={inputMode}
        maxLength={maxLength}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        onInput={(event) => {
          event.currentTarget.setCustomValidity("");
        }}
        onBeforeInput={(event) => {
          if (!allowedChars) return;

          const inputEvent = event.nativeEvent as InputEvent;
          const data = inputEvent.data;

          if (data && [...data].some((character) => !allowedChars.test(character))) {
            event.currentTarget.setCustomValidity("");
            event.preventDefault();
          }
        }}
        onPaste={(event) => {
          event.currentTarget.setCustomValidity("");

          if (!allowedChars) return;

          const pastedText = event.clipboardData.getData("text");

          if ([...pastedText].some((character) => !allowedChars.test(character))) {
            event.preventDefault();
          }
        }}
        onBlur={(event) => {
          event.currentTarget.setCustomValidity("");

          if (!normalizeOnBlur) return;

          event.currentTarget.value = normalizePersonName(
            event.currentTarget.value,
          );

          if (
            capitalizationError &&
            hasSuspiciousPersonNameCasing(event.currentTarget.value)
          ) {
            event.currentTarget.setCustomValidity(capitalizationError);
          }
        }}
        className={baseFieldClass}
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
  defaultValue,
  required = false,
  emptyLabel,
  formatOption = (option) => option,
  onChange,
  suggestedOption,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string | null;
  required?: boolean;
  emptyLabel: string;
  formatOption?: (option: string) => string;
  onChange?: (value: string) => void;
  suggestedOption?: string | null;
}) {
  const normalizedSuggestedOption =
    suggestedOption && options.includes(suggestedOption)
      ? suggestedOption
      : null;

  return (
    <div>
      <label htmlFor={name} className="mb-2 block text-sm font-bold">
        {label}
        <RequiredMark required={required} />
      </label>
      <select
        id={name}
        name={name}
        data-error-label={label}
        required={required}
        defaultValue={defaultValue ?? ""}
        onChange={(event) => {
          onChange?.(event.currentTarget.value);
        }}
        className={`${baseFieldClass} appearance-none`}
      >
        {normalizedSuggestedOption ? (
          <>
            <option value={normalizedSuggestedOption}>
              {formatOption(normalizedSuggestedOption)}
            </option>
            <option value={`${name}-suggested-separator`} disabled>
              ----------
            </option>
          </>
        ) : null}
        <option value="" disabled hidden={Boolean(normalizedSuggestedOption)}>
          {emptyLabel}
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {formatOption(option)}
          </option>
        ))}
      </select>
    </div>
  );
}

function PhoneCodeSelect({
  options,
  defaultValue,
  required = false,
  label,
  emptyLabel,
}: {
  options: PhoneCountryCodeOption[];
  defaultValue?: string | null;
  required?: boolean;
  label: string;
  emptyLabel: string;
}) {
  return (
    <div>
      <label
        htmlFor="phone_country_code"
        className="mb-2 block text-sm font-bold"
      >
        {label}
        <RequiredMark required={required} />
      </label>
      <select
        id="phone_country_code"
        name="phone_country_code"
        data-error-label={label}
        required={required}
        defaultValue={defaultValue ?? ""}
        className={`${baseFieldClass} appearance-none`}
      >
        <option value="" disabled>
          {emptyLabel}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function BirthDateFields({
  date,
  labels,
  accountType,
}: {
  date?: string | null;
  labels: { title: string; day: string; month: string; year: string };
  accountType: "family" | "au_pair";
}) {
  const locale = useLocale();
  const birthDate = splitBirthDate(date);
  const monthOptions = birthMonthOptions(getLocaleTag(locale));
  const minBirthYear =
    accountType === "au_pair" ? AU_PAIR_MIN_BIRTH_YEAR : FAMILY_MIN_BIRTH_YEAR;
  const years = Array.from(
    { length: Math.max(0, currentYear - 18 - minBirthYear + 1) },
    (_, index) => String(currentYear - 18 - index),
  );

  return (
    <div>
      <p className="mb-2 text-sm font-bold">
        {labels.title}
        <RequiredMark required />
      </p>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <select
          id="birth_day"
          name="birth_day"
          data-error-label={labels.title}
          data-error-group="birth_date"
          required
          defaultValue={birthDate.day}
          className={`${baseFieldClass} appearance-none`}
        >
          <option value="" disabled>
            {labels.day}
          </option>
          {days.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>

        <select
          id="birth_month"
          name="birth_month"
          data-error-label={labels.title}
          data-error-group="birth_date"
          required
          defaultValue={birthDate.month}
          className={`${baseFieldClass} appearance-none`}
        >
          <option value="" disabled>
            {labels.month}
          </option>
          {monthOptions.map((month) => (
            <option key={month.value} value={month.value}>
              {month.label}
            </option>
          ))}
        </select>

        <select
          id="birth_year"
          name="birth_year"
          data-error-label={labels.title}
          data-error-group="birth_date"
          required
          defaultValue={birthDate.year}
          className={`${baseFieldClass} appearance-none`}
        >
          <option value="" disabled>
            {labels.year}
          </option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function RadioGroup({
  label,
  name,
  options,
  defaultValue,
  required = false,
}: {
  label: string;
  name: string;
  options: { label: string; value: string }[];
  defaultValue?: string | null;
  required?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold">
        {label}
        <RequiredMark required={required} />
      </p>

      <div className="radio-group flex flex-wrap gap-2 rounded-2xl border border-transparent p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--pa-onboarding-border)] bg-[var(--pa-onboarding-field-bg)] px-4 text-sm font-bold text-[#25302d]/70 transition hover:border-[var(--pa-onboarding-accent)] has-[:checked]:border-[var(--pa-onboarding-accent)] has-[:checked]:bg-[var(--pa-onboarding-accent-soft)] has-[:checked]:text-[#25302d]"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              data-error-label={label}
              defaultChecked={defaultValue === option.value}
              required={required}
              className="h-4 w-4 accent-[var(--pa-onboarding-accent)]"
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function LanguageSelectRow({
  label,
  name,
  options,
  defaultValue,
  required = false,
  emptyLabel,
  formatOption,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string | null;
  required?: boolean;
  emptyLabel: string;
  formatOption?: (option: string) => string;
}) {
  return (
    <SelectField
      label={label}
      name={name}
      options={options}
      defaultValue={defaultValue}
      required={required}
      emptyLabel={emptyLabel}
      formatOption={formatOption}
    />
  );
}

function CountryCheckboxGroup({
  label,
  name,
  options,
  defaultValues,
  required = false,
  help,
  maxSelections,
  maxSelectionError,
  formatOption,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValues?: string[] | null;
  required?: boolean;
  help?: string;
  maxSelections?: number;
  maxSelectionError?: string;
  formatOption?: (option: string) => string;
}) {
  const [selectedValues, setSelectedValues] = useState(
    () => new Set(defaultValues ?? []),
  );
  const [selectionError, setSelectionError] = useState("");
  const helpId = `${name}_help`;
  const errorId = `${name}_error`;
  const describedBy = [
    help ? helpId : null,
    selectionError ? errorId : null,
  ].filter(Boolean).join(" ") || undefined;

  return (
    <div className="sm:col-span-2">
      <p className="mb-2 text-sm font-bold">
        {label}
        <RequiredMark required={required} />
      </p>
      {help ? (
        <p id={helpId} className="mb-3 text-xs font-semibold text-[#25302d]/50">{help}</p>
      ) : null}

      <div
        id={`${name}_group`}
        className={`pa-checkbox-group grid max-h-64 gap-2 overflow-y-auto rounded-2xl border bg-[var(--pa-onboarding-field-bg)] p-3 sm:grid-cols-2 ${
          selectionError ? "border-[#d95f49]/50" : "border-[var(--pa-onboarding-border)]"
        }`}
      >
        {options.map((option) => {
          const flag = getCountryFlagEmoji(option);

          return (
            <label
              key={option}
              className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--pa-onboarding-border)] bg-white px-3 py-2 text-sm font-bold text-[#25302d]/70 transition hover:border-[var(--pa-onboarding-accent)] has-[:checked]:border-[var(--pa-onboarding-accent)] has-[:checked]:bg-[var(--pa-onboarding-accent-soft)] has-[:checked]:text-[#25302d]"
            >
              <span className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  name={name}
                  value={option}
                  data-error-label={label}
                  data-error-group={name}
                  checked={selectedValues.has(option)}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(selectionError)}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;

                    setSelectedValues((currentValues) => {
                      const isSelected = currentValues.has(option);

                      if (
                        checked &&
                        !isSelected &&
                        maxSelections &&
                        currentValues.size >= maxSelections
                      ) {
                        setSelectionError(
                          maxSelectionError ??
                            `Choose up to ${maxSelections} options.`,
                        );
                        return currentValues;
                      }

                      const nextValues = new Set(currentValues);

                      if (checked) {
                        nextValues.add(option);
                      } else {
                        nextValues.delete(option);
                      }

                      setSelectionError("");
                      return nextValues;
                    });
                  }}
                  className="h-4 w-4 shrink-0 accent-[var(--pa-primary)]"
                />
                <span className="min-w-0 truncate">
                  {formatOption ? formatOption(option) : option}
                </span>
              </span>
              <span
                aria-hidden="true"
                suppressHydrationWarning
                className="min-w-6 shrink-0 text-right text-lg leading-none"
              >
                {flag ?? ""}
              </span>
            </label>
          );
        })}
      </div>
      {selectionError ? (
        <p id={errorId} className="mt-2 text-xs font-bold text-[#d95f49]">
          {selectionError}
        </p>
      ) : null}
    </div>
  );
}

function TextArea({
  label,
  name,
  placeholder,
  defaultValue,
  anchorId,
  required = false,
  maxLength,
  maxLengthLabel,
  rows = 12,
}: {
  label: string;
  name: string;
  placeholder: string;
  defaultValue?: string | null;
  anchorId?: string;
  required?: boolean;
  maxLength?: number;
  maxLengthLabel?: string;
  rows?: number;
}) {
  const focusScrollTopRef = useRef<number | null>(null);

  function storeFocusScrollPosition() {
    focusScrollTopRef.current = window.scrollY;
  }

  function restoreFocusScrollPosition() {
    const scrollTop = focusScrollTopRef.current;

    if (scrollTop === null) {
      return;
    }

    focusScrollTopRef.current = null;
    [0, 80, 180].forEach((delay) => {
      window.setTimeout(() => {
        window.scrollTo({ top: scrollTop, behavior: "auto" });
      }, delay);
    });
  }

  return (
    <div id={anchorId} className={anchorId ? "scroll-mt-24" : undefined}>
      <label htmlFor={name} className="mb-2 block text-sm font-bold">
        {label}
        <RequiredMark required={required} />
      </label>
      <textarea
        id={name}
        name={name}
        data-error-label={label}
        required={required}
        rows={rows}
        maxLength={maxLength}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        onTouchStart={storeFocusScrollPosition}
        onPointerDown={(event) => {
          if (event.pointerType === "touch") {
            storeFocusScrollPosition();
          }
        }}
        onFocus={restoreFocusScrollPosition}
        className="min-h-[220px] w-full resize-none rounded-xl border border-[var(--pa-onboarding-border)] bg-[var(--pa-onboarding-field-bg)] px-3 py-3 text-sm font-semibold leading-6 outline-none transition placeholder:text-[#25302d]/32 hover:border-[var(--pa-onboarding-accent)] focus:border-[var(--pa-onboarding-accent)] focus:bg-white focus:ring-4 focus:ring-[var(--pa-onboarding-ring)] sm:min-h-[320px] sm:px-4"
      />
      {maxLength ? (
        <p className="mt-2 text-xs font-semibold text-[#25302d]/45">
          {maxLengthLabel}
        </p>
      ) : null}
    </div>
  );
}

function OnboardingSavingOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[1.5rem] bg-white/82 p-6 backdrop-blur-sm sm:rounded-[2rem]">
      <div className="w-full max-w-xs rounded-[1.25rem] bg-white p-5 text-center shadow-[0_20px_60px_rgba(38,63,69,0.18)] ring-1 ring-[#d6e2e8]">
        <span
          aria-hidden="true"
          className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-[#25302d]/15 border-t-[var(--pa-onboarding-accent)]"
        />
        <p className="mt-4 text-sm font-black text-[#172426]">{label}</p>
      </div>
    </div>
  );
}


const rangeSelectClass =
  "h-12 w-full rounded-2xl border border-[var(--pa-onboarding-border)] bg-[var(--pa-onboarding-field-bg)] px-4 text-sm font-bold text-[#25302d] outline-none transition hover:border-[var(--pa-onboarding-accent)] focus:border-[var(--pa-onboarding-accent)] focus:bg-white focus:ring-4 focus:ring-[var(--pa-onboarding-ring)]";

function OptionMenuField({
  label,
  name,
  onChange,
  options,
  placeholder,
  required = false,
  value,
}: {
  label: string;
  name: string;
  onChange: (value: string) => void;
  options: ChoiceOption[];
  placeholder: string;
  required?: boolean;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value);
  const labelId = `${name}_label`;
  const buttonId = `${name}_button`;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node | null)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function handleSelect(nextValue: string) {
    onChange(nextValue);
    setIsOpen(false);
    rootRef.current
      ?.closest("form")
      ?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  return (
    <div ref={rootRef} className="relative">
      <label id={labelId} className="mb-2 block text-sm font-bold text-[#25302d]">
        {label} <RequiredMark required={required} />
      </label>
      <input
        type="hidden"
        name={name}
        value={value}
        readOnly
        data-error-label={label}
        data-pa-choice-required={required ? "true" : undefined}
      />
      <button
        id={buttonId}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby={`${labelId} ${buttonId}`}
        data-pa-choice-button={name}
        onClick={() => {
          setIsOpen((current) => !current);
        }}
        className={`${rangeSelectClass} flex items-center justify-between gap-3 text-left`}
      >
        <span className={selectedOption ? "" : "text-[#25302d]/45"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rotate-45 border-b-2 border-r-2 border-[#25302d]/70 transition ${
            isOpen ? "rotate-[225deg]" : ""
          }`}
        />
      </button>

      {isOpen ? (
        <div
          role="listbox"
          aria-labelledby={labelId}
          className="absolute z-40 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-[var(--pa-onboarding-border)] bg-white p-1 shadow-xl shadow-[#25302d]/10"
        >
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                disabled={option.disabled}
                onClick={() => {
                  handleSelect(option.value);
                }}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm font-bold transition disabled:cursor-not-allowed disabled:text-[#25302d]/28 ${
                  option.disabled
                    ? "bg-white"
                    : "hover:bg-[var(--pa-onboarding-surface)]"
                } ${
                  isSelected && !option.disabled
                    ? "bg-[var(--pa-onboarding-surface)] text-[#25302d]"
                    : "text-[#25302d]/78"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function StartWindowFields({
  from,
  to,
  labels,
}: {
  from?: string | null;
  to?: string | null;
  labels: { earliest: string; latest: string; selectMonth: string };
}) {
  const locale = useLocale();
  const initialStartWindow = normalizeStartMonthRange({ from, to });
  const months = createStartMonthOptions(getLocaleTag(locale));
  const [startFrom, setStartFrom] = useState(initialStartWindow.startFrom);
  const [startTo, setStartTo] = useState(initialStartWindow.startTo);
  const startFromOptions = months.map((month) => ({
    ...month,
    disabled: startTo ? month.value >= startTo : false,
  }));
  const startToOptions = months.map((month) => ({
    ...month,
    disabled: startFrom ? month.value <= startFrom : false,
  }));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <OptionMenuField
        name="availability_start_from"
        label={labels.earliest}
        required
        value={startFrom}
        placeholder={labels.selectMonth}
        options={startFromOptions}
        onChange={(nextStartFrom) => {
          setStartFrom(nextStartFrom);
        }}
      />

      <OptionMenuField
        name="availability_start_to"
        label={labels.latest}
        required
        value={startTo}
        placeholder={labels.selectMonth}
        options={startToOptions}
        onChange={(nextStartTo) => {
          setStartTo(nextStartTo);
        }}
      />
    </div>
  );
}

function DurationWindowFields({
  min,
  max,
  labels,
}: {
  min?: number | null;
  max?: number | null;
  labels: {
    min: string;
    max: string;
    selectMinimum: string;
    selectMaximum: string;
    month: (value: number) => string;
  };
}) {
  const months = Array.from({ length: 24 }, (_, index) => index + 1);
  const durationOptions = months.map((month) => ({
    label: labels.month(month),
    value: String(month),
  }));
  const [durationMin, setDurationMin] = useState(String(min ?? ""));
  const [durationMax, setDurationMax] = useState(String(max ?? ""));
  const durationMinOptions = durationOptions.map((option) => ({
    ...option,
    disabled: durationMax ? Number(option.value) > Number(durationMax) : false,
  }));
  const durationMaxOptions = durationOptions.map((option) => ({
    ...option,
    disabled: durationMin ? Number(option.value) < Number(durationMin) : false,
  }));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <OptionMenuField
        name="duration_min_months"
        label={labels.min}
        required
        value={durationMin}
        placeholder={labels.selectMinimum}
        options={durationMinOptions}
        onChange={(nextDurationMin) => {
          setDurationMin(nextDurationMin);
        }}
      />

      <OptionMenuField
        name="duration_max_months"
        label={labels.max}
        required
        value={durationMax}
        placeholder={labels.selectMaximum}
        options={durationMaxOptions}
        onChange={(nextDurationMax) => {
          setDurationMax(nextDurationMax);
        }}
      />
    </div>
  );
}

function AllowanceFields({
  amount,
  amountPlaceholder,
  currency,
  labels,
}: {
  amount?: number | null;
  amountPlaceholder: string;
  currency?: string | null;
  labels: {
    title: string;
    help: string;
    amount: string;
    currency: string;
  };
}) {
  return (
    <div className="sm:col-span-2">
      <p className="text-sm font-bold text-[#25302d]">
        {labels.title} <span className="text-[#d95f49]">*</span>
      </p>
      <p className="mt-1 text-xs font-semibold text-[#25302d]/50">
        {labels.help}
      </p>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_116px] gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
        <label className="block text-xs font-bold text-[#25302d]/55">
          {labels.amount}
          <input
            name="au_pair_allowance_amount"
            type="text"
            data-error-label={labels.amount}
            required
            inputMode="numeric"
            pattern="[0-9]{1,5}"
            maxLength={5}
            defaultValue={amount ?? ""}
            placeholder={amountPlaceholder}
            className={rangeSelectClass}
          />
        </label>

        <label className="block text-xs font-bold text-[#25302d]/55">
          {labels.currency}
          <select
            name="au_pair_allowance_currency"
            data-error-label={labels.currency}
            required
            defaultValue={currency || "EUR"}
            className={`${rangeSelectClass} appearance-none`}
          >
            {allowanceCurrencyOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function getBrowserHashTargetId() {
  const hash = window.location.hash.slice(1);

  if (!hash) {
    return "";
  }

  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}

const onboardingSectionStepById: Record<string, number> = {
  "au-pair-introduction": 3,
  accommodation: 2,
  expectations: 2,
  "family-introduction": 3,
};

function getElementStepIndex(element: HTMLElement) {
  const stepPanel = element.closest<HTMLElement>("[data-step-panel]");
  const stepValue = Number(stepPanel?.dataset.stepPanel);

  return Number.isInteger(stepValue) ? stepValue : null;
}

export function OnboardingForm({
  profile,
  action,
  onClientSubmit,
  externalError = "",
  submitLabel,
  savingLabel,
  finalStepContent,
  countries,
  nationalities,
  languageOptions,
  phoneCountryCodes,
  childrenOptions,
  religionOptions,
  smokingOptions,
}: OnboardingFormProps) {
  const locale = useLocale();
  const t = useTranslations();
  const [actionState, formAction, isActionSaving] = useActionState(
    action ?? idleOnboardingAction,
    { error: "" },
  );
  const formRef = useRef<HTMLFormElement>(null);
  const formCardRef = useRef<HTMLDivElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const isStepNavigationResetPendingRef = useRef(false);
  const ignoreImmediateSubmitAfterStepNavigationRef = useRef(false);
  const isBrowserStepNavigationRef = useRef(false);
  const stepHistoryActionRef = useRef<"push" | "replace">("push");
  const pendingHashTargetIdRef = useRef<string | null>(null);
  const activeStepIndexRef = useRef(0);
  const explicitSubmitIntentRef = useRef(false);

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [mountedThroughStepIndex, setMountedThroughStepIndex] = useState(
    profile.onboarding_completed ? 3 : 0,
  );
  const [validatedStepIndex, setValidatedStepIndex] = useState<number | null>(
    null,
  );
  const [formError, setFormError] = useState("");
  const [formErrorItems, setFormErrorItems] = useState<string[]>([]);
  const [clientSubmitError, setClientSubmitError] = useState("");
  const [isClientSaving, setIsClientSaving] = useState(false);
  const [selectedCurrentCountry, setSelectedCurrentCountry] = useState(
    profile.country ?? "",
  );
  const isSaving = isActionSaving || isClientSaving;
  const submissionError =
    formError || clientSubmitError || externalError || actionState.error;

  const isAuPair = profile.account_type === "au_pair";
  const examplePlaceholder = (value: string) =>
    profile.onboarding_completed ? value : "";
  const accentStyle = {
    "--pa-onboarding-accent": isAuPair ? "#f2b58f" : "#9ebbc7",
    "--pa-onboarding-accent-soft": isAuPair ? "#fde8dc" : "#e7f1f5",
    "--pa-onboarding-border": isAuPair ? "#f1d5c5" : "#cfe0e7",
    "--pa-onboarding-field-bg": isAuPair ? "#fff8f4" : "#f6fbfd",
    "--pa-onboarding-ring": isAuPair
      ? "rgba(242, 181, 143, 0.28)"
      : "rgba(158, 187, 199, 0.32)",
    "--pa-onboarding-section-bg": isAuPair ? "#fffaf7" : "#f8fcfd",
    "--pa-onboarding-surface": isAuPair ? "#fff3ec" : "#eef8fb",
    "--pa-onboarding-contrast": isAuPair ? "#8b4a2e" : "#45636f",
    borderTopColor: "var(--pa-onboarding-accent)",
  } as CSSProperties;
  const isEditing = profile.onboarding_completed;
  const fluentLanguages = profile.fluent_languages ?? [];
  const basicLanguages = profile.basic_languages ?? [];
  const emptyLabel = t("onboarding.selectOption");
  const alreadyInGermanyValue = booleanChoiceValue(profile.already_in_germany);
  const monthRangeLabels = {
    earliest: t("onboarding.earliestStartMonth"),
    latest: t("onboarding.latestStartMonth"),
    selectMonth: t("onboarding.selectMonth"),
  };
  const durationRangeLabels = {
    min: t("onboarding.durationMin"),
    max: t("onboarding.durationMax"),
    selectMinimum: t("onboarding.selectMinimum"),
    selectMaximum: t("onboarding.selectMaximum"),
    month: (value: number) => t("onboarding.monthAbbreviation", { count: value }),
  };
  const birthDateLabels = {
    title: t("onboarding.dateOfBirth"),
    day: t("onboarding.day"),
    month: t("onboarding.month"),
    year: t("onboarding.year"),
  };
  const prioritizedHostCountryOptions = prioritizeOptions(
    countries,
    popularHostCountries,
  );
  const stepTitles = isAuPair
    ? [
        t("onboarding.identity"),
        t("onboarding.matchDetails"),
        t("onboarding.experienceLanguages"),
        t("common.introduction"),
      ]
    : [
        t("onboarding.familyIdentity"),
        t("onboarding.matchDetails"),
        t("onboarding.homeDetails"),
        t("common.familyIntroduction"),
      ];
  const lastStepIndex = stepTitles.length - 1;

  function stepPanelClass(stepIndex: number) {
    if (activeStepIndex !== stepIndex) {
      return "hidden";
    }

    return `space-y-5 ${
      validatedStepIndex === stepIndex ? "pa-step-validated" : ""
    }`;
  }

  function shouldMountStep(stepIndex: number) {
    return (
      isEditing ||
      stepIndex <= Math.max(activeStepIndex, mountedThroughStepIndex)
    );
  }

  function activateStep(stepIndex: number) {
    setMountedThroughStepIndex((currentStepIndex) =>
      Math.max(currentStepIndex, stepIndex),
    );
    setActiveStepIndex(stepIndex);
  }

  const clearFormValidationFeedback = useCallback(() => {
    setFormError("");
    setFormErrorItems([]);
  }, []);

  function getStepPanel(form: HTMLFormElement, stepIndex = activeStepIndex) {
    return form.querySelector<HTMLElement>(`[data-step-panel="${stepIndex}"]`);
  }

  function getControlStepIndex(control: FormControl) {
    const stepPanel = control.closest<HTMLElement>("[data-step-panel]");
    const stepValue = stepPanel?.dataset.stepPanel;
    const stepIndex = Number(stepValue);

    return Number.isInteger(stepIndex) ? stepIndex : activeStepIndex;
  }

  function uniqueMessages(messages: string[]) {
    return Array.from(new Set(messages.filter(Boolean)));
  }

  function getControlIssueKey(control: FormControl) {
    if (control.dataset.errorGroup) {
      return control.dataset.errorGroup;
    }

    if (
      control instanceof HTMLInputElement &&
      control.type === "radio" &&
      control.name
    ) {
      return `radio:${control.name}`;
    }

    return control.name || control.id;
  }

  function getControlLabel(control: FormControl) {
    if (control.dataset.errorLabel) {
      return control.dataset.errorLabel;
    }

    return control.name
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function getControlIssueMessage(
    control: FormControl,
    scope: HTMLElement | HTMLFormElement,
  ) {
    const customRequiredMessage = control.dataset.errorMessage;

    if (!hasRequiredValue(control, scope)) {
      return (
        customRequiredMessage ??
        t("onboarding.fieldRequired", { field: getControlLabel(control) })
      );
    }

    return t("onboarding.fieldInvalid", { field: getControlLabel(control) });
  }

  function scrollFormCardIntoView() {
    const target = formCardRef.current ?? formRef.current;

    if (!target) {
      return;
    }

    const stickyHeaderOffset = 96;
    const targetTop =
      target.getBoundingClientRect().top + window.scrollY - stickyHeaderOffset;

    window.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth",
    });
  }

  const scrollHashTargetIntoView = useCallback((targetId: string) => {
    window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);

      if (!target) {
        return;
      }

      const stickyHeaderOffset = 104;
      const targetTop =
        target.getBoundingClientRect().top + window.scrollY - stickyHeaderOffset;

      window.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth",
      });

      const focusTarget = target.matches("input, select, textarea")
        ? target
        : target.querySelector("input, select, textarea");

      if (
        focusTarget instanceof HTMLInputElement ||
        focusTarget instanceof HTMLSelectElement ||
        focusTarget instanceof HTMLTextAreaElement
      ) {
        focusTarget.focus({ preventScroll: true });
      }
    });
  }, []);

  const openHashTarget = useCallback(() => {
    const targetId = getBrowserHashTargetId();

    if (!targetId) {
      return;
    }

    const target = document.getElementById(targetId);
    const stepIndex = target
      ? getElementStepIndex(target)
      : onboardingSectionStepById[targetId];

    if (
      typeof stepIndex !== "number" ||
      stepIndex < 0 ||
      stepIndex > lastStepIndex
    ) {
      return;
    }

    clearFormValidationFeedback();
    setClientSubmitError("");
    setValidatedStepIndex(null);
    stepHistoryActionRef.current = "replace";

    if (stepIndex === activeStepIndexRef.current) {
      scrollHashTargetIntoView(targetId);
      return;
    }

    pendingHashTargetIdRef.current = targetId;
    activateStep(stepIndex);
  }, [clearFormValidationFeedback, lastStepIndex, scrollHashTargetIntoView]);

  function showValidationFeedback(
    control: FormControl,
    messages: string[],
    scrollTargetId?: string,
  ) {
    const stepIndex = getControlStepIndex(control);
    const nextMessages = uniqueMessages(messages);

    setFormError(nextMessages[0] ?? t("onboarding.requiredFields"));
    setFormErrorItems(nextMessages);
    setValidatedStepIndex(stepIndex);
    stepHistoryActionRef.current =
      stepIndex < activeStepIndex ? "replace" : "push";
    activateStep(stepIndex);

    window.requestAnimationFrame(() => {
      if (errorSummaryRef.current) {
        errorSummaryRef.current.focus({ preventScroll: true });
        errorSummaryRef.current.scrollIntoView({
          block: "start",
          behavior: "smooth",
        });
        return;
      }

      if (scrollTargetId) {
        document
          .getElementById(scrollTargetId)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      }

      const visibleChoiceButton =
        control instanceof HTMLInputElement && control.type === "hidden"
          ? formRef.current?.querySelector<HTMLButtonElement>(
              `[data-pa-choice-button="${control.name}"]`,
            )
          : null;

      (visibleChoiceButton ?? control).focus({
        preventScroll: Boolean(scrollTargetId),
      });
    });
  }

  function showControlError(
    control: FormControl,
    message: string,
    scrollTargetId?: string,
  ) {
    control.setCustomValidity(message);
    showValidationFeedback(control, [message], scrollTargetId);
  }

  function focusInvalidControls(
    controls: FormControl[],
    scope: HTMLElement | HTMLFormElement,
  ) {
    const firstInvalidControl = controls[0];
    const seenIssueKeys = new Set<string>();
    const messages = controls.flatMap((control) => {
      const issueKey = getControlIssueKey(control);

      if (seenIssueKeys.has(issueKey)) {
        return [];
      }

      seenIssueKeys.add(issueKey);
      return [getControlIssueMessage(control, scope)];
    });

    if (firstInvalidControl) {
      showValidationFeedback(firstInvalidControl, messages);
    }
  }

  function isInScope(control: Element | null, scope: HTMLElement | HTMLFormElement) {
    return Boolean(control && scope.contains(control));
  }

  function validateCustomFields(
    form: HTMLFormElement,
    scope: HTMLElement | HTMLFormElement,
  ) {
    const birthDay = form.elements.namedItem("birth_day") as HTMLSelectElement | null;
    const birthMonth = form.elements.namedItem("birth_month") as HTMLSelectElement | null;
    const birthYear = form.elements.namedItem("birth_year") as HTMLSelectElement | null;
    const streetAddress = form.elements.namedItem(
      "street_address",
    ) as HTMLInputElement | null;
    const personNameInputs = ["first_name", "last_name"]
      .map((name) => form.elements.namedItem(name))
      .filter((control): control is HTMLInputElement =>
        control instanceof HTMLInputElement,
      );

    birthDay?.setCustomValidity("");
    streetAddress?.setCustomValidity("");

    for (const nameInput of personNameInputs) {
      nameInput.setCustomValidity("");

      if (!isInScope(nameInput, scope)) continue;

      nameInput.value = normalizePersonName(nameInput.value);

      if (hasSuspiciousPersonNameCasing(nameInput.value)) {
        showControlError(nameInput, t("onboarding.nameCapitalizationError"));
        return false;
      }
    }

    if (isAuPair) {
      const preferredHostCountryInputs = Array.from(
        form.querySelectorAll<HTMLInputElement>(
          'input[name="preferred_host_countries"]',
        ),
      );
      const shouldValidatePreferredHostCountries =
        preferredHostCountryInputs.length > 0 &&
        preferredHostCountryInputs.some((input) => isInScope(input, scope));

      preferredHostCountryInputs.forEach((input) => input.setCustomValidity(""));

      if (shouldValidatePreferredHostCountries) {
        const selectedPreferredHostCountries = preferredHostCountryInputs.filter(
          (input) => input.checked,
        );

        if (selectedPreferredHostCountries.length === 0) {
          showControlError(
            preferredHostCountryInputs[0],
            t("onboarding.preferredHostCountriesRequired"),
            "preferred_host_countries_group",
          );
          return false;
        }

        if (selectedPreferredHostCountries.length > preferredHostCountryLimit) {
          showControlError(
            preferredHostCountryInputs[0],
            t("onboarding.preferredHostCountriesLimit"),
            "preferred_host_countries_group",
          );
          return false;
        }
      }
    }

    if (
      isAuPair &&
      birthDay &&
      birthMonth &&
      birthYear &&
      isInScope(birthDay, scope)
    ) {
      const hasAllBirthFields =
        birthDay.value && birthMonth.value && birthYear.value;

      if (
        hasAllBirthFields &&
        !isValidBirthDate(birthDay.value, birthMonth.value, birthYear.value)
      ) {
        showControlError(birthDay, t("onboarding.validBirthDate"));
        return false;
      }
    }

    if (
      streetAddress &&
      isInScope(streetAddress, scope) &&
      streetAddress.value.trim() &&
      !streetAddressRegex.test(streetAddress.value.trim())
    ) {
      showControlError(streetAddress, t("onboarding.streetError"));
      return false;
    }

    return true;
  }

  function validateControls(scope: HTMLElement | HTMLFormElement) {
    const invalidControls = Array.from(
      scope.querySelectorAll<FormControl>("input, select, textarea"),
    ).filter((control) => !isControlValid(control, scope));

    if (invalidControls.length) {
      focusInvalidControls(invalidControls, scope);
      return false;
    }

    return true;
  }

  function validateScope(scope: HTMLElement | HTMLFormElement) {
    const form = formRef.current;

    if (!form) {
      return false;
    }

    if (!validateCustomFields(form, scope)) {
      return false;
    }

    return validateControls(scope);
  }

  function getRadioGroupControls(scope: HTMLElement | HTMLFormElement, name: string) {
    return Array.from(
      scope.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ).filter((input) => input.name === name);
  }

  function inputMatchesPattern(input: HTMLInputElement) {
    if (!input.value || !input.pattern) {
      return true;
    }

    try {
      return new RegExp(`^(?:${input.pattern})$`, "u").test(input.value);
    } catch {
      return !input.validity.patternMismatch;
    }
  }

  function hasRequiredValue(
    control: FormControl,
    scope: HTMLElement | HTMLFormElement,
  ) {
    if (
      control instanceof HTMLInputElement &&
      control.type === "hidden" &&
      control.dataset.paChoiceRequired === "true"
    ) {
      return control.value.trim().length > 0;
    }

    if (!control.required) {
      return true;
    }

    if (control instanceof HTMLInputElement) {
      if (control.type === "hidden") {
        return true;
      }

      if (control.type === "radio") {
        return getRadioGroupControls(scope, control.name).some(
          (input) => input.checked,
        );
      }

      if (control.type === "checkbox") {
        return control.checked;
      }
    }

    return control.value.trim().length > 0;
  }

  function isControlValid(
    control: FormControl,
    scope: HTMLElement | HTMLFormElement,
  ) {
    if (control.disabled) {
      return true;
    }

    if (!hasRequiredValue(control, scope)) {
      return false;
    }

    if (control.validity.customError) {
      return false;
    }

    if (control instanceof HTMLInputElement) {
      if (!inputMatchesPattern(control)) {
        return false;
      }

      if (control.value && control.validity.typeMismatch) {
        return false;
      }
    }

    if (
      (control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement) &&
      control.value &&
      control.minLength > 0 &&
      control.value.length < control.minLength
    ) {
      return false;
    }

    return true;
  }

  function goToStep(stepIndex: number) {
    isStepNavigationResetPendingRef.current = true;
    ignoreImmediateSubmitAfterStepNavigationRef.current = true;
    stepHistoryActionRef.current =
      stepIndex < activeStepIndex ? "replace" : "push";
    clearFormValidationFeedback();
    setValidatedStepIndex(null);
    activateStep(stepIndex);
    window.requestAnimationFrame(() => {
      scrollFormCardIntoView();

      window.setTimeout(() => {
        ignoreImmediateSubmitAfterStepNavigationRef.current = false;
      }, 250);
    });
  }

  function handleNextStep() {
    const form = formRef.current;
    const currentStepIndex = activeStepIndex;
    const activePanel = form ? getStepPanel(form, currentStepIndex) : null;

    if (!form || !activePanel) return;

    clearFormValidationFeedback();
    setValidatedStepIndex(null);

    if (!validateScope(activePanel)) {
      return;
    }

    goToStep(Math.min(currentStepIndex + 1, lastStepIndex));
  }

  function handlePreviousStep() {
    goToStep(Math.max(activeStepIndex - 1, 0));
  }

  useEffect(() => {
    activeStepIndexRef.current = activeStepIndex;

    const pendingHashTargetId = pendingHashTargetIdRef.current;

    if (!pendingHashTargetId) {
      return;
    }

    pendingHashTargetIdRef.current = null;
    scrollHashTargetIntoView(pendingHashTargetId);
  }, [activeStepIndex, scrollHashTargetIntoView]);

  useEffect(() => {
    const initialHashFrame = window.requestAnimationFrame(openHashTarget);

    window.addEventListener("hashchange", openHashTarget);

    return () => {
      window.cancelAnimationFrame(initialHashFrame);
      window.removeEventListener("hashchange", openHashTarget);
    };
  }, [openHashTarget]);

  useEffect(() => {
    if (!isStepNavigationResetPendingRef.current) {
      return;
    }

    isStepNavigationResetPendingRef.current = false;
    clearFormValidationFeedback();
    setClientSubmitError("");
    setValidatedStepIndex(null);
  }, [activeStepIndex, clearFormValidationFeedback]);

  useEffect(() => {
    const state = window.history.state;

    if (state?.paOnboardingStep !== 0) {
      window.history.replaceState(
        { ...state, paOnboardingStep: 0 },
        "",
        window.location.href,
      );
    }

    function handlePopState(event: PopStateEvent) {
      const nextStep = event.state?.paOnboardingStep;

      if (
        typeof nextStep !== "number" ||
        nextStep < 0 ||
        nextStep > lastStepIndex
      ) {
        return;
      }

      isBrowserStepNavigationRef.current = true;
      clearFormValidationFeedback();
      setClientSubmitError("");
      setValidatedStepIndex(null);
      activateStep(nextStep);
      window.requestAnimationFrame(() => {
        scrollFormCardIntoView();
      });
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [clearFormValidationFeedback, lastStepIndex]);

  useEffect(() => {
    if (isBrowserStepNavigationRef.current) {
      isBrowserStepNavigationRef.current = false;
      return;
    }

    const currentState = window.history.state;

    if (currentState?.paOnboardingStep === activeStepIndex) {
      return;
    }

    const nextState = { ...currentState, paOnboardingStep: activeStepIndex };
    const historyAction = stepHistoryActionRef.current;

    stepHistoryActionRef.current = "push";

    if (historyAction === "replace") {
      window.history.replaceState(nextState, "", window.location.href);
      return;
    }

    window.history.pushState(nextState, "", window.location.href);
  }, [activeStepIndex]);

  async function submitClientForm(form: HTMLFormElement) {
    if (!onClientSubmit) {
      return;
    }

    setClientSubmitError("");
    setIsClientSaving(true);

    try {
      const result = await onClientSubmit(new FormData(form));

      if (result?.error) {
        setClientSubmitError(result.error);
      }
    } catch (error) {
      setClientSubmitError(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please check the form and try again.",
      );
    } finally {
      setIsClientSaving(false);
    }
  }

  function clearValidationFeedback(event: FormEvent<HTMLFormElement>) {
    const target = event.target;

    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      target.setCustomValidity("");
    }

    clearFormValidationFeedback();
    setClientSubmitError("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const hasExplicitSubmitIntent = explicitSubmitIntentRef.current;
    explicitSubmitIntentRef.current = false;

    if (
      ignoreImmediateSubmitAfterStepNavigationRef.current &&
      !hasExplicitSubmitIntent
    ) {
      event.preventDefault();
      clearFormValidationFeedback();
      setClientSubmitError("");
      setValidatedStepIndex(null);
      return;
    }

    clearFormValidationFeedback();
    setValidatedStepIndex(null);

    const form = event.currentTarget;

    if (activeStepIndex < lastStepIndex) {
      event.preventDefault();
      handleNextStep();
      return;
    }

    if (!validateScope(form)) {
      event.preventDefault();
      return;
    }

    trackFunnelEvent(
      isEditing ? "onboarding_update_submitted" : "onboarding_submitted",
      {
        account_type: profile.account_type,
      },
    );

    if (onClientSubmit) {
      event.preventDefault();
      void submitClientForm(form);
    }
  }

  return (
    <div
      ref={formCardRef}
      style={accentStyle}
      aria-busy={isSaving || undefined}
      className="relative w-full max-w-full overflow-visible rounded-[1.5rem] border border-[var(--pa-onboarding-border)] border-t-8 bg-[linear-gradient(180deg,var(--pa-onboarding-surface)_0%,#fff_9rem,#fff_100%)] shadow-sm sm:rounded-[2rem]"
    >
      {isSaving ? (
        <OnboardingSavingOverlay label={savingLabel ?? t("onboarding.saving")} />
      ) : null}

      <div className="relative px-4 pb-4 pt-4 sm:p-7 sm:pt-6">
      <div className="mb-7">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--pa-onboarding-contrast)]">
          {isEditing ? t("onboarding.editProfile") : t("onboarding.title")}
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-[-0.03em] sm:text-4xl">
          {isAuPair ? t("onboarding.auPairProfile") : t("onboarding.familyProfile")}
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-[#25302d]/58">
          {t("onboarding.fieldsRequiredHelp")}
        </p>
      </div>

      {formErrorItems.length ? (
        <div
          ref={errorSummaryRef}
          role="alert"
          tabIndex={-1}
          className="mb-5 rounded-2xl border border-[#d95f49]/30 bg-[#fff5f2] p-4 text-sm font-semibold text-[#9d3f2f] outline-none ring-[#d95f49]/20 focus:ring-4"
        >
          <p className="font-black">{t("onboarding.validationTitle")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {formErrorItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : submissionError ? (
        <div className="mb-5 rounded-2xl border border-[#d95f49]/20 bg-[#fff5f2] p-4 text-sm font-semibold text-[#9d3f2f]">
          {submissionError}
        </div>
      ) : null}

      <form
        ref={formRef}
        noValidate
        action={action ? formAction : undefined}
        onChange={clearValidationFeedback}
        onInput={clearValidationFeedback}
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        <DateOfBirthValidationFix />
        <input type="hidden" name="account_type" value={profile.account_type} />

        {isAuPair ? (
          <>
            {shouldMountStep(0) ? (
            <div data-step-panel={0} className={stepPanelClass(0)}>
            <Section title={t("onboarding.identity")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("onboarding.firstName")}
                  name="first_name"
                  placeholder={examplePlaceholder("Anna")}
                  defaultValue={profile.first_name}
                  required
                  pattern={personNamePattern}
                  title={t("onboarding.nameHint")}
                  allowedChars={personNameChars}
                  maxLength={50}
                  normalizeOnBlur
                  capitalizationError={t("onboarding.nameCapitalizationError")}
                />

                <Field
                  label={t("onboarding.lastName")}
                  name="last_name"
                  placeholder={examplePlaceholder("Müller")}
                  defaultValue={profile.last_name}
                  required
                  pattern={personNamePattern}
                  title={t("onboarding.nameHint")}
                  allowedChars={personNameChars}
                  maxLength={50}
                  normalizeOnBlur
                  capitalizationError={t("onboarding.nameCapitalizationError")}
                />

                <BirthDateFields
                  date={profile.date_of_birth}
                  labels={birthDateLabels}
                  accountType={profile.account_type}
                />

                <RadioGroup
                  label={t("onboarding.gender")}
                  name="gender"
                  options={[
                    { label: t("enum.gender.female"), value: "female" },
                    { label: t("enum.gender.male"), value: "male" },
                  ]}
                  defaultValue={profile.gender}
                  required
                />
              </div>
            </Section>

            <Section title={t("onboarding.locationContact")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("onboarding.street")}
                  name="street_address"
                  placeholder={examplePlaceholder("Example Street 12")}
                  defaultValue={profile.street_address}
                  required
                  pattern={streetAddressPattern}
                  title={t("onboarding.streetHint")}
                  allowedChars={streetAddressChars}
                  maxLength={100}
                />

                <Field
                  label={t("common.city")}
                  name="city"
                  placeholder={examplePlaceholder("Berlin")}
                  defaultValue={profile.city}
                  required
                  pattern={cityPattern}
                  title={t("onboarding.cityHint")}
                  allowedChars={cityChars}
                  maxLength={100}
                  normalizeOnBlur
                />

                <SelectField
                  label={t("onboarding.currentCountry")}
                  name="country"
                  options={countries}
                  defaultValue={profile.country}
                  required
                  emptyLabel={emptyLabel}
                  formatOption={(country) => formatCountryName(country, locale, t)}
                  onChange={setSelectedCurrentCountry}
                />

                <PhoneCodeSelect
                  options={phoneCountryCodes}
                  defaultValue={profile.phone_country_code}
                  required
                  label={t("onboarding.phoneCountryCode")}
                  emptyLabel={emptyLabel}
                />

                <Field
                  label={t("onboarding.phoneNumber")}
                  name="phone_number"
                  placeholder={examplePlaceholder("15123456789")}
                  defaultValue={profile.phone_number}
                  required
                  pattern="[0-9]{5,15}"
                  title={t("onboarding.numbersOnly")}
                  inputMode="tel"
                  allowedChars={digitsOnlyChars}
                  maxLength={15}
                />
              </div>
            </Section>
            </div>
            ) : null}

            {shouldMountStep(1) ? (
            <div data-step-panel={1} className={stepPanelClass(1)}>
            <Section title={t("onboarding.matchDetails")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label={t("onboarding.passportCountry")}
                  name="nationality"
                  options={nationalities}
                  defaultValue={profile.nationality}
                  required
                  emptyLabel={emptyLabel}
                  formatOption={(country) => formatCountryName(country, locale, t)}
                  suggestedOption={selectedCurrentCountry}
                />

                <CountryCheckboxGroup
                  label={t("onboarding.preferredHostCountries")}
                  name="preferred_host_countries"
                  options={prioritizedHostCountryOptions}
                  defaultValues={profile.preferred_host_countries}
                  required
                  help={t("onboarding.preferredHostCountriesHelp")}
                  maxSelections={preferredHostCountryLimit}
                  maxSelectionError={t("onboarding.preferredHostCountriesLimit")}
                  formatOption={(country) => formatCountryName(country, locale, t)}
                />

                <SelectField
                  label={t("common.religion")}
                  name="religion"
                  options={religionOptions}
                  defaultValue={profile.religion}
                  required
                  emptyLabel={emptyLabel}
                  formatOption={(religion) => formatReligion(religion, locale) ?? religion}
                />

                <RadioGroup
                  label={t("onboarding.alreadyInGermany")}
                  name="already_in_germany"
                  options={[
                    { label: t("common.yes"), value: "yes" },
                    { label: t("common.no"), value: "no" },
                  ]}
                  defaultValue={alreadyInGermanyValue}
                  required
                />

                <StartWindowFields
                  from={profile.availability_start_from}
                  to={profile.availability_start_to}
                  labels={monthRangeLabels}
                />
                <DurationWindowFields
                  min={profile.duration_min_months}
                  max={profile.duration_max_months}
                  labels={durationRangeLabels}
                />

                <RadioGroup
                  label={t("onboarding.smoking")}
                  name="smoking_status"
                  options={smokingOptions.map((option) => ({
                    value: option.value,
                    label: formatSmoking(option.value, t),
                  }))}
                  defaultValue={profile.smoking_status}
                  required
                />
              </div>
            </Section>
            </div>
            ) : null}

            {shouldMountStep(2) ? (
            <div data-step-panel={2} className={stepPanelClass(2)}>
            <Section title={t("onboarding.auPairHighlights")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <RadioGroup
                  label={t("onboarding.hasDriversLicense")}
                  name="has_drivers_license"
                  options={[
                    { label: t("common.yes"), value: "yes" },
                    { label: t("common.no"), value: "no" },
                  ]}
                  defaultValue={booleanChoiceValue(profile.has_drivers_license)}
                  required
                />

                <RadioGroup
                  label={t("onboarding.hasChildcareExperience")}
                  name="has_childcare_experience"
                  options={[
                    { label: t("common.yes"), value: "yes" },
                    { label: t("common.no"), value: "no" },
                  ]}
                  defaultValue={booleanChoiceValue(
                    profile.has_childcare_experience,
                  )}
                  required
                />

                <RadioGroup
                  label={t("onboarding.hasInfantExperience")}
                  name="has_infant_experience"
                  options={[
                    { label: t("common.yes"), value: "yes" },
                    { label: t("common.no"), value: "no" },
                  ]}
                  defaultValue={booleanChoiceValue(profile.has_infant_experience)}
                  required
                />

                <RadioGroup
                  label={t("onboarding.hasFirstAid")}
                  name="has_first_aid"
                  options={[
                    { label: t("common.yes"), value: "yes" },
                    { label: t("common.no"), value: "no" },
                  ]}
                  defaultValue={booleanChoiceValue(profile.has_first_aid)}
                  required
                />

                <RadioGroup
                  label={t("onboarding.willCareForElderly")}
                  name="will_care_for_elderly"
                  options={[
                    { label: t("common.yes"), value: "yes" },
                    { label: t("common.no"), value: "no" },
                  ]}
                  defaultValue={booleanChoiceValue(
                    profile.will_care_for_elderly,
                  )}
                  required
                />

                <RadioGroup
                  label={t("onboarding.willCareForPets")}
                  name="will_care_for_pets"
                  options={[
                    { label: t("common.yes"), value: "yes" },
                    { label: t("common.no"), value: "no" },
                  ]}
                  defaultValue={booleanChoiceValue(profile.will_care_for_pets)}
                  required
                />
              </div>
            </Section>

            <Section title={t("onboarding.languageSkills")}>
              <div className="grid gap-4 sm:grid-cols-3">
                <LanguageSelectRow
                  label={t("common.motherTongue")}
                  name="mother_tongue"
                  options={languageOptions}
                  defaultValue={profile.mother_tongue}
                  required
                  emptyLabel={emptyLabel}
                  formatOption={(language) => formatLanguageName(language, locale, t)}
                />

                <LanguageSelectRow
                  label={t("common.fluentLanguage")}
                  name="fluent_language"
                  options={languageOptions}
                  defaultValue={fluentLanguages[0]}
                  emptyLabel={emptyLabel}
                  formatOption={(language) => formatLanguageName(language, locale, t)}
                />

                <LanguageSelectRow
                  label={t("common.basicLanguage")}
                  name="basic_language"
                  options={languageOptions}
                  defaultValue={basicLanguages[0]}
                  emptyLabel={emptyLabel}
                  formatOption={(language) => formatLanguageName(language, locale, t)}
                />
              </div>
            </Section>
            </div>
            ) : null}

            {shouldMountStep(3) ? (
            <div data-step-panel={3} className={stepPanelClass(3)}>
            <Section title={t("common.introduction")} id="au-pair-introduction">
              <TextArea
                label={t("common.aboutYou")}
                name="bio"
                placeholder={examplePlaceholder(
                  t("onboarding.aboutYouPlaceholder"),
                )}
                defaultValue={profile.bio}
                required
                maxLength={1350}
                maxLengthLabel={t("common.maximumCharacters", { count: 1350 })}
                rows={16}
              />
            </Section>
            {finalStepContent}
            </div>
            ) : null}
          </>
        ) : (
          <>
            {shouldMountStep(0) ? (
            <div data-step-panel={0} className={stepPanelClass(0)}>
            <Section title={t("onboarding.familyIdentity")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("onboarding.firstName")}
                  name="first_name"
                  placeholder={examplePlaceholder("Julia")}
                  defaultValue={profile.first_name}
                  required
                  pattern={personNamePattern}
                  title={t("onboarding.nameHint")}
                  allowedChars={personNameChars}
                  maxLength={50}
                  normalizeOnBlur
                  capitalizationError={t("onboarding.nameCapitalizationError")}
                />

                <Field
                  label={t("onboarding.lastName")}
                  name="last_name"
                  placeholder={examplePlaceholder("Miller")}
                  defaultValue={profile.last_name}
                  required
                  pattern={personNamePattern}
                  title={t("onboarding.nameHint")}
                  allowedChars={personNameChars}
                  maxLength={50}
                  normalizeOnBlur
                  capitalizationError={t("onboarding.nameCapitalizationError")}
                />

                <SelectField
                  label={t("onboarding.hostCountry")}
                  name="country"
                  options={prioritizedHostCountryOptions}
                  defaultValue={profile.country}
                  required
                  emptyLabel={emptyLabel}
                  formatOption={(country) => formatCountryName(country, locale, t)}
                />

                <SelectField
                  label={t("common.religion")}
                  name="religion"
                  options={religionOptions}
                  defaultValue={profile.religion}
                  required
                  emptyLabel={emptyLabel}
                  formatOption={(religion) => formatReligion(religion, locale) ?? religion}
                />
              </div>
            </Section>

            <Section title={t("onboarding.locationContact")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("onboarding.street")}
                  name="street_address"
                  placeholder={examplePlaceholder("Example Street 12")}
                  defaultValue={profile.street_address}
                  required
                  pattern={streetAddressPattern}
                  title={t("onboarding.streetHint")}
                  allowedChars={streetAddressChars}
                  maxLength={100}
                />

                <Field
                  label={t("common.city")}
                  name="city"
                  placeholder={examplePlaceholder("München")}
                  defaultValue={profile.city}
                  required
                  pattern={cityPattern}
                  title={t("onboarding.cityHint")}
                  allowedChars={cityChars}
                  maxLength={100}
                  normalizeOnBlur
                />

                <PhoneCodeSelect
                  options={phoneCountryCodes}
                  defaultValue={profile.phone_country_code}
                  required
                  label={t("onboarding.phoneCountryCode")}
                  emptyLabel={emptyLabel}
                />

                <Field
                  label={t("onboarding.phoneNumber")}
                  name="phone_number"
                  placeholder={examplePlaceholder("15123456789")}
                  defaultValue={profile.phone_number}
                  required
                  pattern="[0-9]{5,15}"
                  title={t("onboarding.numbersOnly")}
                  inputMode="tel"
                  allowedChars={digitsOnlyChars}
                  maxLength={15}
                />
              </div>
            </Section>
            </div>
            ) : null}

            {shouldMountStep(1) ? (
            <div data-step-panel={1} className={stepPanelClass(1)}>
            <Section title={t("onboarding.matchDetails")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label={t("onboarding.children")}
                  name="children_info"
                  options={childrenOptions}
                  defaultValue={profile.children_info}
                  required
                  emptyLabel={emptyLabel}
                  formatOption={(childrenInfo) =>
                    formatChildrenInfo(childrenInfo, t) ?? childrenInfo
                  }
                />
                <StartWindowFields
                  from={profile.availability_start_from}
                  to={profile.availability_start_to}
                  labels={monthRangeLabels}
                />
                <DurationWindowFields
                  min={profile.duration_min_months}
                  max={profile.duration_max_months}
                  labels={durationRangeLabels}
                />
                <AllowanceFields
                  amount={profile.au_pair_allowance_amount}
                  amountPlaceholder={examplePlaceholder("300")}
                  currency={profile.au_pair_allowance_currency}
                  labels={{
                    title: t("common.auPairAllowance"),
                    help: t("onboarding.allowanceHelp"),
                    amount: t("common.monthlyAllowance"),
                    currency: t("common.currency"),
                  }}
                />
              </div>
            </Section>
            </div>
            ) : null}

            {shouldMountStep(2) ? (
            <div data-step-panel={2} className={stepPanelClass(2)}>
            <Section title={t("onboarding.homeDetails")}>
              <div className="space-y-5">
                <TextArea
                  label={t("common.accommodation")}
                  name="accommodation_info"
                  anchorId="accommodation"
                  placeholder={examplePlaceholder(
                    t("onboarding.accommodationPlaceholder"),
                  )}
                  defaultValue={profile.accommodation_info}
                  maxLength={1200}
                  maxLengthLabel={t("common.maximumCharacters", { count: 1200 })}
                  rows={14}
                />

                <TextArea
                  label={t("common.expectations")}
                  name="expectations"
                  anchorId="expectations"
                  placeholder={examplePlaceholder(
                    t("onboarding.expectationsPlaceholder"),
                  )}
                  defaultValue={profile.expectations}
                  maxLength={1400}
                  maxLengthLabel={t("common.maximumCharacters", { count: 1400 })}
                  rows={15}
                />
              </div>
            </Section>
            </div>
            ) : null}

            {shouldMountStep(3) ? (
            <div data-step-panel={3} className={stepPanelClass(3)}>
            <Section title={t("common.familyIntroduction")}>
              <div className="space-y-5">
                <TextArea
                  label={t("common.familyIntroduction")}
                  name="bio"
                  anchorId="family-introduction"
                  placeholder={examplePlaceholder(
                    t("onboarding.familyIntroPlaceholder"),
                  )}
                  defaultValue={profile.bio}
                  maxLength={1400}
                  maxLengthLabel={t("common.maximumCharacters", { count: 1400 })}
                  rows={16}
                />
              </div>
            </Section>
            {finalStepContent}
            </div>
            ) : null}
          </>
        )}

        <div className="flex flex-col gap-3 border-t border-black/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handlePreviousStep}
            disabled={activeStepIndex === 0 || isSaving}
            className="rounded-full border border-black/10 bg-white px-6 py-3 text-sm font-bold text-[#25302d] transition hover:border-[#6f8793]/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("onboarding.previousStep")}
          </button>

          {activeStepIndex < lastStepIndex ? (
            <button
              type="button"
              onClick={handleNextStep}
              disabled={isSaving}
              className="rounded-full bg-[var(--pa-primary)] px-6 py-3 text-sm font-bold text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("onboarding.nextStep")}
            </button>
          ) : (
            <button
              type="submit"
              onPointerDown={() => {
                explicitSubmitIntentRef.current = true;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  explicitSubmitIntentRef.current = true;
                }
              }}
              onClick={() => {
                explicitSubmitIntentRef.current = true;
              }}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--pa-primary)] px-6 py-3 text-sm font-bold text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-[#25302d]/25 border-t-[#25302d]"
                />
              ) : null}
              {isSaving
                ? savingLabel ?? t("onboarding.saving")
                : submitLabel ?? t("onboarding.saveProfile")}
            </button>
          )}
        </div>
      </form>
      </div>
    </div>
  );
}
