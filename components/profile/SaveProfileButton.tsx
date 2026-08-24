"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkIcon } from "@/components/icons/BookmarkIcon";
import { useTranslations } from "@/components/i18n/I18nProvider";

type SaveProfileButtonProps = {
  profileId: string;
  initialSaved: boolean;
  variant?: "default" | "compact" | "inline";
  refreshOnToggle?: boolean;
};

export function SaveProfileButton({
  profileId,
  initialSaved,
  variant = "default",
  refreshOnToggle = true,
}: SaveProfileButtonProps) {
  const t = useTranslations();
  const router = useRouter();

  const [isSaved, setIsSaved] = useState(initialSaved);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggleSaved() {
    setError("");
    setIsBusy(true);

    try {
      const response = await fetch("/api/profile-favorites/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profileId }),
      });
      const data = (await response.json().catch(() => null)) as
        | { saved?: boolean; error?: string }
        | null;

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (!response.ok) {
        setError(data?.error ?? t("common.errorTryAgain"));
        return;
      }

      setIsSaved(Boolean(data?.saved));

      if (refreshOnToggle) {
        router.refresh();
      }
    } catch {
      setError(t("common.errorTryAgain"));
    } finally {
      setIsBusy(false);
    }
  }

  if (variant === "compact") {
    return (
      <div className="relative">
        <button
          type="button"
          disabled={isBusy}
          onClick={toggleSaved}
          aria-label={
            isSaved ? t("common.removeFromSaved") : t("common.saveProfile")
          }
          title={isSaved ? t("common.saved") : t("common.saveProfile")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.55rem] bg-white text-[#25302d] transition hover:bg-[#f2f6f8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <BookmarkIcon filled={isSaved} className="h-[24px] w-[24px]" />
        </button>

        {error ? (
          <p className="absolute right-0 top-14 z-20 w-56 rounded-2xl bg-[#fff5f2] p-3 text-center text-xs font-bold leading-5 text-[#9d3f2f] shadow-sm ring-1 ring-[#d95f49]/20">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className="relative">
        <button
          type="button"
          disabled={isBusy}
          onClick={toggleSaved}
          aria-label={
            isSaved ? t("common.removeFromSaved") : t("common.saveProfile")
          }
          title={isSaved ? t("common.saved") : t("common.saveProfile")}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-black/10 bg-white px-3 text-center text-xs font-bold leading-none text-[#25302d] transition hover:bg-[#f7f3ed] disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm"
        >
          <BookmarkIcon filled={isSaved} className="h-5 w-5" />
          <span>{isSaved ? t("common.saved") : t("common.save")}</span>
        </button>

        {error ? (
          <p className="absolute right-0 top-12 z-20 w-56 rounded-2xl bg-[#fff5f2] p-3 text-center text-xs font-bold leading-5 text-[#9d3f2f] shadow-sm ring-1 ring-[#d95f49]/20">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative flex w-[64px] flex-col items-center gap-1">
      <button
        type="button"
        disabled={isBusy}
        onClick={toggleSaved}
        aria-label={
          isSaved ? t("common.removeFromSaved") : t("common.saveProfile")
        }
        title={isSaved ? t("common.saved") : t("common.saveProfile")}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/10 transition hover:bg-[#f7f3ed] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <BookmarkIcon filled={isSaved} className="h-[26px] w-[26px]" />
      </button>

      <p className="h-4 text-center text-xs font-bold leading-4 text-[#25302d]/70">
        {isSaved ? t("common.saved") : t("common.save")}
      </p>

      {error ? (
        <p className="absolute left-1/2 top-[4.25rem] z-20 w-56 -translate-x-1/2 rounded-2xl bg-[#fff5f2] p-3 text-center text-xs font-bold leading-5 text-[#9d3f2f] shadow-sm ring-1 ring-[#d95f49]/20">
          {error}
        </p>
      ) : null}
    </div>
  );
}
