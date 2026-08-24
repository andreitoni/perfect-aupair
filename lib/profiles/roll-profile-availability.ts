import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentMonthValue } from "@/lib/month-options";

type ProfileAvailabilityRow = {
  availability_start: string | null;
  availability_start_from: string | null;
  availability_start_to: string | null;
  id: string;
};

type NormalizedAvailabilityWindow = {
  availability_start: string;
  availability_start_from: string;
  availability_start_to: string;
};

type RollProfileAvailabilityParams = {
  batchSize?: number;
  now?: Date;
  supabase: SupabaseClient;
};

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

function addUtcMonths(date: Date, monthCount: number) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthCount, 1),
  );
}

function parseMonthStart(value?: string | null) {
  const match = value?.trim().match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);

  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIndex) ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    return null;
  }

  return new Date(Date.UTC(year, monthIndex, 1));
}

function formatDateInputValue(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-01`;
}

function formatMonthLabel(date: Date) {
  return `${monthLabels[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function formatStartWindow(from: Date, to: Date) {
  return `${formatMonthLabel(from)} - ${formatMonthLabel(to)}`;
}

function getCurrentMonthStart(now: Date) {
  const currentMonth = parseMonthStart(getCurrentMonthValue(now));

  if (!currentMonth) {
    throw new Error("Could not resolve current availability month.");
  }

  return currentMonth;
}

export function normalizeProfileAvailabilityWindow(
  profile: ProfileAvailabilityRow,
  now = new Date(),
): NormalizedAvailabilityWindow | null {
  const currentMonth = getCurrentMonthStart(now);
  const from = parseMonthStart(profile.availability_start_from);
  const to = parseMonthStart(profile.availability_start_to);

  if (!from || !to) return null;

  const nextFrom = from < currentMonth ? currentMonth : from;
  const nextTo = to <= nextFrom ? addUtcMonths(nextFrom, 1) : to;
  const nextWindow = {
    availability_start: formatStartWindow(nextFrom, nextTo),
    availability_start_from: formatDateInputValue(nextFrom),
    availability_start_to: formatDateInputValue(nextTo),
  };

  if (
    profile.availability_start === nextWindow.availability_start &&
    profile.availability_start_from === nextWindow.availability_start_from &&
    profile.availability_start_to === nextWindow.availability_start_to
  ) {
    return null;
  }

  return nextWindow;
}

export async function rollProfileAvailabilityWindows({
  batchSize = 500,
  now = new Date(),
  supabase,
}: RollProfileAvailabilityParams) {
  const safeBatchSize = Math.max(1, Math.min(batchSize, 1000));
  const currentMonth = formatDateInputValue(getCurrentMonthStart(now));
  let checkedProfiles = 0;
  let updatedProfiles = 0;
  let skippedProfiles = 0;
  let lastSeenId = "";

  while (true) {
    let query = supabase
      .from("profiles")
      .select(
        "id, availability_start, availability_start_from, availability_start_to",
      )
      .eq("onboarding_completed", true)
      .not("is_admin", "is", true)
      .is("deletion_requested_at", null)
      .not("availability_start_from", "is", null)
      .not("availability_start_to", "is", null)
      .or(
        `availability_start_from.lt.${currentMonth},availability_start_to.lte.${currentMonth}`,
      )
      .order("id", { ascending: true })
      .limit(safeBatchSize);

    if (lastSeenId) {
      query = query.gt("id", lastSeenId);
    }

    const { data: profileRows, error: selectError } = await query;

    if (selectError) {
      throw new Error(selectError.message);
    }

    const profiles = (profileRows ?? []) as ProfileAvailabilityRow[];

    if (!profiles.length) {
      break;
    }

    for (const profile of profiles) {
      checkedProfiles += 1;
      lastSeenId = profile.id;

      const updateData = normalizeProfileAvailabilityWindow(profile, now);

      if (!updateData) {
        skippedProfiles += 1;
        continue;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", profile.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      updatedProfiles += 1;
    }
  }

  return {
    checkedProfiles,
    currentMonth,
    skippedProfiles,
    updatedProfiles,
  };
}
