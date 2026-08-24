"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { authHomeHref, withAuthReturnTo } from "@/lib/auth/return-to";

import {
  DEFAULT_LANGUAGE,
  formatGeneratedFamilyDisplayName,
} from "@/lib/i18n/translations";
import { normalizeStartMonthRange } from "@/lib/month-options";
import {
  hasSuspiciousPersonNameCasing,
  normalizePersonName,
} from "@/lib/profile-name";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  allowanceCurrencyOptions,
  childrenOptions,
  countries,
  languageOptions,
  nationalities,
  phoneCountryCodeValues,
  religionOptions,
  smokingOptions,
} from "@/lib/profile-options";

function getRequiredString(formData: FormData, name: string) {
  const value = formData.get(name);

  if (!value || typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required field: ${name}`);
  }

  return value.trim();
}

function getOptionalString(formData: FormData, name: string) {
  const value = formData.get(name);

  if (!value || typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function requireAllowed(value: string, allowed: string[], fieldName: string) {
  if (!allowed.includes(value)) {
    throw new Error(`Invalid value for ${fieldName}`);
  }

  return value;
}

function requireAllowedList(
  formData: FormData,
  name: string,
  allowed: string[],
  label: string,
  maxItems: number,
) {
  const values = formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  const uniqueValues = Array.from(new Set(values));

  if (uniqueValues.length === 0) {
    throw new Error(`${label} is required`);
  }

  if (uniqueValues.length > maxItems) {
    throw new Error(`${label} can include up to ${maxItems} countries`);
  }

  for (const value of uniqueValues) {
    requireAllowed(value, allowed, name);
  }

  return uniqueValues;
}

function requireLettersOnly(
  value: string,
  fieldName: string,
  minLength = 2,
  maxLength = 60,
) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/[‐-‒–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  if (normalized.length < minLength || normalized.length > maxLength) {
    throw new Error(
      `${fieldName} must be between ${minLength} and ${maxLength} characters`,
    );
  }

  const regex = /^[\p{L}\p{M}][\p{L}\p{M} .,'’\p{Pd}]*$/u;

  if (!regex.test(normalized)) {
    throw new Error(
      `${fieldName} can only contain letters, spaces, apostrophes, hyphens, commas and dots`,
    );
  }

  return normalized;
}

function requirePersonName(value: string, fieldName: string) {
  const normalized = requireLettersOnly(
    normalizePersonName(value),
    fieldName,
    1,
    50,
  );

  if (hasSuspiciousPersonNameCasing(normalized)) {
    throw new Error(
      `${fieldName} uses unusual capitalization. Please use normal name capitalization`,
    );
  }

  return normalized;
}

function requireDigitsOnly(
  value: string,
  fieldName: string,
  minLength = 3,
  maxLength = 24,
) {
  const trimmed = value.trim();

  if (!new RegExp(`^[0-9]{${minLength},${maxLength}}$`).test(trimmed)) {
    throw new Error(`${fieldName} can only contain numbers`);
  }

  return trimmed;
}

function limitText(value: string, fieldName: string, maxLength: number) {
  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} is too long`);
  }

  return trimmed;
}

function requireReasonableStreetAddress(value: string) {
  const trimmed = value.trim();

  if (!/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,'’/#\p{Pd}]{1,99}$/u.test(trimmed)) {
    throw new Error(
      "Street and house number must be 2-100 characters and cannot include unsafe symbols",
    );
  }

  return trimmed;
}

function getOptionalAllowedLanguage(formData: FormData, name: string) {
  const value = getOptionalString(formData, name);

  if (!value) {
    return "";
  }

  return requireAllowed(value, languageOptions, name);
}

function validateLanguages(values: string[]) {
  const uniqueValues = Array.from(new Set(values.filter(Boolean)));

  for (const value of uniqueValues) {
    requireAllowed(value, languageOptions, "language");
  }

  return uniqueValues;
}

function parseDateOfBirth(formData: FormData) {
  const day = Number(getRequiredString(formData, "birth_day"));
  const month = Number(getRequiredString(formData, "birth_month"));
  const year = Number(getRequiredString(formData, "birth_year"));

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Invalid date of birth");
  }

  const now = new Date();
  const age =
    now.getUTCFullYear() -
    year -
    (now.getUTCMonth() + 1 < month ||
    (now.getUTCMonth() + 1 === month && now.getUTCDate() < day)
      ? 1
      : 0);

  if (age < 18) {
    throw new Error("You must be at least 18 years old");
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0",
  )}`;
}


function monthInputToDate(value: string, fieldName: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return `${value}-01`;
}

function requiredMonthInput(formData: FormData, fieldName: string) {
  return monthInputToDate(getRequiredString(formData, fieldName), fieldName);
}

function requiredMonthNumber(formData: FormData, fieldName: string) {
  const rawValue = getRequiredString(formData, fieldName);
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 1 || value > 24) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return value;
}

function requiredPositiveInteger(
  formData: FormData,
  fieldName: string,
  label: string,
  maxValue: number,
) {
  const rawValue = getRequiredString(formData, fieldName);
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 1 || value > maxValue) {
    throw new Error(`${label} must be between 1 and ${maxValue}`);
  }

  return value;
}

function requiredBooleanChoice(
  formData: FormData,
  fieldName: string,
  label: string,
) {
  const value = getRequiredString(formData, fieldName);

  if (value === "yes") return true;
  if (value === "no") return false;

  throw new Error(`Invalid value for ${label}`);
}

const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatMonthLabel(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);

  return `${monthLabels[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function formatStartWindow(from: string, to: string) {
  const start = formatMonthLabel(from);
  const end = formatMonthLabel(to);

  return `${start} - ${end}`;
}

function formatDurationWindow(min: number, max: number) {
  return `${min}-${max} months`;
}


function calculateAgeFromDate(dateValue: string) {
  const birthDate = new Date(`${dateValue}T00:00:00.000Z`);
  const today = new Date();

  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDifference = today.getUTCMonth() - birthDate.getUTCMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getUTCDate() < birthDate.getUTCDate())
  ) {
    age -= 1;
  }

  return age;
}

function isAuPairAgeEligible(dateValue: string) {
  const age = calculateAgeFromDate(dateValue);

  return age >= 18 && age <= 30;
}

export type OnboardingActionState = {
  error: string;
};

function getServerActionErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please check the form and try again.";
}

function isNextRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}

async function completeOnboardingUnsafe(
  formData: FormData,
  returnTo: string | null,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", user.id)
    .single();

  const wasAlreadyOnboarded = currentProfile?.onboarding_completed === true;

  const accountType = formData.get("account_type");

  if (accountType !== "family" && accountType !== "au_pair") {
    throw new Error("Invalid account type");
  }

  const firstName = requirePersonName(
    getRequiredString(formData, "first_name"),
    "First name",
  );
  const lastName = requirePersonName(
    getRequiredString(formData, "last_name"),
    "Last name",
  );

  const country = requireAllowed(
    getRequiredString(formData, "country"),
    countries,
    "country",
  );

  const city = requireLettersOnly(
    getRequiredString(formData, "city"),
    "City",
    1,
    100,
  );
  const streetAddress = requireReasonableStreetAddress(
    getRequiredString(formData, "street_address"),
  );

  const phoneCountryCode = requireAllowed(
    getRequiredString(formData, "phone_country_code"),
    phoneCountryCodeValues,
    "phone_country_code",
  );

  const phoneNumber = requireDigitsOnly(
    getRequiredString(formData, "phone_number"),
    "Phone number",
    5,
    15,
  );

  const rawAvailabilityStartFrom = requiredMonthInput(
    formData,
    "availability_start_from",
  );
  const rawAvailabilityStartTo = requiredMonthInput(
    formData,
    "availability_start_to",
  );
  const normalizedAvailabilityStart = normalizeStartMonthRange({
    from: rawAvailabilityStartFrom,
    to: rawAvailabilityStartTo,
  });
  const availabilityStartFrom = normalizedAvailabilityStart.startFrom
    ? `${normalizedAvailabilityStart.startFrom}-01`
    : rawAvailabilityStartFrom;
  const availabilityStartTo = normalizedAvailabilityStart.startTo
    ? `${normalizedAvailabilityStart.startTo}-01`
    : rawAvailabilityStartTo;

  if (availabilityStartTo < availabilityStartFrom) {
    throw new Error("Start date to cannot be before start date from");
  }

  const durationMinMonths = requiredMonthNumber(
    formData,
    "duration_min_months",
  );
  const durationMaxMonths = requiredMonthNumber(
    formData,
    "duration_max_months",
  );

  if (durationMaxMonths < durationMinMonths) {
    throw new Error("Duration max cannot be smaller than duration min");
  }

  const availabilityStart = formatStartWindow(
    availabilityStartFrom,
    availabilityStartTo,
  );
  const duration = formatDurationWindow(durationMinMonths, durationMaxMonths);

  const updateData =
    accountType === "au_pair"
      ? {
          first_name: firstName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`,
          date_of_birth: parseDateOfBirth(formData),
          gender: requireAllowed(
            getRequiredString(formData, "gender"),
            ["female", "male"],
            "gender",
          ),
          country,
          city,
          street_address: streetAddress,
          phone_country_code: phoneCountryCode,
          phone_number: phoneNumber,
          nationality: requireAllowed(
            getRequiredString(formData, "nationality"),
            nationalities,
            "nationality",
          ),
          preferred_host_countries: requireAllowedList(
            formData,
            "preferred_host_countries",
            countries,
            "Preferred host countries",
            6,
          ),
          religion: requireAllowed(
            getRequiredString(formData, "religion"),
            religionOptions,
            "religion",
          ),
          already_in_germany: requiredBooleanChoice(
            formData,
            "already_in_germany",
            "Already in Germany",
          ),
          has_drivers_license: requiredBooleanChoice(
            formData,
            "has_drivers_license",
            "Driver's license",
          ),
          has_childcare_experience: requiredBooleanChoice(
            formData,
            "has_childcare_experience",
            "Childcare experience",
          ),
          has_infant_experience: requiredBooleanChoice(
            formData,
            "has_infant_experience",
            "Infant experience",
          ),
          has_first_aid: requiredBooleanChoice(
            formData,
            "has_first_aid",
            "First aid",
          ),
          will_care_for_elderly: requiredBooleanChoice(
            formData,
            "will_care_for_elderly",
            "Elderly care",
          ),
          will_care_for_pets: requiredBooleanChoice(
            formData,
            "will_care_for_pets",
            "Pet care",
          ),
          availability_start: availabilityStart,
          availability_start_from: availabilityStartFrom,
          availability_start_to: availabilityStartTo,
          duration,
          duration_min_months: durationMinMonths,
          duration_max_months: durationMaxMonths,
          smoking_status: requireAllowed(
            getRequiredString(formData, "smoking_status"),
            smokingOptions.map((option) => option.value),
            "smoking_status",
          ),
          mother_tongue: requireAllowed(
            getRequiredString(formData, "mother_tongue"),
            languageOptions,
            "mother_tongue",
          ),
          fluent_languages: validateLanguages([
            getOptionalAllowedLanguage(formData, "fluent_language"),
          ]),
          basic_languages: validateLanguages([
            getOptionalAllowedLanguage(formData, "basic_language"),
          ]),
          languages: validateLanguages([
            getRequiredString(formData, "mother_tongue"),
            getOptionalAllowedLanguage(formData, "fluent_language"),
            getOptionalAllowedLanguage(formData, "basic_language"),
          ]),
          childcare_experience: "",
          bio: limitText(getRequiredString(formData, "bio"), "Introduction", 1350),
          onboarding_completed: true,
        }
      : {
          first_name: firstName,
          last_name: lastName,
          full_name: formatGeneratedFamilyDisplayName(lastName, DEFAULT_LANGUAGE),
          country,
          city,
          street_address: streetAddress,
          phone_country_code: phoneCountryCode,
          phone_number: phoneNumber,
          religion: requireAllowed(
            getRequiredString(formData, "religion"),
            religionOptions,
            "religion",
          ),
          preferred_host_countries: [],
          already_in_germany: false,
          has_drivers_license: false,
          has_childcare_experience: false,
          has_infant_experience: false,
          has_first_aid: false,
          will_care_for_elderly: false,
          will_care_for_pets: false,
          children_info: requireAllowed(
            getRequiredString(formData, "children_info"),
            childrenOptions,
            "children_info",
          ),
          au_pair_allowance_amount: requiredPositiveInteger(
            formData,
            "au_pair_allowance_amount",
            "Au pair allowance",
            20000,
          ),
          au_pair_allowance_currency: requireAllowed(
            getRequiredString(formData, "au_pair_allowance_currency"),
            allowanceCurrencyOptions,
            "au_pair_allowance_currency",
          ),
          availability_start: availabilityStart,
          availability_start_from: availabilityStartFrom,
          availability_start_to: availabilityStartTo,
          duration,
          duration_min_months: durationMinMonths,
          duration_max_months: durationMaxMonths,
          smoking_status: null,
          accommodation_info: limitText(
            getOptionalString(formData, "accommodation_info"),
            "Accommodation",
            1200,
          ),
          expectations: limitText(
            getOptionalString(formData, "expectations"),
            "Expectations",
            1400,
          ),
          bio: limitText(getOptionalString(formData, "bio"), "Family introduction", 1400),
          onboarding_completed: true,
        };


  const updateDateOfBirth =
    "date_of_birth" in updateData ? updateData.date_of_birth : undefined;

  if (
    accountType === "au_pair" &&
    (typeof updateDateOfBirth !== "string" ||
      !isAuPairAgeEligible(updateDateOfBirth))
  ) {
    await supabase.from("profile_photos").delete().eq("profile_id", user.id);
    await supabase.from("profiles").delete().eq("id", user.id);

    await supabase.auth.signOut();

    redirect("/onboarding/ineligible");
  }

  const profileWriter = wasAlreadyOnboarded
    ? supabase
    : createAdminClient();
  const { error } = await profileWriter
    .from("profiles")
    .update(updateData)
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  if (!wasAlreadyOnboarded) {
    redirect(withAuthReturnTo("/profile/photos", returnTo));
  }

  const { count: photoCount, error: photoCountError } = await supabase
    .from("profile_photos")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id);

  if (photoCountError) {
    throw new Error(photoCountError.message);
  }

  if ((photoCount ?? 0) < 1) {
    redirect(withAuthReturnTo("/profile/photos", returnTo));
  }

  redirect(authHomeHref(returnTo));
}

export async function completeOnboarding(
  returnTo: string | null,
  _previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  try {
    await completeOnboardingUnsafe(formData, returnTo);

    return { error: "" };
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    return {
      error: getServerActionErrorMessage(error),
    };
  }
}
