type VerificationRejectedGuidanceProps = {
  fullFaceLabel: string;
  smileLabel: string;
  twoFingersLabel: string;
  imageAlt: string;
  compact?: boolean;
};

export function VerificationRejectedGuidance({
  fullFaceLabel,
  smileLabel,
  twoFingersLabel,
  imageAlt,
  compact = false,
}: VerificationRejectedGuidanceProps) {
  return (
    <span
      className={`flex items-center rounded-[0.9rem] border border-[#d95f49]/20 bg-[#fff7f4] ${
        compact
          ? "mt-2 gap-3 p-2.5 sm:gap-4 sm:p-3"
          : "mt-3 max-w-lg gap-3 p-3 md:max-w-xl md:gap-5 md:p-4"
      }`}
    >
      <span
        className={`min-w-0 flex-1 font-bold text-[#71352b] ${
          compact
            ? "text-xs leading-5 sm:text-sm sm:leading-6"
            : "text-sm leading-6 md:text-base md:leading-7"
        }`}
      >
        <span className="block">• {fullFaceLabel}</span>
        <span className="block">• {smileLabel}</span>
        <span className="block">• {twoFingersLabel}</span>
      </span>
      <span
        role="img"
        aria-label={imageAlt}
        className={`flex shrink-0 items-center justify-center rounded-[0.75rem] bg-white text-[#71352b] ring-1 ring-black/10 ${
          compact
            ? "h-24 w-[4.5rem] sm:h-32 sm:w-24"
            : "h-36 w-28 md:h-48 md:w-36"
        }`}
      >
        <svg aria-hidden="true" viewBox="0 0 48 48" className="h-12 w-12">
          <circle cx="24" cy="17" r="8" fill="#fde8dc" stroke="currentColor" strokeWidth="2" />
          <path d="M10 42c1.5-10 7-15 14-15s12.5 5 14 15" fill="#e7f1f5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M34 9l3 3 5-6" fill="none" stroke="#2f7d5a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </span>
  );
}
