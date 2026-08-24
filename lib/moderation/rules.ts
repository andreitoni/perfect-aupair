export const PERMANENT_BAN_MESSAGE =
  "Your account has been permanently banned for violating the platform rules.";

export const SUSPENSION_DURATIONS = [
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3 },
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
] as const;

export const MODERATION_RULES = [
  {
    id: "fake_profile",
    label: "Fake profile or impersonation",
    userMessage: "fake profile or impersonation",
  },
  {
    id: "harassment",
    label: "Harassment or abusive behavior",
    userMessage: "harassment or abusive behavior",
  },
  {
    id: "scam_or_spam",
    label: "Scam, spam, or suspicious behavior",
    userMessage: "scam, spam, or suspicious behavior",
  },
  {
    id: "unsafe_content",
    label: "Unsafe, explicit, or illegal content",
    userMessage: "unsafe, explicit, or illegal content",
  },
  {
    id: "privacy_violation",
    label: "Privacy or consent violation",
    userMessage: "privacy or consent violation",
  },
] as const;

export function getModerationRule(ruleId?: string | null) {
  return MODERATION_RULES.find((rule) => rule.id === ruleId) ?? null;
}

export function getSuspensionDuration(days?: string | number | null) {
  const parsedDays = Number(days);

  return (
    SUSPENSION_DURATIONS.find((duration) => duration.days === parsedDays) ??
    null
  );
}
