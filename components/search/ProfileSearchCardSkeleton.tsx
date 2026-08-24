import { LoadingSkeleton } from "@/components/layout/LoadingAppChrome";

const titleWidths = ["w-28", "w-36", "w-32", "w-40"];
const introductionWidths = ["w-11/12", "w-4/5", "w-full", "w-3/4"];

export function ProfileSearchCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <article
      aria-hidden="true"
      className="relative grid w-full min-w-0 max-w-full grid-cols-[minmax(8.8rem,42vw)_minmax(0,1fr)] gap-2 overflow-hidden rounded-[0.85rem] border border-[#d8e0e6] bg-white p-2 shadow-[0_8px_22px_rgba(38,63,69,0.05)] sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4 sm:rounded-[0.95rem] sm:p-3 lg:grid-cols-[minmax(220px,250px)_minmax(0,1fr)] lg:gap-5 lg:p-4 xl:grid-cols-[minmax(240px,270px)_minmax(0,1fr)]"
    >
      <div className="min-w-0">
        <LoadingSkeleton className="aspect-square w-full rounded-[0.8rem] bg-[#dce5e9]" />
        <div className="mt-2 space-y-1.5 lg:hidden">
          <LoadingSkeleton className="h-2.5 w-full rounded-full bg-[#e1e8eb]" />
          <LoadingSkeleton
            className={`h-2.5 max-w-full rounded-full bg-[#e1e8eb] ${introductionWidths[index % introductionWidths.length]}`}
          />
          <LoadingSkeleton className="h-2.5 w-full rounded-full bg-[#e1e8eb] sm:hidden" />
          <LoadingSkeleton
            className={`h-2.5 max-w-full rounded-full bg-[#e1e8eb] sm:hidden ${introductionWidths[(index + 1) % introductionWidths.length]}`}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-col bg-white">
        <div className="flex min-w-0 items-start justify-between gap-2 lg:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5 lg:gap-2.5">
              <LoadingSkeleton
                className={`h-5 max-w-full rounded-full bg-[#cbd7dc] sm:h-6 lg:h-8 ${titleWidths[index % titleWidths.length]}`}
              />
              <LoadingSkeleton className="h-5 w-5 shrink-0 rounded-full bg-[#e7f1f5] ring-1 ring-[#c7dce6]" />
            </div>
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <LoadingSkeleton className="h-4 w-4 shrink-0 rounded-full bg-[#d6e2e8]" />
              <LoadingSkeleton className="h-3 w-24 max-w-full rounded-full bg-[#d6e2e8] sm:w-32 lg:h-4 lg:w-44" />
            </div>
          </div>

          <LoadingSkeleton className="h-10 w-10 shrink-0 rounded-full bg-white ring-1 ring-[#d6e2e8]" />
        </div>

        <div className="mt-2 flex min-w-0 flex-wrap gap-1.5 lg:hidden">
          <LoadingSkeleton className="h-6 w-16 rounded-full bg-[#f3f7f5] ring-1 ring-[#d6e7df]" />
          <LoadingSkeleton className="h-6 w-20 rounded-full bg-[#f3f7f5] ring-1 ring-[#d6e7df]" />
          <LoadingSkeleton className="h-6 w-14 rounded-full bg-[#f3f7f5] ring-1 ring-[#d6e7df]" />
        </div>

        <div className="my-3 hidden h-px bg-[#d8e0e6] lg:block" />

        <div className="hidden min-w-0 grid-cols-3 gap-3 lg:grid">
          {Array.from({ length: 3 }).map((_, detailIndex) => (
            <div
              key={detailIndex}
              className={detailIndex > 0 ? "border-l border-[#d8e0e6] pl-3" : ""}
            >
              <LoadingSkeleton className="h-3 w-16 rounded-full bg-[#d6e2e8]" />
              <LoadingSkeleton className="mt-2 h-4 w-24 max-w-full rounded-full bg-[#cfd9de]" />
            </div>
          ))}
        </div>

        <div className="mt-4 hidden space-y-2 lg:block">
          <LoadingSkeleton className="h-3 w-full rounded-full bg-[#e1e8eb]" />
          <LoadingSkeleton
            className={`h-3 max-w-full rounded-full bg-[#e1e8eb] ${introductionWidths[index % introductionWidths.length]}`}
          />
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2 pt-3 lg:gap-3 lg:pt-5">
          <LoadingSkeleton className="h-11 min-w-0 rounded-[0.55rem] bg-white ring-1 ring-[#9faeb8]" />
          <LoadingSkeleton className="h-11 min-w-0 rounded-[0.55rem] bg-[var(--pa-primary)]" />
        </div>
      </div>
    </article>
  );
}
