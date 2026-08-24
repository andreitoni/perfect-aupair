"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/components/i18n/I18nProvider";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { ProfileActivityBadge } from "@/components/profile/ProfileActivityBadge";
import { ProfileVerificationBadge } from "@/components/profile/ProfileVerificationBadge";
import {
  getProfilePhotoVariantUrl,
  shouldBypassImageOptimization,
} from "@/lib/images/optimization";
import {
  formatCountryName,
  formatFamilyDisplayName,
} from "@/lib/i18n/formatters";
import type { LanguageCode } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/translations";
import {
  OPEN_PROFILE_DISCOVERY_SEARCH_EVENT,
  OPEN_PROFILE_DISCOVERY_SEARCH_ON_LOAD_KEY,
  type ProfileDiscoverySearchTargetType,
} from "@/lib/search/profile-discovery-events";

type SearchTargetType = ProfileDiscoverySearchTargetType;

type ProfileSearchResult = {
  id: string;
  publicSlug: string | null;
  accountType: SearchTargetType;
  fullName: string | null;
  firstName: string | null;
  age: number | null;
  city: string | null;
  country: string | null;
  photoUrl: string | null;
  activityStatus: string | null;
  verificationStatus: string | null;
  matchText: string | null;
};

export type ProfileDiscoverySearchLabels = {
  searchProfiles: string;
  placeholder: string;
  hint: string;
  startTyping: string;
  noResults: string;
  loading: string;
  lockedTitle: string;
  lockedText: string;
  login: string;
  register: string;
  close: string;
  openProfile: string;
  verified: string;
};

type ProfileDiscoverySearchProps = {
  isAuthenticated: boolean;
  targetType: SearchTargetType;
  locale: LanguageCode;
  labels: ProfileDiscoverySearchLabels;
  className?: string;
  showHint?: boolean;
};

const resultCache = new Map<string, ProfileSearchResult[]>();

function SearchIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
    >
      <path d="M12 21s7-5.3 7-12a7 7 0 0 0-14 0c0 6.7 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.4" />
    </svg>
  );
}

function getDisplayName(profile: ProfileSearchResult, t: Translate) {
  if (profile.accountType === "family") {
    return formatFamilyDisplayName(profile.fullName, t);
  }

  const name = profile.firstName?.trim() || profile.fullName?.trim();
  return name && profile.age ? `${name}, ${profile.age}` : name;
}

function getInitials(name: string | null | undefined) {
  const value = name?.trim();
  if (!value) return "PA";

  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function resultHref(profile: ProfileSearchResult) {
  return `/profile/${encodeURIComponent(profile.publicSlug ?? profile.id)}`;
}

async function fetchProfileResults({
  query,
  targetType,
  signal,
}: {
  query: string;
  targetType: SearchTargetType;
  signal: AbortSignal;
}) {
  const cacheKey = `${targetType}:${query.trim().toLocaleLowerCase()}`;
  const cached = resultCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const params = new URLSearchParams({
    q: query,
    target: targetType,
  });
  const response = await fetch(`/api/profile-search?${params.toString()}`, {
    signal,
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    results?: ProfileSearchResult[];
  };
  const results = payload.results ?? [];
  resultCache.set(cacheKey, results);

  return results;
}

export function ProfileDiscoverySearch({
  isAuthenticated,
  targetType,
  locale,
  labels,
  className,
  showHint = true,
}: ProfileDiscoverySearchProps) {
  const router = useRouter();
  const t = useTranslations();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const desktopInputRef = useRef<HTMLInputElement | null>(null);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalizedQuery = query.trim();
  const searchId = useId();

  function focusSearchInput() {
    window.setTimeout(() => {
      const isMobile = window.matchMedia("(max-width: 639px)").matches;
      const input = isMobile ? mobileInputRef.current : desktopInputRef.current;
      input?.focus();
    }, 0);
  }

  useEffect(() => {
    const requestedTarget = window.sessionStorage.getItem(
      OPEN_PROFILE_DISCOVERY_SEARCH_ON_LOAD_KEY,
    );
    const searchContainer = containerRef.current;

    if (
      requestedTarget === targetType &&
      searchContainer &&
      searchContainer.offsetParent !== null
    ) {
      const timeout = window.setTimeout(() => {
        const pendingTarget = window.sessionStorage.getItem(
          OPEN_PROFILE_DISCOVERY_SEARCH_ON_LOAD_KEY,
        );

        if (pendingTarget !== targetType) {
          return;
        }

        window.sessionStorage.removeItem(
          OPEN_PROFILE_DISCOVERY_SEARCH_ON_LOAD_KEY,
        );
        setIsOpen(true);
        focusSearchInput();
      }, 0);

      return () => {
        window.clearTimeout(timeout);
      };
    }
  }, [targetType]);

  useEffect(() => {
    function handleOpen(event: Event) {
      const detail = (event as CustomEvent<{ targetType?: SearchTargetType }>)
        .detail;

      if (
        (detail?.targetType && detail.targetType !== targetType) ||
        !containerRef.current ||
        containerRef.current.offsetParent === null
      ) {
        return;
      }

      setIsOpen(true);
      focusSearchInput();
    }

    window.addEventListener(OPEN_PROFILE_DISCOVERY_SEARCH_EVENT, handleOpen);

    return () => {
      window.removeEventListener(
        OPEN_PROFILE_DISCOVERY_SEARCH_EVENT,
        handleOpen,
      );
    };
  }, [targetType]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isAuthenticated || normalizedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);

      try {
        const nextResults = await fetchProfileResults({
          query: normalizedQuery,
          targetType,
          signal: controller.signal,
        });

        setResults(nextResults);
        setActiveIndex(nextResults.length > 0 ? 0 : -1);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setActiveIndex(-1);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 280);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isAuthenticated, normalizedQuery, targetType]);

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    setIsOpen(true);

    if (nextQuery.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setActiveIndex(-1);
    }
  }

  function openResult(profile: ProfileSearchResult) {
    setIsOpen(false);
    setActiveIndex(-1);
    router.push(resultHref(profile));
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && (event.key === "ArrowDown" || event.key === "Enter")) {
      setIsOpen(true);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        results.length === 0 ? -1 : Math.min(current + 1, results.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        results.length === 0 ? -1 : Math.max(current - 1, 0),
      );
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const profile = results[activeIndex];

      if (profile) {
        openResult(profile);
      }
    }
  }

  const panelVisible = isOpen;

  return (
    <div
      ref={containerRef}
      className={["relative z-30 min-w-0", className].filter(Boolean).join(" ")}
    >
      <label
        className={[
          "group hidden h-12 min-w-0 items-center gap-3 rounded-full bg-white px-4 text-[#25302d] shadow-sm ring-1 ring-[#d8e0e6] transition focus-within:ring-2 focus-within:ring-[var(--pa-primary)] sm:flex",
          isAuthenticated
            ? "cursor-text hover:ring-[#c3d0d6]"
            : "cursor-pointer hover:bg-[#f8fafb]",
        ].join(" ")}
        onClick={() => {
          setIsOpen(true);
          desktopInputRef.current?.focus();
        }}
      >
        <SearchIcon className="h-5 w-5 shrink-0 text-[#45636f]" />
        <input
          ref={desktopInputRef}
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleInputKeyDown}
          disabled={!isAuthenticated}
          role="combobox"
          aria-expanded={panelVisible}
          aria-controls={`${searchId}-listbox`}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 && results[activeIndex]
              ? `${searchId}-option-${results[activeIndex].id}`
              : undefined
          }
          autoComplete="off"
          inputMode="search"
          aria-label={labels.searchProfiles}
          placeholder={
            isAuthenticated ? labels.placeholder : labels.lockedTitle
          }
          className="min-w-0 flex-1 bg-transparent text-base font-bold outline-none placeholder:text-[#25302d]/35 disabled:cursor-pointer"
        />
        {loading ? (
          <span
            aria-label={labels.loading}
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#7da8b6] border-t-transparent"
          />
        ) : null}
      </label>

      {showHint ? (
        <p className="mt-2 hidden px-4 text-xs font-bold leading-5 text-[#25302d]/48 sm:block">
          {isAuthenticated ? labels.hint : labels.lockedText}
        </p>
      ) : null}

      {panelVisible ? (
        <div
          id={`${searchId}-results`}
          className="fixed inset-x-2 top-2 z-50 overflow-hidden rounded-[1.25rem] bg-white text-[#25302d] shadow-2xl ring-1 ring-black/10 sm:absolute sm:left-0 sm:right-0 sm:top-[3.35rem] sm:z-auto"
        >
          <div className="border-b border-black/10 p-2 sm:hidden">
            <label className="flex h-11 min-w-0 items-center gap-2 rounded-full bg-[#f4f7f8] px-3 text-[#25302d] ring-1 ring-[#d8e0e6] focus-within:ring-2 focus-within:ring-[var(--pa-primary)]">
              <SearchIcon className="h-5 w-5 shrink-0 text-[#101817]" />
              <input
                ref={mobileInputRef}
                value={query}
                onChange={handleInputChange}
                onFocus={() => setIsOpen(true)}
                onKeyDown={handleInputKeyDown}
                disabled={!isAuthenticated}
                role="combobox"
                aria-expanded={panelVisible}
                aria-controls={`${searchId}-listbox`}
                aria-autocomplete="list"
                aria-activedescendant={
                  activeIndex >= 0 && results[activeIndex]
                    ? `${searchId}-option-${results[activeIndex].id}`
                    : undefined
                }
                autoComplete="off"
                inputMode="search"
                aria-label={labels.searchProfiles}
                placeholder={
                  isAuthenticated ? labels.placeholder : labels.lockedTitle
                }
                className="min-w-0 flex-1 bg-transparent text-base font-bold outline-none placeholder:text-[#25302d]/35 disabled:cursor-pointer"
              />
              <button
                type="button"
                aria-label={labels.close}
                onClick={() => {
                  setIsOpen(false);
                  setActiveIndex(-1);
                }}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-black leading-none text-[#101817] hover:bg-white"
              >
                x
              </button>
            </label>
          </div>
          {!isAuthenticated ? (
            <div className="p-4">
              <p className="text-sm font-black">{labels.lockedTitle}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#25302d]/70">
                {labels.lockedText}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link
                  href="/login?mode=login"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-[#9faeb8] bg-white px-4 text-sm font-black text-[#25302d]"
                >
                  {labels.login}
                </Link>
                <Link
                  href="/login?mode=register"
                  className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--pa-primary)] px-4 text-sm font-black text-[var(--pa-primary-ink)]"
                >
                  {labels.register}
                </Link>
              </div>
            </div>
          ) : loading ? (
            <p role="status" aria-live="polite" className="p-4 text-sm font-semibold text-[#25302d]/70">
              {labels.loading}
            </p>
          ) : normalizedQuery.length >= 2 ? (
            results.length > 0 ? (
              <div
                id={`${searchId}-listbox`}
                role="listbox"
                aria-label={labels.searchProfiles}
                className="max-h-[min(70vh,28rem)] overflow-y-auto p-2"
              >
                {results.map((profile, index) => {
                  const displayName =
                    getDisplayName(profile, t) ?? labels.openProfile;
                  const active = index === activeIndex;

                  return (
                    <button
                      key={profile.id}
                      id={`${searchId}-option-${profile.id}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => openResult(profile)}
                      className={[
                        "flex w-full min-w-0 items-center gap-3 rounded-[1rem] p-3 text-left transition",
                        active ? "bg-[#edf6f9]" : "hover:bg-[#f5f8f9]",
                      ].join(" ")}
                    >
                      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[0.85rem] bg-[#e9eef2]">
                        {profile.photoUrl ? (
                          <Image
                            src={getProfilePhotoVariantUrl(
                              profile.photoUrl,
                              96,
                            )}
                            alt=""
                            width={48}
                            height={48}
                            unoptimized={shouldBypassImageOptimization(
                              getProfilePhotoVariantUrl(profile.photoUrl, 96),
                            )}
                            draggable={false}
                            className="pa-protected-media h-full w-full object-cover object-[center_22%]"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-sm font-black text-[#25302d]/25">
                            {getInitials(displayName)}
                          </span>
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-black leading-5">
                            {displayName}
                          </span>
                          <ProfileVerificationBadge
                            status={profile.verificationStatus}
                            label={labels.verified}
                            compact
                            iconOnly
                            className="shrink-0"
                          />
                        </span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-[#25302d]/70">
                          <PinIcon />
                          <span className="truncate">
                            {profile.city ? `${profile.city}, ` : ""}
                            {formatCountryName(profile.country, locale, t)}
                          </span>
                        </span>
                        {profile.matchText ? (
                          <span className="mt-1 block truncate text-[0.72rem] font-bold text-[var(--pa-primary)]">
                            {profile.matchText}
                          </span>
                        ) : null}
                      </span>

                      <ProfileActivityBadge
                        status={profile.activityStatus}
                        t={t}
                        className="hidden shrink-0 px-2 py-1 text-[0.65rem] shadow-none sm:inline-flex"
                      />
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="p-4 text-sm font-semibold text-[#25302d]/70">
                {labels.noResults}
              </p>
            )
          ) : (
            <p className="p-4 text-sm font-semibold text-[#25302d]/70">
              {labels.startTyping}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
