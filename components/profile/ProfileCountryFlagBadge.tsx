import { getCountryFlagEmoji } from "@/lib/profile-options";

type ProfileCountryFlagBadgeProps = {
  country?: string | null;
  label?: string;
};

export function ProfileCountryFlagBadge({
  country,
  label,
}: ProfileCountryFlagBadgeProps) {
  const flag = getCountryFlagEmoji(country);

  if (!flag) return null;

  return (
    <span
      aria-hidden={label ? undefined : "true"}
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 items-center text-2xl leading-none text-[#25302d] opacity-100 [filter:none]"
    >
      {flag}
    </span>
  );
}
