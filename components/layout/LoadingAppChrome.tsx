import { LogoMark } from "@/components/brand/LogoMark";

export function LoadingSkeleton({
  className = "",
}: {
  className?: string;
}) {
  return <div aria-hidden="true" className={`animate-pulse ${className}`} />;
}

export function DesktopAppHeaderSkeleton({
  actionWidths = ["w-12", "w-32", "w-12", "w-12", "w-12"],
  showDiscoverySearch = false,
  subtitleWidth = "w-32",
  width = "default",
}: {
  actionWidths?: string[];
  showDiscoverySearch?: boolean;
  subtitleWidth?: string;
  width?: "default" | "full";
}) {
  const chromeClass =
    width === "full"
      ? "w-full px-4 sm:px-4 lg:px-5"
      : "pa-page-chrome";

  return (
    <header
      aria-hidden="true"
      className="sticky top-0 z-40 hidden border-b border-[#cfd9de]/80 bg-white/95 shadow-[0_1px_18px_rgba(38,63,69,0.08)] backdrop-blur sm:block"
    >
      <div
        className={`${chromeClass} flex flex-wrap items-center justify-between gap-3 py-2`}
      >
        <div className="flex min-w-0 shrink-0 items-center gap-3.5 rounded-full pr-2">
          <LogoMark
            decorative
            className="h-[3.25rem] w-[3.25rem] bg-white shadow-sm ring-2 ring-[#bfd6df]/80"
          />
          <div className="min-w-0">
            <p className="truncate text-[1.35rem] font-black leading-7 tracking-tight text-[#172426]">
              Perfect AuPair
            </p>
            <LoadingSkeleton
              className={`mt-0.5 h-6 ${subtitleWidth} rounded-full bg-[#e7f1f5] ring-1 ring-[#c7dce6]`}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {showDiscoverySearch ? (
            <LoadingSkeleton className="hidden h-12 w-[15rem] shrink-0 rounded-full bg-white shadow-sm ring-1 ring-[#c7d1d6]/70 xl:block 2xl:w-[18rem]" />
          ) : null}
          {actionWidths.map((width, index) => (
            <LoadingSkeleton
              key={`${width}-${index}`}
              className={`h-12 shrink-0 rounded-full bg-[var(--pa-header-button-bg)] shadow-sm ring-1 ring-[#c7d1d6]/70 ${width}`}
            />
          ))}
        </div>
      </div>
    </header>
  );
}

export function MobilePublicHeaderSkeleton() {
  return (
    <header
      aria-hidden="true"
      className="sticky top-0 z-40 border-b border-[#cfd9de]/80 bg-white/95 shadow-[0_1px_18px_rgba(38,63,69,0.08)] backdrop-blur sm:hidden"
    >
      <div className="flex flex-col gap-2 px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <LogoMark
            decorative
            className="h-9 w-9 bg-white shadow-sm ring-2 ring-[#bfd6df]/80"
          />
          <div className="flex items-center gap-1">
            <LoadingSkeleton className="h-9 w-[4.5rem] rounded-full bg-[var(--pa-header-button-bg)] ring-1 ring-[#c7d1d6]/70" />
            <LoadingSkeleton className="h-9 w-[4.25rem] rounded-full bg-[var(--pa-header-button-bg)] ring-1 ring-[#c7d1d6]/70" />
            <LoadingSkeleton className="h-9 w-9 rounded-full bg-[var(--pa-header-button-bg)] ring-1 ring-[#c7d1d6]/70" />
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2">
          <LoadingSkeleton className="h-10 rounded-full bg-[var(--pa-aupair-cta)] ring-1 ring-[var(--pa-aupair-cta-soft)]" />
          <LoadingSkeleton className="h-10 rounded-full bg-[var(--pa-family-cta)] ring-1 ring-[var(--pa-family-cta-hover)]" />
        </div>
      </div>
    </header>
  );
}

export function MobileDiscoverySearchSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="border-b border-[#d8e0e6] bg-white px-4 py-2 sm:hidden"
    >
      <LoadingSkeleton className="h-11 w-full rounded-full bg-[#f5f8f9] shadow-sm ring-1 ring-[#c8d7de]" />
    </div>
  );
}

export function MobileAppNavSkeleton() {
  return (
    <nav
      aria-hidden="true"
      className="pa-mobile-app-nav fixed inset-x-0 bottom-0 z-40 border-t border-[#d8e0e6] bg-white/96 px-2 pb-[calc(0.2rem+env(safe-area-inset-bottom))] pt-1 shadow-[0_-6px_18px_rgba(31,47,53,0.06)] backdrop-blur sm:hidden"
    >
      <div className="mx-auto flex h-12 max-w-md items-center justify-around gap-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="flex h-11 w-11 items-center justify-center rounded-full"
          >
            <LoadingSkeleton
              className={
                index === 4
                  ? "h-7 w-7 rounded-full bg-[#cfd9de]"
                  : "h-6 w-6 rounded-[0.65rem] bg-[#cfd9de]"
              }
            />
          </div>
        ))}
      </div>
    </nav>
  );
}
