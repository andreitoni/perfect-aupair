import { LegalFooter } from "@/components/layout/LegalFooter";
import {
  DesktopAppHeaderSkeleton,
  MobileAppNavSkeleton,
  MobilePublicHeaderSkeleton,
} from "@/components/layout/LoadingAppChrome";
import { hasSupabaseSessionCookie } from "@/lib/supabase/has-session-cookie";
import type { ReactNode } from "react";

const actionButtonWidths = [
  "w-12",
  "w-36",
  "w-12 lg:w-28",
  "w-12",
  "w-12 lg:w-28",
];
const factRows = [
  { row: "bg-white", value: "w-40" },
  { row: "bg-white", value: "w-32" },
  { row: "bg-white", value: "w-52" },
  { row: "bg-white", value: "w-28" },
  { row: "bg-white", value: "w-44" },
];

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse ${className}`} />;
}

function SkeletonIcon({
  className = "bg-[#e7f1f4] ring-[#cbe3ec]",
  sizeClassName = "h-8 w-8",
}: {
  className?: string;
  sizeClassName?: string;
}) {
  return (
    <SkeletonBlock
      className={`${sizeClassName} shrink-0 rounded-full ring-1 ${className}`}
    />
  );
}

function SkeletonStatCard() {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-[0.75rem] bg-white px-2.5 py-2 ring-1 ring-[#d6e2e8]">
      <div className="flex items-center gap-1.5">
        <SkeletonIcon sizeClassName="h-6 w-6" />
        <SkeletonBlock className="h-2.5 w-20 rounded-full bg-[#d6e2e8]" />
      </div>
      <SkeletonBlock className="mt-1.5 h-4 w-28 max-w-full rounded-full bg-[#cfd9de]" />
    </div>
  );
}

function SkeletonFactList() {
  return (
    <div className="overflow-hidden rounded-[0.8rem] bg-white ring-1 ring-[#d6e2e8]">
      {factRows.map((item, index) => (
        <div
          key={`${item.value}-${index}`}
          className={`grid gap-2 px-2.5 py-2 sm:grid-cols-[minmax(8.25rem,0.58fr)_minmax(0,1fr)] sm:items-center ${
            index > 0 ? "border-t border-[#d6e2e8]" : ""
          } ${item.row}`}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <SkeletonIcon sizeClassName="h-6 w-6" />
            <SkeletonBlock className="h-2.5 w-24 rounded-full bg-[#d6e2e8]" />
          </div>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <SkeletonBlock
              className={`h-4 ${item.value} max-w-full rounded-full bg-[#cfd9de]`}
            />
            <SkeletonBlock className="h-6 w-6 shrink-0 rounded-full bg-white ring-1 ring-[#d6e2e8]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfileSectionSkeleton({
  children,
  titleWidth = "w-36",
}: {
  children: ReactNode;
  titleWidth?: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-[1.25rem] border border-[#d6e2e8] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-3">
        <SkeletonIcon />
        <SkeletonBlock
          className={`h-6 ${titleWidth} max-w-full rounded-full bg-[#cfd9de]`}
        />
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function ProfileLoading() {
  const isAuthenticated = await hasSupabaseSessionCookie();

  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="min-h-screen bg-[var(--background)] pb-16 text-[#25302d] sm:pb-0"
    >
      <DesktopAppHeaderSkeleton
        actionWidths={actionButtonWidths}
        subtitleWidth="w-36"
      />
      {isAuthenticated ? (
        <MobileAppNavSkeleton />
      ) : (
        <MobilePublicHeaderSkeleton />
      )}

      <section className="mx-auto w-full max-w-[72rem] px-4 py-4 sm:px-6 lg:py-5">
        <div className="overflow-hidden rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-[#d6e2e8] sm:rounded-[1.35rem] sm:p-4 lg:p-0">
          <div className="grid grid-cols-[6.25rem_minmax(0,1fr)] gap-3 sm:grid-cols-[7.5rem_minmax(0,1fr)] lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] lg:gap-0 xl:grid-cols-[minmax(230px,300px)_minmax(0,1fr)]">
            <div className="min-w-0 lg:row-span-3 lg:bg-[#f7fbfc] lg:p-4 xl:p-5">
              <div className="relative aspect-square overflow-hidden rounded-[0.95rem] bg-[#f7f3ed] shadow-sm ring-1 ring-[#d6e2e8] sm:rounded-[1.05rem] lg:rounded-[1rem]">
                <SkeletonBlock className="h-full w-full bg-[#ece5dc]" />
                <div className="absolute right-1 top-1 rounded-full bg-[#c7d2d7] p-[3px] shadow-[0_5px_18px_rgba(37,48,45,0.12)] lg:right-2 lg:top-2">
                  <div className="rounded-full bg-white p-[2px]">
                    <SkeletonBlock className="h-7 w-7 rounded-full bg-[#dce5e9] sm:h-9 sm:w-9 lg:h-14 lg:w-14" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col justify-center gap-2 lg:justify-start lg:gap-3 lg:p-5 lg:pb-1 xl:p-6 xl:pb-1">
              <div className="relative">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 pr-20 lg:pr-24">
                    <SkeletonBlock className="h-6 w-16 rounded-full bg-[#e7f1f5] ring-1 ring-[#c7dce6] lg:h-7 lg:w-20" />
                  </div>
                  <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 lg:mt-3 lg:gap-3">
                    <SkeletonBlock className="h-7 w-44 max-w-full rounded-full bg-[#cfd9de] sm:h-9 sm:w-60 lg:h-12 lg:w-80 xl:h-14" />
                    <SkeletonBlock className="h-7 w-7 rounded-full bg-[#e7f1f5] ring-1 ring-[#c7dce6] lg:h-8 lg:w-8" />
                  </div>

                  <div className="mt-2 flex min-w-0 items-center gap-1.5 lg:mt-3 lg:gap-2">
                    <SkeletonIcon
                      className="bg-[#e7f1f4] ring-[#cbe3ec]"
                      sizeClassName="h-7 w-7 lg:h-8 lg:w-8"
                    />
                    <SkeletonBlock className="h-4 w-32 max-w-full rounded-full bg-[#d6e2e8] lg:h-5 lg:w-52" />
                    <SkeletonBlock className="h-6 w-6 rounded-full bg-white ring-1 ring-[#d6e2e8] lg:h-7 lg:w-7" />
                  </div>
                </div>

                <SkeletonBlock className="absolute right-0 top-0 h-3 w-12 rounded-full bg-[#d6e2e8] lg:h-4 lg:w-28" />
              </div>
            </div>

              <div className="col-span-2 flex flex-wrap items-center gap-2 pb-3 pt-1 sm:gap-3 sm:pb-4 lg:col-span-1 lg:col-start-2 lg:px-5 lg:pb-3 lg:pt-3 xl:px-6">
                {isAuthenticated ? (
                  <>
                    <SkeletonBlock className="h-10 w-24 rounded-full bg-[var(--pa-primary)] sm:w-32" />
                    <SkeletonBlock className="h-11 w-20 rounded-full bg-white ring-1 ring-black/10 sm:w-28" />
                    <SkeletonBlock className="h-10 w-[8.5rem] rounded-full border border-black/10 bg-white" />
                  </>
                ) : (
                  <>
                    <SkeletonBlock className="h-10 w-20 rounded-full bg-[var(--pa-primary)]" />
                    <SkeletonBlock className="h-10 w-36 rounded-full border border-black/10 bg-white" />
                  </>
                )}
              </div>

              <div className="col-span-2 rounded-[1rem] bg-white p-2.5 ring-1 ring-[#d6e2e8] sm:p-3 lg:col-span-1 lg:col-start-2 lg:mx-5 lg:mb-5 lg:rounded-none lg:p-0 lg:ring-0 xl:mx-6">
                <div className="grid grid-cols-2 gap-1.5 lg:hidden">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className="rounded-[0.78rem] bg-[#f8fbfc] px-2.5 py-2 ring-1 ring-[#d6e2e8]"
                    >
                      <div className="flex items-center gap-1.5">
                        <SkeletonBlock className="h-5 w-5 rounded-full bg-[#e7f1f4] ring-1 ring-[#cbe3ec]" />
                        <SkeletonBlock className="h-2.5 w-16 rounded-full bg-[#d6e2e8]" />
                      </div>
                      <SkeletonBlock className="mt-2 h-4 w-20 max-w-full rounded-full bg-[#cfd9de]" />
                    </div>
                  ))}
                </div>
                <div className="hidden lg:block">
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <SkeletonStatCard key={index} />
                    ))}
                  </div>
                  <div className="mt-2">
                    <SkeletonFactList />
                  </div>
                </div>
              </div>
          </div>
        </div>

        <div className="mt-4">
          <ProfileSectionSkeleton>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <SkeletonBlock
                  key={index}
                  className="aspect-square rounded-[0.85rem] bg-[#f7f3ed] shadow-sm ring-1 ring-[#d6e2e8]"
                />
              ))}
            </div>
          </ProfileSectionSkeleton>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ProfileSectionSkeleton titleWidth="w-44">
            <div className="space-y-3">
              <SkeletonBlock className="h-4 w-full rounded-full bg-[#d6e2e8]" />
              <SkeletonBlock className="h-4 w-11/12 rounded-full bg-[#d6e2e8]" />
              <SkeletonBlock className="h-4 w-2/3 rounded-full bg-[#d6e2e8]" />
            </div>
          </ProfileSectionSkeleton>

          <ProfileSectionSkeleton titleWidth="w-52">
            <div className="grid gap-3">
              <div className="rounded-[0.95rem] bg-white px-3 py-3 ring-1 ring-[#d6e2e8]">
                <SkeletonBlock className="h-3 w-32 rounded-full bg-[#d6e2e8]" />
                <div className="mt-3 space-y-2">
                  <SkeletonBlock className="h-4 w-full rounded-full bg-[#d6e2e8]" />
                  <SkeletonBlock className="h-4 w-4/5 rounded-full bg-[#d6e2e8]" />
                </div>
              </div>
              <SkeletonFactList />
            </div>
          </ProfileSectionSkeleton>
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
