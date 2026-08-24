"use client";

import Link from "next/link";
import { useState } from "react";
import { GuestProfileLoginPrompt } from "@/components/profile/GuestProfileLoginPrompt";

type SearchParams = Record<string, string | string[] | undefined>;

type ProfilePaginationProps = {
  basePath: string;
  currentPage: number;
  totalPages: number;
  searchParams?: SearchParams;
  labels: {
    previous: string;
    next: string;
    page: string;
    currentPage: string;
    pageOf: string;
  };
  lockPagesAfterFirst?: boolean;
  freePageCount?: number;
  guestPrompt?: {
    title: string;
    text: string;
  };
};

type PageItem = number | "ellipsis";

function pageItems(currentPage: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, 2, 3, totalPages, currentPage]);

  if (currentPage > 2) pages.add(currentPage - 1);
  if (currentPage < totalPages - 1) pages.add(currentPage + 1);

  const sortedPages = Array.from(pages).sort((first, second) => first - second);
  const items: PageItem[] = [];

  for (const page of sortedPages) {
    const previousPage = items[items.length - 1];

    if (
      typeof previousPage === "number" &&
      page - previousPage > 1
    ) {
      items.push("ellipsis");
    }

    items.push(page);
  }

  return items;
}

function pageHref(basePath: string, page: number, searchParams?: SearchParams) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (key === "page") continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) params.append(key, item);
      }
    } else if (value) {
      params.set(key, value);
    }
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();

  return query ? `${basePath}?${query}` : basePath;
}

export function ProfilePagination({
  basePath,
  currentPage,
  totalPages,
  searchParams,
  labels,
  lockPagesAfterFirst = false,
  freePageCount = 1,
  guestPrompt,
}: ProfilePaginationProps) {
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [promptReturnTo, setPromptReturnTo] = useState<string | null>(null);

  if (totalPages <= 1) return null;

  const isLockedPage = (page: number) =>
    lockPagesAfterFirst && page > freePageCount;
  const openPrompt = (returnTo: string) => {
    setPromptReturnTo(returnTo);
    setIsPromptOpen(true);
  };

  return (
    <>
      <nav
        className="mt-3 flex justify-center"
        aria-label={labels.page}
      >
        <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-full bg-white/85 px-2 py-1.5 shadow-sm ring-1 ring-[#d8e0e6]">
          {pageItems(currentPage, totalPages).map((item, index) => {
            if (item === "ellipsis") {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="inline-flex h-11 min-w-8 items-center justify-center text-sm font-black text-[#25302d]/55"
                >
                  ...
                </span>
              );
            }

            const isCurrent = item === currentPage;
            const className = `inline-flex h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm font-black transition ${
              isCurrent
                ? "bg-[var(--pa-primary)] text-[var(--pa-primary-ink)] shadow-sm ring-2 ring-[var(--pa-primary-focus-ring)]"
                : "bg-[#f2f4f7] text-[#25302d]/70 hover:bg-[#e7eef2]"
            }`;

            if (isLockedPage(item)) {
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() =>
                    openPrompt(pageHref(basePath, item, searchParams))
                  }
                  aria-current={isCurrent ? "page" : undefined}
                  aria-label={
                    isCurrent
                      ? labels.currentPage.replace("{page}", String(item))
                      : labels.page.replace("{page}", String(item))
                  }
                  className={className}
                >
                  {item}
                </button>
              );
            }

            return (
              <Link
                key={item}
                href={pageHref(basePath, item, searchParams)}
                prefetch={false}
                aria-current={isCurrent ? "page" : undefined}
                aria-label={
                  isCurrent
                    ? labels.currentPage.replace("{page}", String(item))
                    : labels.page.replace("{page}", String(item))
                }
                className={className}
              >
                {item}
              </Link>
            );
          })}
        </div>
      </nav>

      {isPromptOpen ? (
        <GuestProfileLoginPrompt
          title={guestPrompt?.title}
          text={guestPrompt?.text}
          returnTo={promptReturnTo}
          onClose={() => setIsPromptOpen(false)}
        />
      ) : null}
    </>
  );
}
