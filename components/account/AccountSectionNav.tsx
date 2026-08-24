"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export type AccountSectionNavItem = {
  href: string;
  label: string;
  external?: boolean;
};

type AccountSectionNavProps = {
  ariaLabel: string;
  items: AccountSectionNavItem[];
};

function getSectionId(href: string) {
  return href.startsWith("#") ? href.slice(1) : "";
}

function getCurrentHashTarget() {
  const hash = window.location.hash.slice(1);

  if (!hash) {
    return "";
  }

  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}

function replaceCurrentUrlWithoutHash() {
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
}

export function AccountSectionNav({ ariaLabel, items }: AccountSectionNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    const sectionIds = new Set(
      items
        .filter((item) => !item.external)
        .map((item) => getSectionId(item.href))
        .filter(Boolean),
    );

    const currentSectionId = getCurrentHashTarget();

    if (!sectionIds.has(currentSectionId)) {
      return;
    }

    const target = document.getElementById(currentSectionId);

    if (!target) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "auto", block: "start" });
      replaceCurrentUrlWithoutHash();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [items, pathname, search]);

  function scrollToSection(href: string) {
    const sectionId = getSectionId(href);
    const target = sectionId ? document.getElementById(sectionId) : null;

    if (!target) {
      return;
    }

    replaceCurrentUrlWithoutHash();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav
      aria-label={ariaLabel}
      className="pa-scrollbar-none mt-4 flex min-w-0 max-w-full gap-1 overflow-x-auto overscroll-x-contain border-t border-[#d6e2e8] pt-4 lg:flex-col lg:overflow-visible"
    >
      {items.map((item, index) => {
        const itemClassName = [
          "block shrink-0 whitespace-nowrap rounded-[0.65rem] px-3 py-2 text-left text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f8793] lg:w-full",
          index === 0
            ? "bg-[#e7f1f4] text-[#172426]"
            : "text-[#52666f] hover:bg-[#f4f8fa] hover:text-[#172426]",
        ].join(" ");

        return item.external ? (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className={itemClassName}
          >
            {item.label}
          </Link>
        ) : (
          <button
            key={item.href}
            type="button"
            className={itemClassName}
            onClick={() => scrollToSection(item.href)}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
