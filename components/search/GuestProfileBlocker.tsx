import Link from "next/link";
import { loginHref } from "@/lib/auth/return-to";

type GuestProfileBlockerProps = {
  title: string;
  text: string;
  cta: string;
  className?: string;
  returnTo?: string | null;
};

export function GuestProfileBlocker({
  title,
  text,
  cta,
  className,
  returnTo,
}: GuestProfileBlockerProps) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-[1.5rem] bg-[var(--pa-primary)] p-6 text-[var(--pa-primary-ink)] shadow-sm ring-1 ring-black/5 sm:rounded-[1.75rem]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-[var(--pa-accent)]" />
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#263f45]/55">
        Perfect AuPair
      </p>
      <h3 className="mt-3 text-2xl font-black tracking-[-0.04em]">
        {title}
      </h3>
      <p className="mt-3 text-sm font-semibold leading-6 text-[#263f45]/70">
        {text}
      </p>
      <Link
        href={loginHref(returnTo, "register")}
        prefetch={false}
        className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-white px-5 text-sm font-black text-[#25302d] shadow-sm transition hover:bg-[#f7f3ed]"
      >
        {cta}
      </Link>
    </div>
  );
}
