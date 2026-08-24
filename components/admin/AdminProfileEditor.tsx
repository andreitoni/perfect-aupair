"use client";

import { updateAdminProfileDetails } from "@/app/admin/actions";
import {
  allowanceCurrencyOptions,
  childrenOptions,
  countries,
  languageOptions,
  phoneCountryCodes,
  religionOptions,
  smokingOptions,
} from "@/lib/profile-options";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

export type AdminEditableProfile = {
  id: string;
  account_type: "family" | "au_pair";
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  birth_date: string | null;
  gender: string | null;
  phone_country_code: string | null;
  phone_number: string | null;
  street_address: string | null;
  city: string | null;
  country: string | null;
  nationality: string | null;
  preferred_host_countries: string[] | null;
  religion: string | null;
  smoking_status: string | null;
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
  bio: string | null;
  childcare_experience: string | null;
  children_info: string | null;
  au_pair_allowance_amount: number | null;
  au_pair_allowance_currency: string | null;
  accommodation_info: string | null;
  expectations: string | null;
};

const initialState = {
  status: "idle" as const,
  message: "",
};

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-xl border border-[var(--pa-admin-border)] bg-white px-3 py-2 text-base font-semibold text-[var(--pa-admin-ink)] outline-none transition placeholder:text-[var(--pa-admin-muted)]/55 focus:border-[var(--pa-primary)] focus:ring-4 focus:ring-[var(--pa-primary-focus-ring)]";

const textareaClassName = `${inputClassName} min-h-28 resize-y leading-6`;

function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="text-sm font-bold text-[var(--pa-admin-ink)]">
        {label}
      </span>
      {hint ? (
        <span className="mt-0.5 block text-xs font-medium leading-5 text-[var(--pa-admin-muted)]">
          {hint}
        </span>
      ) : null}
      {children}
    </label>
  );
}

function BooleanSelect({
  name,
  value,
}: {
  name: string;
  value: boolean | null;
}) {
  return (
    <select
      name={name}
      defaultValue={value === true ? "yes" : "no"}
      className={inputClassName}
    >
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}

function CurrentSelectOption({
  value,
  options,
}: {
  value: string | null;
  options: readonly string[];
}) {
  if (!value || options.includes(value)) return null;

  return <option value={value}>{value} (current value)</option>;
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-2xl border border-[var(--pa-admin-border)] bg-[var(--pa-admin-surface-subtle)] p-4 sm:p-5">
      <legend className="sr-only">{title}</legend>
      <h3 className="text-base font-black text-[var(--pa-admin-ink)]">
        {title}
      </h3>
      <p className="mt-1 text-xs font-medium leading-5 text-[var(--pa-admin-muted)]">
        {description}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function AdminProfileEditor({
  profile,
  expectedVersion,
  initiallyOpen = false,
}: {
  profile: AdminEditableProfile;
  expectedVersion: string;
  initiallyOpen?: boolean;
}) {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement | null>(null);
  const [isEditing, setIsEditing] = useState(initiallyOpen);
  const [isDirty, setIsDirty] = useState(false);
  const [state, formAction, pending] = useActionState(
    updateAdminProfileDetails,
    initialState,
  );

  useEffect(() => {
    if (state.status !== "success") return;

    // A completed server action is the boundary between edit and summary mode.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsEditing(false);
    setIsDirty(false);
    router.refresh();
  }, [router, state]);

  useEffect(() => {
    if (!isEditing || !isDirty) return;

    const confirmDiscard = () =>
      window.confirm(
        "Discard the unsaved profile changes and leave this editor?",
      );
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const handleLinkClick = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) return;

      const link = target.closest<HTMLAnchorElement>("a[href]");

      if (!link || link.target === "_blank" || link.hasAttribute("download")) {
        return;
      }

      if (confirmDiscard()) {
        setIsDirty(false);
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleLinkClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleLinkClick, true);
    };
  }, [isDirty, isEditing]);

  useEffect(() => {
    if (state.status !== "error") return;

    window.requestAnimationFrame(() => {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      errorRef.current?.focus({ preventScroll: true });
    });
  }, [state]);

  function openEditor() {
    setIsDirty(false);
    setIsEditing(true);
  }

  function cancelEditor() {
    if (
      isDirty &&
      !window.confirm("Discard the unsaved changes to this member profile?")
    ) {
      return;
    }

    setIsDirty(false);
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <section
        id="profile-editor"
        className="scroll-mt-36 rounded-[1.5rem] border border-[#b9d8cf] bg-[#f1faf6] p-4 shadow-sm sm:p-5 lg:col-span-2"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--pa-primary)]">
              Admin editing
            </p>
            <h2 className="mt-1 text-lg font-black text-[var(--pa-admin-ink)]">
              Profile information
            </h2>
            <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-[var(--pa-admin-muted)]">
              Update identity, location, contact details and public profile
              content without signing in as this member.
            </p>
            {state.status === "success" ? (
              <p
                role="status"
                className="mt-3 text-sm font-bold text-[var(--pa-admin-success)]"
              >
                {state.message}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={openEditor}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[var(--pa-admin-ink)] px-5 text-sm font-bold text-white outline-none transition hover:bg-[#23463d] focus-visible:ring-4 focus-visible:ring-[var(--pa-primary-focus-ring)]"
          >
            Edit profile
          </button>
        </div>
      </section>
    );
  }

  const isAuPair = profile.account_type === "au_pair";

  return (
    <section
      id="profile-editor"
      className="scroll-mt-36 rounded-[1.5rem] border border-[var(--pa-primary)]/30 bg-white shadow-[var(--pa-admin-shadow)] lg:col-span-2"
    >
      <form
        action={formAction}
        autoComplete="off"
        onChange={() => setIsDirty(true)}
      >
        <input type="hidden" name="profile_id" value={profile.id} />
        <input
          type="hidden"
          name="expected_version"
          value={expectedVersion}
        />

        <div className="flex flex-col gap-3 border-b border-[var(--pa-admin-border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--pa-primary)]">
              Editing member
            </p>
            <h2 className="mt-1 text-xl font-black text-[var(--pa-admin-ink)]">
              Profile information
            </h2>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={cancelEditor}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--pa-admin-border)] bg-white px-4 text-sm font-bold text-[var(--pa-admin-ink)] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        <div className="space-y-4 p-4 pb-24 sm:p-6 sm:pb-24 lg:pb-6">
          {state.status === "error" ? (
            <div
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
            >
              {state.message}
            </div>
          ) : null}

          <FormSection
            title="Identity"
            description="The public name is independent from the private first and last name, which is useful for custom family names."
          >
            <Field label="Public display name" className="sm:col-span-2">
              <input
                name="full_name"
                defaultValue={profile.full_name ?? ""}
                maxLength={120}
                className={inputClassName}
              />
            </Field>
            <Field label="First name">
              <input
                name="first_name"
                defaultValue={profile.first_name ?? ""}
                maxLength={50}
                className={inputClassName}
              />
            </Field>
            <Field label="Last name">
              <input
                name="last_name"
                defaultValue={profile.last_name ?? ""}
                maxLength={50}
                className={inputClassName}
              />
            </Field>
            {isAuPair ? (
              <>
                <Field label="Date of birth">
                  <input
                    type="date"
                    name="date_of_birth"
                    defaultValue={
                      profile.birth_date ?? profile.date_of_birth ?? ""
                    }
                    className={inputClassName}
                  />
                </Field>
                <Field label="Gender">
                  <select
                    name="gender"
                    defaultValue={profile.gender ?? ""}
                    className={inputClassName}
                  >
                    <option value="">Not set</option>
                    <CurrentSelectOption
                      value={profile.gender}
                      options={["female", "male"]}
                    />
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </Field>
              </>
            ) : null}
          </FormSection>

          <FormSection
            title="Contact & location"
            description="Private contact details stay inside the admin area; city and country also update public discovery."
          >
            <Field label="Country">
              <select
                name="country"
                defaultValue={profile.country ?? ""}
                className={inputClassName}
              >
                <option value="">Not set</option>
                <CurrentSelectOption
                  value={profile.country}
                  options={countries}
                />
                {countries.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="City">
              <input
                name="city"
                defaultValue={profile.city ?? ""}
                maxLength={100}
                className={inputClassName}
              />
            </Field>
            <Field label="Street address" className="sm:col-span-2">
              <input
                name="street_address"
                defaultValue={profile.street_address ?? ""}
                maxLength={100}
                className={inputClassName}
              />
            </Field>
            <Field label="Phone country code">
              <select
                name="phone_country_code"
                defaultValue={profile.phone_country_code ?? ""}
                className={inputClassName}
              >
                <option value="">Not set</option>
                <CurrentSelectOption
                  value={profile.phone_country_code}
                  options={phoneCountryCodes.map((option) => option.value)}
                />
                {phoneCountryCodes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Phone number" hint="Digits only, without the country code.">
              <input
                name="phone_number"
                inputMode="numeric"
                defaultValue={profile.phone_number ?? ""}
                maxLength={15}
                className={inputClassName}
              />
            </Field>
          </FormSection>

          <FormSection
            title="Public profile"
            description="These fields are shown to members and may affect search and matching."
          >
            <Field
              label={isAuPair ? "Introduction" : "Family introduction"}
              className="sm:col-span-2"
            >
              <textarea
                name="bio"
                defaultValue={profile.bio ?? ""}
                maxLength={1400}
                className={textareaClassName}
              />
            </Field>
            <Field label="Religion">
              <select
                name="religion"
                defaultValue={profile.religion ?? ""}
                className={inputClassName}
              >
                <option value="">Not set</option>
                <CurrentSelectOption
                  value={profile.religion}
                  options={religionOptions}
                />
                {religionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            {isAuPair ? (
              <>
                <Field label="Nationality">
                  <select
                    name="nationality"
                    defaultValue={profile.nationality ?? ""}
                    className={inputClassName}
                  >
                    <option value="">Not set</option>
                    <CurrentSelectOption
                      value={profile.nationality}
                      options={countries}
                    />
                    {countries.map((country) => (
                      <option key={country} value={country}>
                        {country}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Preferred host countries"
                  hint="Comma-separated country names, maximum 6."
                  className="sm:col-span-2"
                >
                  <input
                    name="preferred_host_countries"
                    defaultValue={(profile.preferred_host_countries ?? []).join(
                      ", ",
                    )}
                    className={inputClassName}
                  />
                </Field>
                <Field label="Mother tongue">
                  <select
                    name="mother_tongue"
                    defaultValue={profile.mother_tongue ?? ""}
                    className={inputClassName}
                  >
                    <option value="">Not set</option>
                    <CurrentSelectOption
                      value={profile.mother_tongue}
                      options={languageOptions}
                    />
                    {languageOptions.map((language) => (
                      <option key={language} value={language}>
                        {language}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Fluent languages"
                  hint="Comma-separated names; maximum 12 distinct languages across all language fields."
                >
                  <input
                    name="fluent_languages"
                    defaultValue={(profile.fluent_languages ?? []).join(", ")}
                    className={inputClassName}
                  />
                </Field>
                <Field
                  label="Basic languages"
                  hint="Comma-separated names; maximum 12 distinct languages across all language fields."
                >
                  <input
                    name="basic_languages"
                    defaultValue={(profile.basic_languages ?? []).join(", ")}
                    className={inputClassName}
                  />
                </Field>
                <Field label="Smoking">
                  <select
                    name="smoking_status"
                    defaultValue={profile.smoking_status ?? ""}
                    className={inputClassName}
                  >
                    <option value="">Not set</option>
                    <CurrentSelectOption
                      value={profile.smoking_status}
                      options={smokingOptions.map((option) => option.value)}
                    />
                    {smokingOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Already in Germany">
                  <BooleanSelect
                    name="already_in_germany"
                    value={profile.already_in_germany}
                  />
                </Field>
                <Field label="Driver's license">
                  <BooleanSelect
                    name="has_drivers_license"
                    value={profile.has_drivers_license}
                  />
                </Field>
                <Field label="Childcare experience">
                  <BooleanSelect
                    name="has_childcare_experience"
                    value={profile.has_childcare_experience}
                  />
                </Field>
                <Field label="Infant experience">
                  <BooleanSelect
                    name="has_infant_experience"
                    value={profile.has_infant_experience}
                  />
                </Field>
                <Field label="First aid">
                  <BooleanSelect
                    name="has_first_aid"
                    value={profile.has_first_aid}
                  />
                </Field>
                <Field label="Willing to care for elderly people">
                  <BooleanSelect
                    name="will_care_for_elderly"
                    value={profile.will_care_for_elderly}
                  />
                </Field>
                <Field label="Willing to care for pets">
                  <BooleanSelect
                    name="will_care_for_pets"
                    value={profile.will_care_for_pets}
                  />
                </Field>
                <Field
                  label="Experience notes"
                  className="sm:col-span-2"
                >
                  <textarea
                    name="childcare_experience"
                    defaultValue={profile.childcare_experience ?? ""}
                    maxLength={1400}
                    className={textareaClassName}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Children">
                  <select
                    name="children_info"
                    defaultValue={profile.children_info ?? ""}
                    className={inputClassName}
                  >
                    <option value="">Not set</option>
                    <CurrentSelectOption
                      value={profile.children_info}
                      options={childrenOptions}
                    />
                    {childrenOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Monthly au pair allowance">
                  <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
                    <input
                      type="number"
                      min={1}
                      max={20000}
                      name="au_pair_allowance_amount"
                      defaultValue={profile.au_pair_allowance_amount ?? ""}
                      className={inputClassName}
                    />
                    <select
                      name="au_pair_allowance_currency"
                      defaultValue={
                        profile.au_pair_allowance_currency ?? "EUR"
                      }
                      className={inputClassName}
                    >
                      <CurrentSelectOption
                        value={profile.au_pair_allowance_currency}
                        options={allowanceCurrencyOptions}
                      />
                      {allowanceCurrencyOptions.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </div>
                </Field>
                <Field label="Accommodation" className="sm:col-span-2">
                  <textarea
                    name="accommodation_info"
                    defaultValue={profile.accommodation_info ?? ""}
                    maxLength={1200}
                    className={textareaClassName}
                  />
                </Field>
                <Field label="Expectations" className="sm:col-span-2">
                  <textarea
                    name="expectations"
                    defaultValue={profile.expectations ?? ""}
                    maxLength={1400}
                    className={textareaClassName}
                  />
                </Field>
              </>
            )}
          </FormSection>
        </div>

        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 grid grid-cols-2 gap-2 border-t border-[var(--pa-admin-border)] bg-white/95 px-3 py-3 shadow-[0_-12px_28px_rgba(23,45,40,0.09)] backdrop-blur lg:sticky lg:inset-x-auto lg:bottom-0 lg:flex lg:justify-end lg:px-6">
          <button
            type="button"
            disabled={pending}
            onClick={cancelEditor}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--pa-admin-border)] px-5 text-sm font-bold text-[var(--pa-admin-ink)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--pa-primary)] px-6 text-sm font-black text-[var(--pa-primary-ink)] shadow-sm disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? (
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
            ) : null}
            {pending ? "Saving changes..." : "Save changes"}
          </button>
        </div>
      </form>
    </section>
  );
}
