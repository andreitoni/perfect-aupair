"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkIcon } from "@/components/icons/BookmarkIcon";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { createClient } from "@/lib/supabase/client";

type SavedFavoriteToggleProps = {
  profileId: string;
  initialSaved: boolean;
};

export function SavedFavoriteToggle({
  profileId,
  initialSaved,
}: SavedFavoriteToggleProps) {
  const router = useRouter();
  const supabase = createClient();
  const t = useTranslations();

  const [isSaved, setIsSaved] = useState(initialSaved);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggleFavorite() {
    setError("");
    setIsBusy(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data, error: toggleError } = await supabase.rpc(
        "toggle_profile_favorite",
        {
          p_profile_id: profileId,
        },
      );

      if (toggleError) {
        setError(toggleError.message);
        return;
      }

      setIsSaved(Boolean(data));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        top: 16,
        zIndex: 50,
      }}
    >
      <button
        type="button"
        disabled={isBusy}
        onClick={toggleFavorite}
        aria-label={isSaved ? t("common.removeFromSaved") : t("common.saveProfile")}
        title={isSaved ? t("common.saved") : t("common.saveProfile")}
        style={{
          width: 52,
          height: 52,
          borderRadius: 999,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "rgba(255,255,255,0.96)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: isBusy ? "not-allowed" : "pointer",
          boxShadow: "0 10px 25px rgba(0,0,0,0.18)",
          opacity: isBusy ? 0.6 : 1,
        }}
      >
        <BookmarkIcon filled={isSaved} className="h-[26px] w-[26px] text-[#25302d]" />
      </button>

      {error ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 60,
            width: 220,
            borderRadius: 16,
            background: "#fff5f2",
            padding: 12,
            color: "#9d3f2f",
            fontSize: 12,
            fontWeight: 800,
            lineHeight: "18px",
            textAlign: "center",
            boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
            border: "1px solid rgba(217,95,73,0.2)",
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
