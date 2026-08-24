"use client";

import { useState } from "react";
import { useTranslations } from "@/components/i18n/I18nProvider";
import { GuestProfileLoginPrompt } from "@/components/profile/GuestProfileLoginPrompt";
import { GuestProfileBlocker } from "@/components/search/GuestProfileBlocker";

type GuestProfileAccessPromptProps = {
  autoOpen?: boolean;
  className?: string;
  returnTo?: string | null;
};

export function GuestProfileAccessPrompt({
  autoOpen = false,
  className,
  returnTo,
}: GuestProfileAccessPromptProps) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(autoOpen);

  return (
    <>
      <GuestProfileBlocker
        title={t("profileGuestPrompt.title")}
        text={t("profiles.loginBlockerText")}
        cta={t("profiles.loginBlockerCta")}
        className={className}
        returnTo={returnTo}
      />

      {isOpen ? (
        <GuestProfileLoginPrompt
          title={t("profileGuestPrompt.title")}
          text={t("profiles.loginBlockerText")}
          returnTo={returnTo}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </>
  );
}
