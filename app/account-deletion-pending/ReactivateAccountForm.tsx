"use client";

import { useFormStatus } from "react-dom";

type ReactivateAccountFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  reactivateLabel: string;
  reactivatingLabel: string;
};

function ReactivateAccountButton({
  reactivateLabel,
  reactivatingLabel,
}: {
  reactivateLabel: string;
  reactivatingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--pa-primary)] px-6 text-sm font-black text-[var(--pa-primary-ink)] shadow-sm transition hover:bg-[var(--pa-primary-hover)] disabled:cursor-wait disabled:opacity-75"
    >
      {pending ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
        />
      ) : null}
      <span>{pending ? reactivatingLabel : reactivateLabel}</span>
    </button>
  );
}

export function ReactivateAccountForm({
  action,
  reactivateLabel,
  reactivatingLabel,
}: ReactivateAccountFormProps) {
  return (
    <form action={action}>
      <ReactivateAccountButton
        reactivateLabel={reactivateLabel}
        reactivatingLabel={reactivatingLabel}
      />
    </form>
  );
}
