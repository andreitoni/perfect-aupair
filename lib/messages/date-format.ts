import {
  DEFAULT_LANGUAGE,
  getLocaleTag,
  type LanguageCode,
} from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/translations";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toDate(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfLocalWeek(date: Date) {
  const start = startOfLocalDay(date);
  const day = start.getDay();

  // Sunday = 0, Monday = 1. We use Monday as week start.
  const daysSinceMonday = day === 0 ? 6 : day - 1;

  start.setDate(start.getDate() - daysSinceMonday);

  return start;
}

function daysBetweenLocalDates(date: Date, referenceDate: Date) {
  const start = startOfLocalDay(date).getTime();
  const referenceStart = startOfLocalDay(referenceDate).getTime();

  return Math.round((referenceStart - start) / 86_400_000);
}

export function isSameLocalDay(
  firstValue?: string | null,
  secondValue?: string | null,
) {
  const first = toDate(firstValue);
  const second = toDate(secondValue);

  if (!first || !second) return false;

  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function isToday(date: Date) {
  return daysBetweenLocalDates(date, new Date()) === 0;
}

function isYesterday(date: Date) {
  return daysBetweenLocalDates(date, new Date()) === 1;
}

function isSameCalendarWeek(date: Date) {
  return (
    startOfLocalWeek(date).getTime() === startOfLocalWeek(new Date()).getTime()
  );
}

function formatWeekday(date: Date, locale: LanguageCode) {
  return new Intl.DateTimeFormat(getLocaleTag(locale), {
    weekday: "long",
  }).format(date);
}

function formatShortDate(date: Date, locale: LanguageCode) {
  return new Intl.DateTimeFormat(getLocaleTag(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatMessageClock(value?: string | null) {
  const date = toDate(value);

  if (!date) return "";

  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatConversationListTime(
  value?: string | null,
  locale: LanguageCode = DEFAULT_LANGUAGE,
  t?: Translate,
) {
  const date = toDate(value);

  if (!date) return "";

  if (isToday(date)) {
    return formatMessageClock(value);
  }

  if (isYesterday(date)) {
    return t ? t("format.date.yesterday") : "Yesterday";
  }

  if (isSameCalendarWeek(date)) {
    return formatWeekday(date, locale);
  }

  return formatShortDate(date, locale);
}

export function formatMessageDateDivider(
  value?: string | null,
  locale: LanguageCode = DEFAULT_LANGUAGE,
  t?: Translate,
) {
  const date = toDate(value);

  if (!date) return "";

  if (isToday(date)) {
    return t ? t("format.date.today") : "Today";
  }

  if (isYesterday(date)) {
    return t ? t("format.date.yesterday") : "Yesterday";
  }

  if (isSameCalendarWeek(date)) {
    return formatWeekday(date, locale);
  }

  return formatShortDate(date, locale);
}
