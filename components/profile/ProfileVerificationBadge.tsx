type ProfileVerificationBadgeProps = {
  status?: string | null;
  label?: string;
  className?: string;
  compact?: boolean;
  iconOnly?: boolean;
};

export function ProfileVerificationBadge({
  status,
  label = "Photo Verified profile",
  className,
  compact = false,
}: ProfileVerificationBadgeProps) {
  if (status !== "verified") {
    return null;
  }

  const icon = (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-full w-full"
    >
      <polygon
        points="12.00,1.70 14.28,3.50 17.15,3.08 18.22,5.78 20.92,6.85 20.50,9.72 22.30,12.00 20.50,14.28 20.92,17.15 18.22,18.22 17.15,20.92 14.28,20.50 12.00,22.30 9.72,20.50 6.85,20.92 5.78,18.22 3.08,17.15 3.50,14.28 1.70,12.00 3.50,9.72 3.08,6.85 5.78,5.78 6.85,3.08 9.72,3.50"
        fill="currentColor"
      />
      <path
        d="m7.6 12.15 2.75 2.75 6.15-6.15"
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.6"
      />
    </svg>
  );

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={[
        "group/verification-badge relative z-[3] inline-flex shrink-0 items-center justify-center text-[#1877F2]",
        compact ? "h-6 w-6" : "h-[1.875rem] w-[1.875rem]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon}
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-full bg-[#25302d] px-2.5 py-1 text-[0.68rem] font-black leading-none text-white shadow-lg ring-1 ring-black/10 group-hover/verification-badge:inline-flex">
        {label}
      </span>
    </span>
  );
}
