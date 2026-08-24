import {
  formatProfileActivityStatus,
} from "@/lib/i18n/formatters";
import type { Translate } from "@/lib/i18n/translations";

type ProfileActivityBadgeProps = {
  status?: string | null;
  t: Translate;
  className?: string;
  dotOnly?: boolean;
};

export function ProfileActivityBadge({
  status,
  t,
  className = "",
  dotOnly = false,
}: ProfileActivityBadgeProps) {
  const isActive = status === "active";
  const isRecentlyActive = status === "recently_active";
  const label = formatProfileActivityStatus(status, t);
  const statusColor = isActive
    ? "bg-[#28b463]"
    : isRecentlyActive
      ? "bg-[#f4a62a]"
      : "bg-[#9aa4a1]";

  if (!label) return null;

  if (dotOnly) {
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className={`inline-block h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm ring-1 ring-black/10 ${statusColor} ${className}`}
      />
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/95 px-3 py-1.5 text-xs font-black text-[#25302d] shadow-sm ${className}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${statusColor}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
