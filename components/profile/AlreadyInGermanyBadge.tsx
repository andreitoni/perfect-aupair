export function AlreadyInGermanyBadge({
  label,
  className = "",
  compact = false,
}: {
  label: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`inline-flex rounded-full bg-white/95 font-black text-[#25302d] shadow-sm ring-1 ring-black/10 backdrop-blur ${
        compact ? "px-2 py-0.5 text-[0.66rem]" : "px-3 py-1.5 text-[0.68rem]"
      } ${className}`}
    >
      <span className="flex flex-col leading-none">
        <span>{label}</span>
        <span
          aria-hidden="true"
          className={`flex w-full overflow-hidden rounded-full ${
            compact ? "mt-0.5 h-0.5" : "mt-1 h-1"
          }`}
        >
          <span className="h-full flex-1 bg-black" />
          <span className="h-full flex-1 bg-[#dd0000]" />
          <span className="h-full flex-1 bg-[#ffce00]" />
        </span>
      </span>
    </div>
  );
}
