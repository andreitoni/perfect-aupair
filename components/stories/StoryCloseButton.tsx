"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "@/components/i18n/I18nProvider";

type StoryCloseButtonProps = {
  fallbackHref: string;
};

export function StoryCloseButton({ fallbackHref }: StoryCloseButtonProps) {
  const router = useRouter();
  const t = useTranslations();

  return (
    <button
      type="button"
      onClick={() => {
        router.replace(fallbackHref);
      }}
      aria-label={t("stories.close")}
      style={{
        position: "absolute",
        right: "12px",
        top: "12px",
        zIndex: 50,
        width: "46px",
        height: "46px",
        borderRadius: "999px",
        background: "#fff",
        color: "#25302d",
        fontSize: "32px",
        fontWeight: 900,
        lineHeight: "36px",
        textAlign: "center",
        boxShadow: "0 12px 35px rgba(0,0,0,0.45)",
        border: "4px solid rgba(0,0,0,0.22)",
        cursor: "pointer",
      }}
    >
      ×
    </button>
  );
}
