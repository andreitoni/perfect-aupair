export const ADMIN_TIME_ZONE =
  process.env.ADMIN_TIME_ZONE?.trim() || "Europe/Berlin";

export function formatAdminDate(value?: string | null, timeStyle: "short" | "medium" = "short") {
  if (!value) return "n/a";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle,
    timeZone: ADMIN_TIME_ZONE,
  }).format(new Date(value));
}
