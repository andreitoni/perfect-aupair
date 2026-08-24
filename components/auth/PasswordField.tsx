"use client";

import { useState, type ChangeEvent } from "react";
import { useTranslations } from "@/components/i18n/I18nProvider";

type PasswordFieldProps = {
  id: string;
  name: string;
  value?: string;
  defaultValue?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  autoComplete: string;
  className: string;
  dataErrorLabel?: string;
  disabled?: boolean;
  minLength?: number;
  required?: boolean;
};

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      >
        <path d="M3 3l18 18" />
        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
        <path d="M9.3 5.5A9.8 9.8 0 0 1 12 5c5 0 8.5 4.2 9.7 6a1.9 1.9 0 0 1 0 2c-.5.7-1.2 1.6-2.2 2.5" />
        <path d="M6.1 6.7C4.3 7.9 3 9.6 2.3 11a1.9 1.9 0 0 0 0 2C3.5 14.8 7 19 12 19a9.5 9.5 0 0 0 5.1-1.5" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
    >
      <path d="M2.3 11a1.9 1.9 0 0 0 0 2C3.5 14.8 7 19 12 19s8.5-4.2 9.7-6a1.9 1.9 0 0 0 0-2C20.5 9.2 17 5 12 5S3.5 9.2 2.3 11Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function PasswordField({
  id,
  name,
  value,
  defaultValue,
  onChange,
  autoComplete,
  className,
  dataErrorLabel,
  disabled,
  minLength,
  required,
}: PasswordFieldProps) {
  const t = useTranslations();
  const [visible, setVisible] = useState(false);
  const visibilityLabel = visible
    ? t("auth.hidePassword")
    : t("auth.showPassword");
  const visibilityButtonLabel = visible
    ? t("auth.hidePasswordControl")
    : t("auth.showPasswordControl");

  return (
    <div
      data-clarity-mask="true"
      data-hj-suppress=""
      className="relative"
    >
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        data-error-label={dataErrorLabel}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className={`${className} pr-12`}
      />
      <button
        type="button"
        aria-label={visibilityButtonLabel}
        title={visibilityLabel}
        onClick={() => setVisible((current) => !current)}
        onMouseDown={(event) => event.preventDefault()}
        disabled={disabled}
        className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#25302d]/50 transition hover:bg-black/5 hover:text-[#25302d] focus:outline-none focus:ring-2 focus:ring-[#6f8793]/30 disabled:cursor-wait disabled:opacity-50"
      >
        <PasswordVisibilityIcon visible={visible} />
      </button>
    </div>
  );
}
