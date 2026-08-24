import { LegalFooter } from "@/components/layout/LegalFooter";
import {
  DesktopAppHeaderSkeleton,
  LoadingSkeleton,
  MobileAppNavSkeleton,
} from "@/components/layout/LoadingAppChrome";
import type { ReactNode } from "react";

const accountHeaderActionWidths = [
  "w-12",
  "w-32",
  "w-12 lg:w-24",
  "w-12",
  "w-12 lg:w-24",
];

function WorkspaceCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-hidden="true"
      className={`rounded-[1.25rem] border border-[#d6e2e8] bg-white p-4 shadow-sm sm:p-5 lg:rounded-[1.1rem] lg:p-4 ${className}`}
    >
      {children}
    </section>
  );
}

function MobileAccountSkeleton() {
  const tabWidths = ["w-20", "w-20", "w-16", "w-20", "w-20"];

  return (
    <div className="lg:hidden">
      <section
        aria-hidden="true"
        className="rounded-[1.25rem] border border-[#d6e2e8] bg-white p-4 shadow-sm"
      >
        <div className="flex min-w-0 items-center gap-3">
          <LoadingSkeleton className="h-20 w-20 shrink-0 rounded-full bg-[#ded7cf] ring-1 ring-[#d6e2e8]" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <LoadingSkeleton className="h-6 w-36 max-w-full rounded-full bg-[#cbd7dc]" />
              <LoadingSkeleton className="h-6 w-6 shrink-0 rounded-full bg-[#e7f1f5] ring-1 ring-[#c7dce6]" />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <LoadingSkeleton className="h-3.5 w-28 max-w-full rounded-full bg-[#d6e2e8]" />
              <LoadingSkeleton className="h-5 w-5 shrink-0 rounded-full bg-[#e7f1f4]" />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <LoadingSkeleton className="h-10 rounded-[0.7rem] bg-[var(--pa-primary)]" />
          <LoadingSkeleton className="h-10 rounded-[0.7rem] bg-white ring-1 ring-[#9fb1ba]" />
        </div>
      </section>

      <div className="sticky top-0 z-20 -mx-1 bg-[var(--background)]/95 px-1 py-2 backdrop-blur">
        <div
          aria-hidden="true"
          className="pa-scrollbar-none flex min-w-0 gap-1 overflow-hidden rounded-[0.95rem] bg-white p-1 shadow-sm ring-1 ring-[#d6e2e8]"
        >
          {tabWidths.map((width, index) => (
            <LoadingSkeleton
              key={`${width}-${index}`}
              className={`h-10 shrink-0 rounded-[0.75rem] ${width} ${
                index === 0 ? "bg-[var(--pa-primary)]" : "bg-[#f4f8fa]"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 space-y-4">
        <WorkspaceCard>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <LoadingSkeleton className="h-6 w-44 max-w-full rounded-full bg-[#cbd7dc]" />
              <LoadingSkeleton className="mt-2 h-3.5 w-52 max-w-full rounded-full bg-[#d6e2e8]" />
            </div>
            <LoadingSkeleton className="h-7 w-12 shrink-0 rounded-full bg-[#cbd7dc]" />
          </div>
          <LoadingSkeleton className="mt-4 h-3 w-full rounded-full bg-[#e7f1f4]" />
          <div className="mt-4 flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <LoadingSkeleton
                key={index}
                className={`h-6 rounded-full bg-[#e7f1f4] ${
                  index % 3 === 0 ? "w-24" : "w-28"
                }`}
              />
            ))}
          </div>
        </WorkspaceCard>

        <WorkspaceCard>
          <div className="flex items-center gap-3">
            <LoadingSkeleton className="h-6 w-36 rounded-full bg-[#cbd7dc]" />
            <LoadingSkeleton className="h-6 w-16 rounded-full bg-[#e7f1f5] ring-1 ring-[#c7dce6]" />
          </div>
          <LoadingSkeleton className="mt-3 h-3.5 w-full rounded-full bg-[#d6e2e8]" />
          <LoadingSkeleton className="mt-2 h-3.5 w-4/5 rounded-full bg-[#d6e2e8]" />
          <LoadingSkeleton className="mt-4 h-10 w-36 rounded-[0.7rem] bg-[var(--pa-primary)]" />
        </WorkspaceCard>
      </div>
    </div>
  );
}

function DesktopAccountSkeleton() {
  return (
    <div className="hidden w-full max-w-full lg:block">
      <div className="mb-4 flex items-center justify-between gap-4 border-b border-[#d6e2e8] px-1 pb-3">
        <LoadingSkeleton className="h-7 w-36 rounded-full bg-[#cfd9de]" />
        <LoadingSkeleton className="h-3 w-40 rounded-full bg-[#b8d7df]" />
      </div>

      <div className="grid min-w-0 grid-cols-[15rem_minmax(0,1fr)] gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
        <aside
          aria-hidden="true"
          className="sticky top-28 min-w-0 max-w-full self-start"
        >
          <div className="min-w-0 max-w-full overflow-hidden rounded-[1.1rem] border border-[#d6e2e8] bg-white p-3 shadow-sm">
            <LoadingSkeleton className="mx-auto aspect-square w-full rounded-[0.9rem] bg-[#d8d0c6]" />
            <LoadingSkeleton className="mt-4 h-5 w-40 rounded-full bg-[#cfd9de]" />
            <LoadingSkeleton className="mt-2 h-4 w-32 rounded-full bg-[#d6e2e8]" />
            <div className="mt-4 flex flex-col gap-1 border-t border-[#d6e2e8] pt-4">
              {Array.from({ length: 7 }).map((_, index) => (
                <LoadingSkeleton
                  key={index}
                  className={`h-9 w-full rounded-[0.65rem] ${
                    index === 0
                      ? "bg-[#e7f1f4]"
                      : "bg-white ring-1 ring-[#edf2f4]"
                  }`}
                />
              ))}
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-3">
          <WorkspaceCard>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <LoadingSkeleton className="h-6 w-24 rounded-full bg-[#e7f1f4]" />
                <LoadingSkeleton className="mt-3 h-10 w-80 max-w-full rounded-full bg-[#cfd9de]" />
              </div>
              <div className="flex shrink-0 gap-2">
                <LoadingSkeleton className="h-10 w-32 rounded-[0.7rem] bg-[var(--pa-primary)]" />
                <LoadingSkeleton className="h-10 w-20 rounded-[0.7rem] bg-white ring-1 ring-[#9fb1ba]" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 items-start gap-2 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 13 }).map((_, index) => (
                <div
                  key={index}
                  className={`self-start rounded-[0.8rem] border border-[#d6e2e8] bg-[#fbfcfb] px-3 py-2.5 ${
                    index === 5 || index === 9 ? "col-span-2" : ""
                  }`}
                >
                  <LoadingSkeleton className="h-3 w-20 rounded-full bg-[#d6e2e8]" />
                  <LoadingSkeleton className="mt-2 h-4 w-28 max-w-full rounded-full bg-[#cfd9de]" />
                </div>
              ))}
            </div>
          </WorkspaceCard>

          <WorkspaceCard>
            <div className="flex items-start justify-between gap-4">
              <div>
                <LoadingSkeleton className="h-7 w-48 rounded-full bg-[#cfd9de]" />
                <LoadingSkeleton className="mt-2 h-4 w-56 rounded-full bg-[#d6e2e8]" />
              </div>
              <LoadingSkeleton className="h-8 w-16 rounded-full bg-[#cfd9de]" />
            </div>
            <LoadingSkeleton className="mt-3 h-2.5 rounded-full bg-[#e7f1f4]" />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Array.from({ length: 6 }).map((_, index) => (
                <LoadingSkeleton
                  key={index}
                  className="h-6 w-28 rounded-full bg-[#e7f1f4]"
                />
              ))}
            </div>
          </WorkspaceCard>

          <WorkspaceCard>
            <LoadingSkeleton className="h-7 w-36 rounded-full bg-[#cfd9de]" />
            <LoadingSkeleton className="mt-3 h-4 w-full rounded-full bg-[#d6e2e8]" />
            <LoadingSkeleton className="mt-2 h-4 w-2/3 rounded-full bg-[#d6e2e8]" />
          </WorkspaceCard>

          <div className="grid grid-cols-2 gap-4">
            <WorkspaceCard>
              <div className="flex items-center justify-between gap-3">
                <LoadingSkeleton className="h-7 w-28 rounded-full bg-[#cfd9de]" />
                <LoadingSkeleton className="h-10 w-20 rounded-[0.7rem] bg-[#cfe5ec]" />
              </div>
              <LoadingSkeleton className="mt-4 aspect-square w-36 rounded-[0.9rem] bg-[#d8d0c6]" />
            </WorkspaceCard>

            <WorkspaceCard>
              <div className="flex items-center justify-between gap-3">
                <LoadingSkeleton className="h-7 w-24 rounded-full bg-[#cfd9de]" />
                <LoadingSkeleton className="h-10 w-28 rounded-[0.7rem] bg-[#cfe5ec]" />
              </div>
              <LoadingSkeleton className="mt-4 aspect-square w-36 rounded-[0.9rem] bg-[#d8d0c6]" />
            </WorkspaceCard>
          </div>

          <WorkspaceCard>
            <LoadingSkeleton className="h-7 w-32 rounded-full bg-[#cfd9de]" />
            <LoadingSkeleton className="mt-4 aspect-video w-full rounded-[0.9rem] bg-[#172426]" />
          </WorkspaceCard>
        </div>
      </div>
    </div>
  );
}

export default function AccountLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="min-h-screen overflow-x-hidden bg-[var(--background)] pb-16 text-[#25302d] sm:pb-0"
    >
      <DesktopAppHeaderSkeleton
        actionWidths={accountHeaderActionWidths}
        subtitleWidth="w-32"
      />
      <MobileAppNavSkeleton />

      <section className="mx-auto w-full max-w-[76rem] px-3 py-4 sm:px-6 sm:py-6 lg:py-7">
        <MobileAccountSkeleton />
        <DesktopAccountSkeleton />
      </section>

      <LegalFooter />
    </main>
  );
}
