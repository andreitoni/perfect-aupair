"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  PROFILE_PHOTOS_BUCKET,
  removeProfilePhotoFiles,
  removeProfileVideoFiles,
  removeStoryPhotoFiles,
} from "@/lib/images/storage";
import { isAdminEmail, requireAdminUser } from "@/lib/admin/access";
import { logAdminAction } from "@/lib/admin/audit-log";
import {
  ANALYTICS_FEATURE_FLAGS_CACHE_TAG,
  FEATURE_FLAG_DESCRIPTIONS,
  FEATURE_FLAGS,
  type FeatureFlagKey,
} from "@/lib/feature-flags";
import {
  getVerificationApprovedDedupeKey,
  getVerificationRejectedDedupeKey,
  VERIFICATION_APPROVED_NOTIFICATION,
  VERIFICATION_REJECTED_NOTIFICATION,
  VERIFICATION_SELFIE_REJECTED_REASON,
} from "@/lib/messages/system-notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeAuthEmail } from "@/lib/moderation/auth-block";
import {
  getModerationRule,
  getSuspensionDuration,
  PERMANENT_BAN_MESSAGE,
  SUSPENSION_DURATIONS,
} from "@/lib/moderation/rules";
import { deleteClaimedScheduledAccount } from "@/lib/privacy/cleanup-scheduled-account-deletions";
import {
  REPORT_ACTION_TAKEN_BODY,
  REPORT_ACTION_TAKEN_TITLE,
  REPORTING_GUIDANCE,
  sendReportActionTakenEmail,
} from "@/lib/email/report-action-taken";
import {
  allowanceCurrencyOptions,
  childrenOptions,
  countries,
  languageOptions,
  phoneCountryCodeValues,
  religionOptions,
  smokingOptions,
} from "@/lib/profile-options";
import {
  hasSuspiciousPersonNameCasing,
  normalizePersonName,
} from "@/lib/profile-name";
import { safeAdminReturnTo } from "@/lib/admin/navigation";

type StoragePathRow = {
  storage_path?: string | null;
  image_path?: string | null;
  video_path?: string | null;
  audio_path?: string | null;
};

export type AdminProfileActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type AdminPhotoUploadResult = {
  status: "success" | "error";
  message: string;
};

type AdminEditableCurrentProfile = Record<string, unknown> & {
  account_type: "family" | "au_pair";
  basic_languages: string[];
  birth_date: string | null;
  children_info: string | null;
  country: string | null;
  date_of_birth: string | null;
  fluent_languages: string[];
  gender: string | null;
  languages: string[];
  mother_tongue: string | null;
  nationality: string | null;
  onboarding_completed: boolean;
  phone_country_code: string | null;
  preferred_host_countries: string[];
  public_slug: string | null;
  religion: string | null;
  smoking_status: string | null;
  au_pair_allowance_currency: string;
};

function adminFieldValuesEqual(current: unknown, next: unknown) {
  if (Array.isArray(current) && Array.isArray(next)) {
    return (
      current.length === next.length &&
      current.every((value, index) => value === next[index])
    );
  }

  return Object.is(current, next);
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function requireValue(formData: FormData, key: string) {
  const value = stringValue(formData, key);

  if (!value) {
    throw new Error(`Missing ${key}`);
  }

  return value;
}

function booleanValue(formData: FormData, key: string) {
  const value = stringValue(formData, key).toLowerCase();

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new Error(`Invalid ${key}`);
}

function nullableStringValue(formData: FormData, key: string) {
  const value = stringValue(formData, key)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return value || null;
}

function nullableMultilineValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();

  return value || null;
}

function requireAllowedAdminValue(
  value: string | null,
  allowed: readonly string[],
  label: string,
  currentValue?: string | null,
) {
  if (
    value !== null &&
    !allowed.includes(value) &&
    value !== currentValue
  ) {
    throw new Error(`Invalid ${label}.`);
  }

  return value;
}

function parseAdminList(
  formData: FormData,
  key: string,
  allowed: readonly string[],
  label: string,
  maxItems: number,
  currentValues: readonly string[] = [],
) {
  const rawValue = stringValue(formData, key);
  const values = Array.from(
    new Set(
      rawValue
        .split(/[,\n]/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  if (values.length > maxItems) {
    throw new Error(`${label} can include at most ${maxItems} values.`);
  }

  if (adminFieldValuesEqual(currentValues, values)) {
    return values;
  }

  for (const value of values) {
    if (!allowed.includes(value)) {
      throw new Error(`Unknown ${label.toLowerCase()}: ${value}.`);
    }
  }

  return values;
}

function validateAdminPersonName(value: string | null, label: string) {
  if (value === null) return null;

  const normalized = normalizePersonName(value);

  if (
    normalized.length < 1 ||
    normalized.length > 50 ||
    !/^[\p{L}\p{M}][\p{L}\p{M} .,'’\p{Pd}]*$/u.test(normalized) ||
    hasSuspiciousPersonNameCasing(normalized)
  ) {
    throw new Error(`Invalid ${label.toLowerCase()}.`);
  }

  return normalized;
}

function validateAdminDisplayName(value: string | null) {
  if (value === null) return null;

  if (
    value.length > 120 ||
    /[\p{N}\p{Cc}\p{Cf}]/u.test(value) ||
    !/^[\p{L}\p{M}][\p{L}\p{M} .,'’&()\p{Pd}]*$/u.test(value)
  ) {
    throw new Error("Invalid public display name.");
  }

  return value;
}

function validateAdminCity(value: string | null) {
  if (value === null) return null;

  if (
    value.length > 100 ||
    !/^[\p{L}\p{M}][\p{L}\p{M} .,'’()\p{Pd}]*$/u.test(value)
  ) {
    throw new Error("Invalid city.");
  }

  return value;
}

function validateAdminText(
  value: string | null,
  label: string,
  maxLength: number,
) {
  if (value !== null && value.length > maxLength) {
    throw new Error(`${label} is too long.`);
  }

  return value;
}

function parseAdminBoolean(formData: FormData, key: string) {
  const value = stringValue(formData, key);

  if (value === "yes") return true;
  if (value === "no" || value === "") return false;

  throw new Error(`Invalid ${key}.`);
}

function parseAdminBirthDate(value: string | null) {
  if (value === null) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid date of birth.");
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Invalid date of birth.");
  }

  return value;
}

function ageFromDate(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  const today = new Date();
  let age = today.getUTCFullYear() - date.getUTCFullYear();

  if (
    today.getUTCMonth() < date.getUTCMonth() ||
    (today.getUTCMonth() === date.getUTCMonth() &&
      today.getUTCDate() < date.getUTCDate())
  ) {
    age -= 1;
  }

  return age;
}

function adminProfileActionError(error: unknown): AdminProfileActionState {
  return {
    status: "error",
    message:
      error instanceof Error
        ? error.message
        : "Could not save the profile. Please try again.",
  };
}

async function hasSupportedImageSignature(file: File) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isJpeg =
    header.length >= 3 &&
    header[0] === 0xff &&
    header[1] === 0xd8 &&
    header[2] === 0xff;
  const isPng =
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a;
  const isWebp =
    header.length >= 12 &&
    String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...header.slice(8, 12)) === "WEBP";

  if (file.type === "image/jpeg") return isJpeg;
  if (file.type === "image/png") return isPng;
  if (file.type === "image/webp") return isWebp;

  return false;
}

function requireFeatureFlagKey(value: string): FeatureFlagKey {
  if (Object.prototype.hasOwnProperty.call(FEATURE_FLAGS, value)) {
    return value as FeatureFlagKey;
  }

  throw new Error("Unknown feature flag.");
}

async function requireModeratableProfile(
  supabase: ReturnType<typeof createAdminClient>,
  profileId: string,
) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, email, is_admin")
    .eq("id", profileId)
    .maybeSingle<{
      id: string;
      email: string | null;
      is_admin: boolean | null;
    }>();

  if (error) {
    throw new Error(error.message);
  }

  if (!profile) {
    throw new Error("Profile not found.");
  }

  // Moderation only needs the durable app-level admin markers. Calling the
  // Auth admin API here makes otherwise database-only moderation actions fail
  // when Auth has a transient JWT verification problem.
  if (profile.is_admin || isAdminEmail(profile.email)) {
    throw new Error("Admin profiles cannot be moderated from this dashboard.");
  }

  return profile;
}

export async function updateAdminProfileDetails(
  _previousState: AdminProfileActionState,
  formData: FormData,
): Promise<AdminProfileActionState> {
  const adminUser = await requireAdminUser();

  try {
    const supabase = createAdminClient();
    const profileId = requireValue(formData, "profile_id");
    const expectedVersion = requireValue(formData, "expected_version");

    if (!/^[0-9a-f]{64}$/.test(expectedVersion)) {
      throw new Error("This edit form is stale. Refresh the member and try again.");
    }

    await requireModeratableProfile(supabase, profileId);

    const { data: currentProfile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "account_type, full_name, first_name, last_name, date_of_birth, birth_date, gender, phone_country_code, phone_number, street_address, city, country, nationality, preferred_host_countries, religion, smoking_status, already_in_germany, has_drivers_license, has_childcare_experience, has_infant_experience, has_first_aid, will_care_for_elderly, will_care_for_pets, mother_tongue, fluent_languages, basic_languages, languages, bio, childcare_experience, children_info, au_pair_allowance_amount, au_pair_allowance_currency, accommodation_info, expectations, onboarding_completed, public_slug",
      )
      .eq("id", profileId)
      .maybeSingle<AdminEditableCurrentProfile>();

    if (profileError) {
      throw new Error(profileError.message);
    }

    if (!currentProfile) {
      throw new Error("Profile not found.");
    }

    const fullName = validateAdminDisplayName(
      nullableStringValue(formData, "full_name"),
    );
    const firstName = validateAdminPersonName(
      nullableStringValue(formData, "first_name"),
      "First name",
    );
    const lastName = validateAdminPersonName(
      nullableStringValue(formData, "last_name"),
      "Last name",
    );
    const country = requireAllowedAdminValue(
      nullableStringValue(formData, "country"),
      countries,
      "country",
      currentProfile.country,
    );
    const city = validateAdminCity(nullableStringValue(formData, "city"));
    const streetAddress = validateAdminText(
      nullableStringValue(formData, "street_address"),
      "Street address",
      100,
    );
    const phoneCountryCode = requireAllowedAdminValue(
      nullableStringValue(formData, "phone_country_code"),
      phoneCountryCodeValues,
      "phone country code",
      currentProfile.phone_country_code,
    );
    const phoneNumber = nullableStringValue(formData, "phone_number");
    const religion = requireAllowedAdminValue(
      nullableStringValue(formData, "religion"),
      religionOptions,
      "religion",
      currentProfile.religion,
    );
    const bio = validateAdminText(
      nullableMultilineValue(formData, "bio"),
      "Profile introduction",
      1400,
    );

    if (phoneNumber && !/^\d{5,15}$/.test(phoneNumber)) {
      throw new Error("Phone number must contain 5 to 15 digits.");
    }

    if (Boolean(phoneCountryCode) !== Boolean(phoneNumber)) {
      throw new Error("Enter both the phone country code and phone number.");
    }

    if (
      streetAddress &&
      !/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,'’/#\p{Pd}]{1,99}$/u.test(
        streetAddress,
      )
    ) {
      throw new Error("Invalid street address.");
    }

    if (currentProfile.onboarding_completed && (!fullName || !country || !city)) {
      throw new Error(
        "Completed profiles must keep a public name, country and city.",
      );
    }

    const updates: Record<string, unknown> = {
      bio,
      city,
      country,
      first_name: firstName,
      full_name: fullName,
      last_name: lastName,
      phone_country_code: phoneCountryCode,
      phone_number: phoneNumber,
      religion,
      street_address: streetAddress,
    };

    if (currentProfile.account_type === "au_pair") {
      const dateOfBirth = parseAdminBirthDate(
        nullableStringValue(formData, "date_of_birth"),
      );
      const currentDateOfBirth =
        currentProfile.birth_date ?? currentProfile.date_of_birth;
      const gender = requireAllowedAdminValue(
        nullableStringValue(formData, "gender"),
        ["female", "male"],
        "gender",
        currentProfile.gender,
      );
      const nationality = requireAllowedAdminValue(
        nullableStringValue(formData, "nationality"),
        countries,
        "nationality",
        currentProfile.nationality,
      );
      const preferredHostCountries = parseAdminList(
        formData,
        "preferred_host_countries",
        countries,
        "Preferred host countries",
        6,
        currentProfile.preferred_host_countries,
      );
      const motherTongue = requireAllowedAdminValue(
        nullableStringValue(formData, "mother_tongue"),
        languageOptions,
        "mother tongue",
        currentProfile.mother_tongue,
      );
      const fluentLanguages = parseAdminList(
        formData,
        "fluent_languages",
        languageOptions,
        "Fluent languages",
        12,
        currentProfile.fluent_languages,
      );
      const basicLanguages = parseAdminList(
        formData,
        "basic_languages",
        languageOptions,
        "Basic languages",
        12,
        currentProfile.basic_languages,
      );
      const smokingStatus = requireAllowedAdminValue(
        nullableStringValue(formData, "smoking_status"),
        smokingOptions.map((option) => option.value),
        "smoking status",
        currentProfile.smoking_status,
      );
      const childcareExperience = validateAdminText(
        nullableMultilineValue(formData, "childcare_experience"),
        "Childcare experience",
        1400,
      );

      if (currentProfile.onboarding_completed) {
        if (!dateOfBirth || !gender || !nationality || !motherTongue) {
          throw new Error(
            "Completed au pair profiles must keep date of birth, gender, nationality and mother tongue.",
          );
        }

        if (dateOfBirth !== currentDateOfBirth) {
          const age = ageFromDate(dateOfBirth);

          if (age < 18 || age > 30) {
            throw new Error("Au pairs must be between 18 and 30 years old.");
          }
        }

        if (preferredHostCountries.length === 0) {
          throw new Error(
            "Completed au pair profiles need at least one preferred host country.",
          );
        }
      }

      const languages = Array.from(
        new Set(
          [motherTongue, ...fluentLanguages, ...basicLanguages].filter(
            (value): value is string => Boolean(value),
          ),
        ),
      );

      if (languages.length > 12) {
        throw new Error(
          "Mother tongue, fluent languages and basic languages may contain at most 12 distinct languages in total.",
        );
      }

      Object.assign(updates, {
        already_in_germany: parseAdminBoolean(
          formData,
          "already_in_germany",
        ),
        basic_languages: basicLanguages,
        childcare_experience: childcareExperience,
        fluent_languages: fluentLanguages,
        gender,
        has_childcare_experience: parseAdminBoolean(
          formData,
          "has_childcare_experience",
        ),
        has_drivers_license: parseAdminBoolean(
          formData,
          "has_drivers_license",
        ),
        has_first_aid: parseAdminBoolean(formData, "has_first_aid"),
        has_infant_experience: parseAdminBoolean(
          formData,
          "has_infant_experience",
        ),
        languages,
        mother_tongue: motherTongue,
        nationality,
        preferred_host_countries: preferredHostCountries,
        smoking_status: smokingStatus,
        will_care_for_elderly: parseAdminBoolean(
          formData,
          "will_care_for_elderly",
        ),
        will_care_for_pets: parseAdminBoolean(
          formData,
          "will_care_for_pets",
        ),
      });

      if (dateOfBirth !== currentDateOfBirth) {
        updates.date_of_birth = dateOfBirth;
      }
    } else {
      const childrenInfo = requireAllowedAdminValue(
        nullableStringValue(formData, "children_info"),
        childrenOptions,
        "children information",
        currentProfile.children_info,
      );
      const allowanceCurrency = requireAllowedAdminValue(
        nullableStringValue(formData, "au_pair_allowance_currency") ?? "EUR",
        allowanceCurrencyOptions,
        "allowance currency",
        currentProfile.au_pair_allowance_currency,
      );
      const allowanceRaw = nullableStringValue(
        formData,
        "au_pair_allowance_amount",
      );
      const allowanceAmount = allowanceRaw ? Number(allowanceRaw) : null;

      if (
        allowanceAmount !== null &&
        (!Number.isInteger(allowanceAmount) ||
          allowanceAmount < 1 ||
          allowanceAmount > 20_000)
      ) {
        throw new Error("Allowance must be between 1 and 20,000.");
      }

      if (
        currentProfile.onboarding_completed &&
        (!childrenInfo || allowanceAmount === null)
      ) {
        throw new Error(
          "Completed family profiles must keep children information and an allowance.",
        );
      }

      Object.assign(updates, {
        accommodation_info: validateAdminText(
          nullableMultilineValue(formData, "accommodation_info"),
          "Accommodation description",
          1200,
        ),
        au_pair_allowance_amount: allowanceAmount,
        au_pair_allowance_currency: allowanceCurrency,
        children_info: childrenInfo,
        expectations: validateAdminText(
          nullableMultilineValue(formData, "expectations"),
          "Expectations",
          1400,
        ),
      });
    }

    for (const [key, value] of Object.entries(updates)) {
      if (
        Object.prototype.hasOwnProperty.call(currentProfile, key) &&
        adminFieldValuesEqual(currentProfile[key], value)
      ) {
        delete updates[key];
      }
    }

    const { data, error } = await supabase.rpc("admin_update_profile_details", {
      p_admin_profile_id: adminUser.id,
      p_expected_version: expectedVersion,
      p_profile_id: profileId,
      p_updates: updates,
    });

    if (error) {
      throw new Error(error.message);
    }

    const result = data as {
      applied?: boolean;
      reason?: "stale" | "unchanged" | "updated";
      public_slug?: string | null;
    } | null;

    if (!result?.applied) {
      throw new Error(
        result?.reason === "stale"
          ? "This profile changed while you were editing it. Refresh and review the latest values before saving."
          : "The profile could not be updated.",
      );
    }

    revalidatePath("/admin");
    revalidatePath(`/admin/profiles/${profileId}`);
    revalidatePath("/");
    revalidatePath("/search-aupair");
    revalidatePath("/search-family");
    revalidatePath(`/profile/${profileId}`);

    const publicSlug = result.public_slug ?? currentProfile.public_slug;

    if (publicSlug) {
      revalidatePath(`/profile/${publicSlug}`);
    }

    return {
      status: "success",
      message:
        result.reason === "unchanged"
          ? "No profile values changed. Nothing was added to the audit log."
          : "Profile changes saved and added to the admin audit log.",
    };
  } catch (error) {
    return adminProfileActionError(error);
  }
}

export async function setAdminPrimaryProfilePhoto(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createAdminClient();
  const photoId = requireValue(formData, "photo_id");
  const { data: photo, error: photoError } = await supabase
    .from("profile_photos")
    .select("profile_id")
    .eq("id", photoId)
    .maybeSingle<{ profile_id: string }>();

  if (photoError) throw new Error(photoError.message);
  if (!photo) throw new Error("Profile photo not found.");

  await requireModeratableProfile(supabase, photo.profile_id);

  const { data, error } = await supabase.rpc(
    "admin_set_primary_profile_photo",
    {
      p_admin_profile_id: adminUser.id,
      p_photo_id: photoId,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  const result = data as {
    applied?: boolean;
    profile_id?: string;
    public_slug?: string | null;
  } | null;

  if (!result?.profile_id) {
    throw new Error("Profile photo not found.");
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/profiles/${result.profile_id}`);
  revalidatePath("/");
  revalidatePath("/search-aupair");
  revalidatePath("/search-family");
  revalidatePath(`/profile/${result.profile_id}`);

  if (result.public_slug) {
    revalidatePath(`/profile/${result.public_slug}`);
  }
}

export async function uploadAdminProfilePhoto(
  formData: FormData,
): Promise<AdminPhotoUploadResult> {
  const adminUser = await requireAdminUser();

  try {
    const profileId = requireValue(formData, "profile_id");
    const fileValue = formData.get("photo");

    if (!(fileValue instanceof File) || fileValue.size < 1) {
      throw new Error("Choose a JPG, PNG or WebP image.");
    }

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(fileValue.type) ||
      !(await hasSupportedImageSignature(fileValue))
    ) {
      throw new Error("The selected file is not a valid JPG, PNG or WebP image.");
    }

    if (fileValue.size > 768 * 1024) {
      throw new Error("The compressed profile photo must be 768 KB or smaller.");
    }

    const supabase = createAdminClient();
    const targetProfile = await requireModeratableProfile(supabase, profileId);
    const extension =
      fileValue.type === "image/png"
        ? "png"
        : fileValue.type === "image/webp"
          ? "webp"
          : "jpg";
    const storagePath = `${profileId}/${crypto.randomUUID()}.${extension}`;
    const { data: reserved, error: reservationError } = await supabase.rpc(
      "admin_reserve_profile_photo_upload",
      {
        p_admin_profile_id: adminUser.id,
        p_object_name: storagePath,
        p_profile_id: profileId,
        p_size_bytes: fileValue.size,
      },
    );

    if (reservationError) {
      throw new Error(reservationError.message);
    }

    if (reserved !== true) {
      throw new Error(
        "Uploads are disabled, this account is pending deletion, or its upload quota is full.",
      );
    }

    const { error: uploadError } = await supabase.storage
      .from(PROFILE_PHOTOS_BUCKET)
      .upload(storagePath, fileValue, {
        cacheControl: "3600",
        contentType: fileValue.type,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: attached, error: attachError } = await supabase.rpc(
      "admin_attach_profile_photo",
      {
        p_admin_profile_id: adminUser.id,
        p_object_name: storagePath,
        p_profile_id: profileId,
      },
    );

    if (attachError || !attached) {
      // The RPC may have committed even if its network response was lost.
      // Leave an ambiguous upload for the reference-aware orphan cleanup
      // instead of risking deletion of a newly attached live photo.
      throw new Error(
        attachError?.message ?? "Could not attach the uploaded profile photo.",
      );
    }

    const result = attached as {
      profile_id?: string;
      public_slug?: string | null;
      replaced_storage_path?: string | null;
    };

    if (result.profile_id !== profileId) {
      throw new Error("The uploaded photo was attached to an unexpected profile.");
    }

    if (result.replaced_storage_path) {
      const { error: replacedStorageError } = await removeProfilePhotoFiles(
        supabase,
        result.replaced_storage_path,
      );

      if (replacedStorageError) {
        console.warn(
          "Could not remove replaced admin profile photo",
          replacedStorageError.message,
        );
      }
    }

    revalidatePath("/admin");
    revalidatePath(`/admin/profiles/${profileId}`);
    revalidatePath("/");
    revalidatePath("/search-aupair");
    revalidatePath("/search-family");
    revalidatePath(`/profile/${profileId}`);

    if (result.public_slug) {
      revalidatePath(`/profile/${result.public_slug}`);
    } else if (targetProfile.id) {
      revalidatePath(`/profile/${targetProfile.id}`);
    }

    return {
      status: "success",
      message: "New main profile photo uploaded and recorded in the audit log.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Could not upload the profile photo.",
    };
  }
}

export async function updateFeatureFlag(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createAdminClient();
  const key = requireFeatureFlagKey(requireValue(formData, "key"));
  const enabled = booleanValue(formData, "enabled");

  const { data: existingFlag, error: existingFlagError } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("key", key)
    .maybeSingle<{ enabled: boolean }>();

  if (existingFlagError) {
    throw new Error(existingFlagError.message);
  }

  const { error } = await supabase.from("feature_flags").upsert(
    {
      key,
      enabled,
      description: FEATURE_FLAG_DESCRIPTIONS[key],
      updated_at: new Date().toISOString(),
      updated_by: adminUser.id,
    },
    { onConflict: "key" },
  );

  if (error) {
    throw new Error(error.message);
  }

  await logAdminAction(supabase, {
    adminProfileId: adminUser.id,
    action: "update_feature_flag",
    targetResourceType: "feature_flag",
    targetResourceId: key,
    metadata: {
      enabled,
      previousEnabled: existingFlag?.enabled ?? FEATURE_FLAGS[key],
    },
  });

  if (key === "clarity" || key === "hotjar") {
    updateTag(ANALYTICS_FEATURE_FLAGS_CACHE_TAG);
  }
  revalidatePath("/admin");
}

export async function suspendProfile(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createAdminClient();
  const profileId = requireValue(formData, "profile_id");
  const duration =
    getSuspensionDuration(stringValue(formData, "duration_days")) ??
    SUSPENSION_DURATIONS[2];
  const rule = getModerationRule(stringValue(formData, "rule"));
  const extraReason = stringValue(formData, "reason");

  if (!rule) {
    throw new Error("Please choose a suspension reason.");
  }

  await requireModeratableProfile(supabase, profileId);

  const suspendedUntil = new Date(
    Date.now() + duration.days * 24 * 60 * 60 * 1000,
  ).toISOString();
  const reason = extraReason ? `${rule.label}: ${extraReason}` : rule.label;

  const { error: authError } = await supabase.auth.admin.updateUserById(
    profileId,
    { ban_duration: `${duration.days * 24}h` },
  );

  if (authError) {
    throw new Error(authError.message);
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      suspended_at: new Date().toISOString(),
      suspended_until: suspendedUntil,
      suspension_rule: rule.id,
      suspended_reason: reason,
      suspended_by: adminUser.id,
    })
    .eq("id", profileId);

  if (error) {
    throw new Error(error.message);
  }

  await logAdminAction(supabase, {
    adminProfileId: adminUser.id,
    action: "suspend_profile",
    targetProfileId: profileId,
    targetResourceType: "profile",
    targetResourceId: profileId,
    metadata: {
      durationDays: duration.days,
      rule: rule.id,
    },
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/profiles/${profileId}`);
}

export async function unsuspendProfile(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createAdminClient();
  const profileId = requireValue(formData, "profile_id");

  await requireModeratableProfile(supabase, profileId);

  const { error: authError } = await supabase.auth.admin.updateUserById(
    profileId,
    { ban_duration: "none" },
  );

  if (authError) {
    throw new Error(authError.message);
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      suspended_at: null,
      suspended_until: null,
      suspension_rule: null,
      suspended_reason: null,
      suspended_by: null,
    })
    .eq("id", profileId);

  if (error) {
    throw new Error(error.message);
  }

  await logAdminAction(supabase, {
    adminProfileId: adminUser.id,
    action: "unsuspend_profile",
    targetProfileId: profileId,
    targetResourceType: "profile",
    targetResourceId: profileId,
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/profiles/${profileId}`);
}

export async function sendReportActionTakenNotification(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createAdminClient();
  const profileId = requireValue(formData, "profile_id");
  const deliveryId = requireValue(formData, "delivery_id");

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      deliveryId,
    )
  ) {
    throw new Error("Invalid notification delivery ID.");
  }

  await requireModeratableProfile(supabase, profileId);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email, first_name, full_name")
    .eq("id", profileId)
    .maybeSingle<{
      email: string | null;
      first_name: string | null;
      full_name: string | null;
    }>();

  if (profileError) {
    throw new Error(profileError.message);
  }

  const email = normalizeAuthEmail(profile?.email);

  if (!profile || !email) {
    throw new Error("This profile does not have an email address.");
  }

  const notificationBody = `${REPORT_ACTION_TAKEN_BODY} ${REPORTING_GUIDANCE}`;
  const dedupeKey = `manual_report_action_taken:${deliveryId}`;
  const { error: notificationError } = await supabase
    .from("system_notifications")
    .upsert(
      {
        recipient_id: profileId,
        type: "report_action_taken",
        title: REPORT_ACTION_TAKEN_TITLE,
        body: notificationBody,
        action_href: "/safety",
        dedupe_key: dedupeKey,
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );

  if (notificationError) {
    throw new Error(notificationError.message);
  }

  const firstName =
    profile.first_name?.trim() ||
    profile.full_name?.trim().split(/\s+/)[0] ||
    null;
  const emailResult = await sendReportActionTakenEmail({
    deliveryId,
    firstName,
    to: email,
  });

  if (!emailResult.sent) {
    throw new Error(
      "The in-app notification was created, but the email could not be sent.",
    );
  }

  await logAdminAction(supabase, {
    adminProfileId: adminUser.id,
    action: "send_report_action_taken_notification",
    targetProfileId: profileId,
    targetResourceType: "system_notification",
    targetResourceId: deliveryId,
    metadata: {
      emailSent: true,
      notificationType: "report_action_taken",
    },
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/profiles/${profileId}`);
  revalidatePath("/notifications");
}

export async function resetProfilePassword(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createAdminClient();
  const profileId = requireValue(formData, "profile_id");
  const password = requireValue(formData, "password");

  if (password.length < 8) {
    throw new Error("Temporary password must be at least 8 characters.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", profileId)
    .maybeSingle<{ is_admin: boolean }>();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile) {
    throw new Error("Profile not found.");
  }

  if (profile.is_admin) {
    throw new Error("Admin passwords cannot be reset from this dashboard.");
  }

  const { error } = await supabase.auth.admin.updateUserById(profileId, {
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  await logAdminAction(supabase, {
    adminProfileId: adminUser.id,
    action: "reset_profile_password",
    targetProfileId: profileId,
    targetResourceType: "profile",
    targetResourceId: profileId,
  });

  revalidatePath("/admin");
}

export async function deleteStory(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createAdminClient();
  const storyId = requireValue(formData, "story_id");

  const { data: story, error: storyError } = await supabase
    .from("profile_stories")
    .select("profile_id, storage_path")
    .eq("id", storyId)
    .maybeSingle<StoragePathRow & { profile_id: string }>();

  if (storyError) {
    throw new Error(storyError.message);
  }

  const { error } = await supabase
    .from("profile_stories")
    .delete()
    .eq("id", storyId);

  if (error) {
    throw new Error(error.message);
  }

  if (story?.storage_path) {
    const { error: storageError } = await removeStoryPhotoFiles(
      supabase,
      story.storage_path,
    );

    if (storageError) {
      throw new Error(storageError.message);
    }
  }

  await logAdminAction(supabase, {
    adminProfileId: adminUser.id,
    action: "delete_story",
    targetProfileId: story?.profile_id,
    targetResourceType: "story",
    targetResourceId: storyId,
  });

  revalidatePath("/admin");
  if (story?.profile_id) {
    revalidatePath(`/admin/profiles/${story.profile_id}`);
    revalidatePath(`/profile/${story.profile_id}`);
  }
  revalidatePath("/");
  revalidatePath("/search-aupair");
  revalidatePath("/search-family");
  revalidatePath(`/stories/${storyId}`);
}

export async function updateStoryContentModerationStatus(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createAdminClient();
  const storyId = requireValue(formData, "story_id");
  const status = requireValue(formData, "status");
  const reason = stringValue(formData, "reason");

  if (!["pending", "approved", "rejected"].includes(status)) {
    throw new Error("Invalid story moderation status");
  }

  const { data: story, error: storyError } = await supabase
    .from("profile_stories")
    .select("id, profile_id")
    .eq("id", storyId)
    .maybeSingle<{ id: string; profile_id: string }>();

  if (storyError) {
    throw new Error(storyError.message);
  }

  if (!story) {
    throw new Error("Story not found.");
  }

  const isReviewedStatus = status !== "pending";
  const { error } = await supabase
    .from("profile_stories")
    .update({
      content_moderation_status: status,
      content_moderation_reviewed_at: isReviewedStatus
        ? new Date().toISOString()
        : null,
      content_moderation_reviewed_by: isReviewedStatus ? adminUser.id : null,
      content_moderation_reason: reason || null,
    })
    .eq("id", storyId);

  if (error) {
    throw new Error(error.message);
  }

  await logAdminAction(supabase, {
    adminProfileId: adminUser.id,
    action: "update_story_content_moderation_status",
    targetProfileId: story.profile_id,
    targetResourceType: "story",
    targetResourceId: storyId,
    metadata: {
      status,
      hasReason: Boolean(reason),
    },
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/profiles/${story.profile_id}`);
  revalidatePath("/");
  revalidatePath("/search-aupair");
  revalidatePath("/search-family");
  revalidatePath(`/stories/${storyId}`);
  revalidatePath(`/profile/${story.profile_id}`);
}

export async function updateProfileVideoModerationStatus(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createAdminClient();
  const videoId = requireValue(formData, "video_id");
  const expectedStoragePath = requireValue(formData, "expected_storage_path");
  const status = requireValue(formData, "status");
  const reason = stringValue(formData, "reason");

  if (!["approved", "rejected"].includes(status)) {
    throw new Error("Invalid profile video moderation status");
  }

  const { data: video, error: videoError } = await supabase
    .from("profile_videos")
    .select("id, profile_id")
    .eq("id", videoId)
    .maybeSingle<{ id: string; profile_id: string }>();

  if (videoError) {
    throw new Error(videoError.message);
  }

  if (!video) {
    throw new Error("Profile video not found.");
  }

  await requireModeratableProfile(supabase, video.profile_id);

  const { data: applied, error } = await supabase.rpc(
    "apply_manual_profile_video_moderation_decision",
    {
      p_expected_storage_path: expectedStoragePath,
      p_reason: reason,
      p_reviewer_id: adminUser.id,
      p_status: status,
      p_video_id: videoId,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  if (applied !== true) {
    throw new Error(
      "This video changed or was already reviewed. Refresh the moderation queue and review the current upload before deciding.",
    );
  }

  await logAdminAction(supabase, {
    adminProfileId: adminUser.id,
    action: "update_profile_video_moderation_status",
    targetProfileId: video.profile_id,
    targetResourceType: "profile_video",
    targetResourceId: videoId,
    metadata: { status, hasReason: Boolean(reason) },
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/profiles/${video.profile_id}`);
  revalidatePath("/");
  revalidatePath("/search-aupair");
  revalidatePath("/search-family");
  revalidatePath(`/profile/${video.profile_id}`);
}

export async function deleteProfileVideo(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createAdminClient();
  const videoId = requireValue(formData, "video_id");

  const { data: video, error: videoError } = await supabase
    .from("profile_videos")
    .select("profile_id, storage_path")
    .eq("id", videoId)
    .maybeSingle<{ profile_id: string; storage_path: string }>();

  if (videoError) {
    throw new Error(videoError.message);
  }

  if (!video) {
    throw new Error("Profile video not found.");
  }

  await requireModeratableProfile(supabase, video.profile_id);

  const { error: storageError } = await removeProfileVideoFiles(
    supabase,
    video.storage_path,
  );

  if (storageError) {
    throw new Error(storageError.message);
  }

  const { error } = await supabase
    .from("profile_videos")
    .delete()
    .eq("id", videoId);

  if (error) {
    throw new Error(error.message);
  }

  await logAdminAction(supabase, {
    adminProfileId: adminUser.id,
    action: "delete_profile_video",
    targetProfileId: video.profile_id,
    targetResourceType: "profile_video",
    targetResourceId: videoId,
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/profiles/${video.profile_id}`);
  revalidatePath("/");
  revalidatePath("/search-aupair");
  revalidatePath("/search-family");
  revalidatePath(`/profile/${video.profile_id}`);
}

export async function deleteProfilePhoto(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createAdminClient();
  const photoId = requireValue(formData, "photo_id");
  const { data: photoTarget, error: photoTargetError } = await supabase
    .from("profile_photos")
    .select("profile_id")
    .eq("id", photoId)
    .maybeSingle<{ profile_id: string }>();

  if (photoTargetError) throw new Error(photoTargetError.message);
  if (!photoTarget) throw new Error("Profile photo not found.");

  await requireModeratableProfile(supabase, photoTarget.profile_id);

  const { data: deletion, error: deleteError } = await supabase.rpc(
    "delete_profile_photo_for_moderation",
    {
      p_photo_id: photoId,
      p_reviewer_id: adminUser.id,
    },
  );

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const photo = deletion as {
    profile_id: string;
    storage_path: string;
    was_primary: boolean;
    remaining_photos: number;
    public_slug: string | null;
  } | null;

  if (!photo) {
    revalidatePath("/admin");
    return;
  }

  const { error: storageError } = await removeProfilePhotoFiles(
    supabase,
    photo.storage_path,
  );

  if (storageError) {
    throw new Error(storageError.message);
  }

  await logAdminAction(supabase, {
    adminProfileId: adminUser.id,
    action: "delete_profile_photo",
    targetProfileId: photo.profile_id,
    targetResourceType: "profile_photo",
    targetResourceId: photoId,
    metadata: {
      wasPrimary: photo.was_primary,
      remainingPhotos: photo.remaining_photos,
      requiredReplacement: photo.remaining_photos === 0,
    },
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/profiles/${photo.profile_id}`);
  revalidatePath("/");
  revalidatePath("/search-aupair");
  revalidatePath("/search-family");
  revalidatePath(`/profile/${photo.profile_id}`);

  if (photo.public_slug) {
    revalidatePath(`/profile/${photo.public_slug}`);
  }
}

export async function deleteProfile(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createAdminClient();
  const profileId = requireValue(formData, "profile_id");
  const returnTo = safeAdminReturnTo(
    stringValue(formData, "return_to"),
    "/admin?view=members#workspace",
  );
  const profile = await requireModeratableProfile(supabase, profileId);
  const { data: authUser } = await supabase.auth.admin.getUserById(profileId);
  const bannedEmail = normalizeAuthEmail(profile.email ?? authUser.user?.email);

  if (bannedEmail) {
    const { error: banError } = await supabase.from("banned_auth_emails").upsert(
      {
        email: bannedEmail,
        reason: PERMANENT_BAN_MESSAGE,
        banned_profile_id: profileId,
        banned_by: adminUser.id,
      },
      { onConflict: "email" },
    );

    if (banError) {
      throw new Error(banError.message);
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const processingToken = crypto.randomUUID();
  const { data: requestedDeletion, error: requestError } = await supabase.rpc(
    "request_account_deletion",
    {
      p_profile_id: profileId,
      p_email: authUser.user?.email ?? profile.email,
    },
  );

  if (requestError) {
    throw new Error(requestError.message);
  }

  const deletionRequestId = (
    requestedDeletion as { request_id?: string } | null
  )?.request_id;

  if (!deletionRequestId) {
    throw new Error("Could not create the account deletion cleanup request.");
  }

  const { data: dueRequest, error: dueRequestError } = await supabase
    .from("account_deletion_requests")
    .update({
      scheduled_delete_at: nowIso,
      confirmation_email_sent_at: nowIso,
      reminder_sent_at: nowIso,
    })
    .eq("id", deletionRequestId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (dueRequestError) {
    throw new Error(dueRequestError.message);
  }

  if (!dueRequest) {
    throw new Error("This account deletion is already being processed.");
  }

  const { error: profileScheduleError } = await supabase
    .from("profiles")
    .update({ deletion_scheduled_at: nowIso })
    .eq("id", profileId);

  if (profileScheduleError) {
    throw new Error(profileScheduleError.message);
  }

  const { data: claimedProfileId, error: claimError } = await supabase.rpc(
    "claim_scheduled_account_deletion",
    {
      p_request_id: deletionRequestId,
      p_cutoff: nowIso,
      p_stale_before: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
      p_processing_token: processingToken,
    },
  );

  if (claimError) {
    throw new Error(claimError.message);
  }

  if (claimedProfileId !== profileId) {
    throw new Error("Could not safely claim this account deletion.");
  }

  let deletionResult: { removedFiles: number; completed: boolean };

  try {
    deletionResult = await deleteClaimedScheduledAccount({
      supabase,
      request: {
        id: deletionRequestId,
        profile_id: profileId,
        processing_token: processingToken,
      },
      now,
    });
  } catch (error) {
    await supabase
      .from("account_deletion_requests")
      .update({ processing_started_at: null, processing_token: null })
      .eq("id", deletionRequestId)
      .eq("status", "processing")
      .eq("processing_token", processingToken);

    throw error;
  }

  await logAdminAction(supabase, {
    adminProfileId: adminUser.id,
    action: "delete_profile",
    targetResourceType: "profile",
    targetResourceId: profileId,
    metadata: {
      emailBanned: Boolean(bannedEmail),
      cleanupRequestId: deletionRequestId,
      storageFilesRemoved: deletionResult.removedFiles,
    },
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/profiles/${profileId}`);
  redirect(returnTo);
}

export async function updateReportStatus(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createAdminClient();
  const reportId = requireValue(formData, "report_id");
  const status = requireValue(formData, "status");
  const notes = stringValue(formData, "admin_notes");

  if (!["open", "reviewed", "dismissed"].includes(status)) {
    throw new Error("Invalid report status");
  }

  const { data: report, error: reportError } = await supabase
    .from("moderation_reports")
    .select("resolution")
    .eq("id", reportId)
    .maybeSingle<{ resolution: string | null }>();

  if (reportError) {
    throw new Error(reportError.message);
  }

  if (!report) {
    throw new Error("Report not found.");
  }

  if (report.resolution) {
    throw new Error(
      "Reports with an applied safety action cannot be reopened or dismissed.",
    );
  }

  const { error } = await supabase
    .from("moderation_reports")
    .update({
      status,
      admin_notes: notes,
      reviewed_at: status === "open" ? null : new Date().toISOString(),
      reviewed_by: status === "open" ? null : adminUser.id,
    })
    .eq("id", reportId);

  if (error) {
    throw new Error(error.message);
  }

  await logAdminAction(supabase, {
    adminProfileId: adminUser.id,
    action: "update_report_status",
    targetResourceType: "moderation_report",
    targetResourceId: reportId,
    metadata: {
      status,
      hasNotes: Boolean(notes),
    },
  });

  revalidatePath("/admin");
}

export async function confirmReportViolationAndSeparate(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createAdminClient();
  const reportId = requireValue(formData, "report_id");
  const notes = stringValue(formData, "admin_notes");

  const { data, error } = await supabase.rpc(
    "apply_report_warning_and_separation",
    {
      p_admin_notes: notes,
      p_admin_profile_id: adminUser.id,
      p_report_id: reportId,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  const result = data as {
    ok?: boolean;
    reporter_id?: string | null;
    reported_profile_id?: string | null;
  } | null;

  if (result?.ok !== true) {
    throw new Error("The report safety action could not be applied.");
  }

  revalidatePath("/admin");
  revalidatePath("/messages");
  revalidatePath("/notifications");
  revalidatePath("/saved");
  revalidatePath("/search-aupair");
  revalidatePath("/search-family");

  if (result.reporter_id) {
    revalidatePath(`/profile/${result.reporter_id}`);
  }

  if (result.reported_profile_id) {
    revalidatePath(`/profile/${result.reported_profile_id}`);
  }
}

export async function updateRiskFlagStatus(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createAdminClient();
  const flagId = requireValue(formData, "flag_id");
  const status = requireValue(formData, "status");

  if (!["open", "reviewed", "dismissed"].includes(status)) {
    throw new Error("Invalid risk flag status");
  }

  const { error } = await supabase
    .from("account_risk_flags")
    .update({
      status,
      reviewed_at: status === "open" ? null : new Date().toISOString(),
      reviewed_by: status === "open" ? null : adminUser.id,
    })
    .eq("id", flagId);

  if (error) {
    throw new Error(error.message);
  }

  await logAdminAction(supabase, {
    adminProfileId: adminUser.id,
    action: "update_risk_flag_status",
    targetResourceType: "account_risk_flag",
    targetResourceId: flagId,
    metadata: {
      status,
    },
  });

  revalidatePath("/admin");
}

export async function updateProfileContentModerationStatus(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createAdminClient();
  const profileId = requireValue(formData, "profile_id");
  const expectedVersion = requireValue(formData, "expected_version");
  const status = requireValue(formData, "status");
  const reason = stringValue(formData, "reason");

  if (!["approved", "rejected"].includes(status)) {
    throw new Error("Invalid content moderation status");
  }

  if (!/^[0-9a-f]{64}$/.test(expectedVersion)) {
    throw new Error("Invalid profile content version");
  }

  await requireModeratableProfile(supabase, profileId);

  const { data: applied, error } = await supabase.rpc(
    "apply_manual_profile_moderation_decision",
    {
      p_expected_version: expectedVersion,
      p_profile_id: profileId,
      p_reason: reason,
      p_reviewer_id: adminUser.id,
      p_status: status,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  if (applied !== true) {
    throw new Error(
      "This profile changed or was already reviewed. Refresh the page and review the current text and photos before deciding.",
    );
  }

  await logAdminAction(supabase, {
    adminProfileId: adminUser.id,
    action: "update_profile_content_moderation_status",
    targetProfileId: profileId,
    targetResourceType: "profile",
    targetResourceId: profileId,
    metadata: {
      status,
      hasReason: Boolean(reason),
    },
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/profiles/${profileId}`);
  revalidatePath("/");
  revalidatePath("/search-aupair");
  revalidatePath("/search-family");
  revalidatePath(`/profile/${profileId}`);
}

export async function updateVerificationRequestStatus(formData: FormData) {
  const adminUser = await requireAdminUser();
  const supabase = createAdminClient();
  const requestId = requireValue(formData, "request_id");
  const status = requireValue(formData, "status");
  const note =
    status === "rejected"
      ? VERIFICATION_SELFIE_REJECTED_REASON
      : stringValue(formData, "reviewer_note");

  if (!["verified", "rejected"].includes(status)) {
    throw new Error("Invalid verification status");
  }

  const { data: request, error: requestError } = await supabase
    .from("profile_verification_requests")
    .select("id, profile_id")
    .eq("id", requestId)
    .maybeSingle<{ id: string; profile_id: string }>();

  if (requestError) {
    throw new Error(requestError.message);
  }

  if (!request) {
    throw new Error("Verification request not found.");
  }

  const reviewedAt = new Date().toISOString();

  const { error: updateRequestError } = await supabase
    .from("profile_verification_requests")
    .update({
      status,
      reviewer_note: note,
      reviewed_at: reviewedAt,
      reviewed_by: adminUser.id,
    })
    .eq("id", request.id);

  if (updateRequestError) {
    throw new Error(updateRequestError.message);
  }

  const { error: updateProfileError } = await supabase
    .from("profiles")
    .update({
      verification_status: status,
      verification_reviewed_at: reviewedAt,
      verification_rejected_reason: status === "rejected" ? note : null,
    })
    .eq("id", request.profile_id);

  if (updateProfileError) {
    throw new Error(updateProfileError.message);
  }

  if (status === "verified") {
    const { data: notificationProfile } = await supabase
      .from("profiles")
      .select("public_slug")
      .eq("id", request.profile_id)
      .maybeSingle<{ public_slug: string | null }>();

    const { error: notificationError } = await supabase
      .from("system_notifications")
      .upsert(
        {
          recipient_id: request.profile_id,
          type: VERIFICATION_APPROVED_NOTIFICATION.type,
          title: VERIFICATION_APPROVED_NOTIFICATION.title,
          body: VERIFICATION_APPROVED_NOTIFICATION.body,
          image_url: VERIFICATION_APPROVED_NOTIFICATION.imageUrl,
          action_href: `/profile/${notificationProfile?.public_slug ?? request.profile_id}`,
          dedupe_key: getVerificationApprovedDedupeKey(request.profile_id),
          created_at: reviewedAt,
          read_at: null,
        },
        { onConflict: "dedupe_key" },
      );

    if (notificationError) {
      throw new Error(notificationError.message);
    }
  } else {
    const { error: notificationError } = await supabase
      .from("system_notifications")
      .upsert(
        {
          recipient_id: request.profile_id,
          type: VERIFICATION_REJECTED_NOTIFICATION.type,
          title: VERIFICATION_REJECTED_NOTIFICATION.title,
          body: VERIFICATION_REJECTED_NOTIFICATION.body,
          image_url: VERIFICATION_REJECTED_NOTIFICATION.imageUrl,
          action_href: "/account#profile-verification",
          dedupe_key: getVerificationRejectedDedupeKey(request.id),
          created_at: reviewedAt,
          read_at: null,
        },
        { onConflict: "dedupe_key" },
      );

    if (notificationError) {
      throw new Error(notificationError.message);
    }
  }

  await logAdminAction(supabase, {
    adminProfileId: adminUser.id,
    action: "update_verification_request_status",
    targetProfileId: request.profile_id,
    targetResourceType: "profile_verification_request",
    targetResourceId: request.id,
    metadata: {
      status,
      hasReviewerNote: Boolean(note),
    },
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/profiles/${request.profile_id}`);
  revalidatePath("/messages");
}
