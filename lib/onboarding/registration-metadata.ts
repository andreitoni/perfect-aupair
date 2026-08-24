import "server-only";

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
import {
  DEFAULT_LANGUAGE,
  formatGeneratedFamilyDisplayName,
} from "@/lib/i18n/translations";
import { normalizeStartMonthRange } from "@/lib/month-options";
import {
  hasSuspiciousPersonNameCasing,
  normalizePersonName,
} from "@/lib/profile-name";

type AccountType = "family" | "au_pair";
type MetadataRecord = Record<string, unknown>;

export type RegistrationOnboardingProfile = {
  accountType: AccountType;
  updateData: Record<string, unknown>;
};

function isRecord(value: unknown): value is MetadataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(data: MetadataRecord, name: string) {
  const value = data[name];
  const rawValue = Array.isArray(value) ? value[0] : value;

  return typeof rawValue === "string" ? rawValue.trim() : "";
}

function readStringList(data: MetadataRecord, name: string) {
  const value = data[name];
  const values = Array.isArray(value) ? value : value ? [value] : [];

  return values
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getRequiredString(data: MetadataRecord, name: string) {
  const value = readString(data, name);

  if (!value) {
    throw new Error(`Missing required field: ${name}`);
  }

  return value;
}

function getOptionalString(data: MetadataRecord, name: string) {
  return readString(data, name);
}

function requireAllowed(value: string, allowed: string[], fieldName: string) {
  if (!allowed.includes(value)) {
    throw new Error(`Invalid value for ${fieldName}`);
  }

  return value;
}

function requireAllowedList(
  data: MetadataRecord,
  name: string,
  allowed: string[],
  label: string,
  maxItems: number,
) {
  const uniqueValues = Array.from(new Set(readStringList(data, name)));

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

function getOptionalAllowedLanguage(data: MetadataRecord, name: string) {
  const value = getOptionalString(data, name);

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

function parseDateOfBirth(data: MetadataRecord) {
  const day = Number(getRequiredString(data, "birth_day"));
  const month = Number(getRequiredString(data, "birth_month"));
  const year = Number(getRequiredString(data, "birth_year"));

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

  if (age < 18 || age > 30) {
    throw new Error("This au pair account is not eligible");
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

function requiredMonthInput(data: MetadataRecord, fieldName: string) {
  return monthInputToDate(getRequiredString(data, fieldName), fieldName);
}

function requiredMonthNumber(data: MetadataRecord, fieldName: string) {
  const rawValue = getRequiredString(data, fieldName);
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 1 || value > 24) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return value;
}

function requiredPositiveInteger(
  data: MetadataRecord,
  fieldName: string,
  label: string,
  maxValue: number,
) {
  const rawValue = getRequiredString(data, fieldName);
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 1 || value > maxValue) {
    throw new Error(`${label} must be between 1 and ${maxValue}`);
  }

  return value;
}

function requiredBooleanChoice(
  data: MetadataRecord,
  fieldName: string,
  label: string,
) {
  const value = getRequiredString(data, fieldName);

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

export function buildRegistrationOnboardingProfile(
  metadata: unknown,
): RegistrationOnboardingProfile | null {
  if (!isRecord(metadata)) {
    return null;
  }

  const accountType = getRequiredString(metadata, "account_type");

  if (accountType !== "family" && accountType !== "au_pair") {
    throw new Error("Invalid account type");
  }

  const firstName = requirePersonName(
    getRequiredString(metadata, "first_name"),
    "First name",
  );
  const lastName = requirePersonName(
    getRequiredString(metadata, "last_name"),
    "Last name",
  );
  const country = requireAllowed(
    getRequiredString(metadata, "country"),
    countries,
    "country",
  );
  const city = requireLettersOnly(
    getRequiredString(metadata, "city"),
    "City",
    1,
    100,
  );
  const streetAddress = requireReasonableStreetAddress(
    getRequiredString(metadata, "street_address"),
  );
  const phoneCountryCode = requireAllowed(
    getRequiredString(metadata, "phone_country_code"),
    phoneCountryCodeValues,
    "phone_country_code",
  );
  const phoneNumber = requireDigitsOnly(
    getRequiredString(metadata, "phone_number"),
    "Phone number",
    5,
    15,
  );
  const rawAvailabilityStartFrom = requiredMonthInput(
    metadata,
    "availability_start_from",
  );
  const rawAvailabilityStartTo = requiredMonthInput(
    metadata,
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

  const durationMinMonths = requiredMonthNumber(metadata, "duration_min_months");
  const durationMaxMonths = requiredMonthNumber(metadata, "duration_max_months");

  if (durationMaxMonths < durationMinMonths) {
    throw new Error("Duration max cannot be smaller than duration min");
  }

  const availabilityStart = formatStartWindow(
    availabilityStartFrom,
    availabilityStartTo,
  );
  const duration = formatDurationWindow(durationMinMonths, durationMaxMonths);

  const sharedData = {
    account_type: accountType,
    first_name: firstName,
    last_name: lastName,
    country,
    city,
    street_address: streetAddress,
    phone_country_code: phoneCountryCode,
    phone_number: phoneNumber,
    availability_start: availabilityStart,
    availability_start_from: availabilityStartFrom,
    availability_start_to: availabilityStartTo,
    duration,
    duration_min_months: durationMinMonths,
    duration_max_months: durationMaxMonths,
    onboarding_completed: true,
  };

  if (accountType === "au_pair") {
    const motherTongue = requireAllowed(
      getRequiredString(metadata, "mother_tongue"),
      languageOptions,
      "mother_tongue",
    );
    const fluentLanguage = getOptionalAllowedLanguage(metadata, "fluent_language");
    const basicLanguage = getOptionalAllowedLanguage(metadata, "basic_language");

    return {
      accountType,
      updateData: {
        ...sharedData,
        full_name: `${firstName} ${lastName}`,
        date_of_birth: parseDateOfBirth(metadata),
        gender: requireAllowed(
          getRequiredString(metadata, "gender"),
          ["female", "male"],
          "gender",
        ),
        nationality: requireAllowed(
          getRequiredString(metadata, "nationality"),
          nationalities,
          "nationality",
        ),
        preferred_host_countries: requireAllowedList(
          metadata,
          "preferred_host_countries",
          countries,
          "Preferred host countries",
          6,
        ),
        religion: requireAllowed(
          getRequiredString(metadata, "religion"),
          religionOptions,
          "religion",
        ),
        already_in_germany: requiredBooleanChoice(
          metadata,
          "already_in_germany",
          "Already in Germany",
        ),
        has_drivers_license: requiredBooleanChoice(
          metadata,
          "has_drivers_license",
          "Driver's license",
        ),
        has_childcare_experience: requiredBooleanChoice(
          metadata,
          "has_childcare_experience",
          "Childcare experience",
        ),
        has_infant_experience: requiredBooleanChoice(
          metadata,
          "has_infant_experience",
          "Infant experience",
        ),
        has_first_aid: requiredBooleanChoice(
          metadata,
          "has_first_aid",
          "First aid",
        ),
        will_care_for_elderly: requiredBooleanChoice(
          metadata,
          "will_care_for_elderly",
          "Elderly care",
        ),
        will_care_for_pets: requiredBooleanChoice(
          metadata,
          "will_care_for_pets",
          "Pet care",
        ),
        smoking_status: requireAllowed(
          getRequiredString(metadata, "smoking_status"),
          smokingOptions.map((option) => option.value),
          "smoking_status",
        ),
        mother_tongue: motherTongue,
        fluent_languages: validateLanguages([fluentLanguage]),
        basic_languages: validateLanguages([basicLanguage]),
        languages: validateLanguages([
          motherTongue,
          fluentLanguage,
          basicLanguage,
        ]),
        childcare_experience: "",
        bio: limitText(getRequiredString(metadata, "bio"), "Introduction", 1350),
      },
    };
  }

  return {
    accountType,
    updateData: {
      ...sharedData,
      full_name: formatGeneratedFamilyDisplayName(lastName, DEFAULT_LANGUAGE),
      religion: requireAllowed(
        getRequiredString(metadata, "religion"),
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
        getRequiredString(metadata, "children_info"),
        childrenOptions,
        "children_info",
      ),
      au_pair_allowance_amount: requiredPositiveInteger(
        metadata,
        "au_pair_allowance_amount",
        "Au pair allowance",
        20000,
      ),
      au_pair_allowance_currency: requireAllowed(
        getRequiredString(metadata, "au_pair_allowance_currency"),
        allowanceCurrencyOptions,
        "au_pair_allowance_currency",
      ),
      smoking_status: null,
      accommodation_info: limitText(
        getOptionalString(metadata, "accommodation_info"),
        "Accommodation",
        1200,
      ),
      expectations: limitText(
        getOptionalString(metadata, "expectations"),
        "Expectations",
        1400,
      ),
      bio: limitText(
        getOptionalString(metadata, "bio"),
        "Family introduction",
        1400,
      ),
    },
  };
}
