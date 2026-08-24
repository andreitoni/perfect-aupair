"use client";

import type { ComponentProps } from "react";
import { AdminLink } from "@/components/admin/AdminLink";
import { consumeAdminBack } from "@/components/admin/admin-client-history";
import { adminBackHref } from "@/lib/admin/navigation";
import { useRouter } from "next/navigation";

type AdminBackLinkProps = Omit<
  ComponentProps<typeof AdminLink>,
  "href" | "replace"
> & {
  returnTo?: string | string[] | null;
  trail?: string | string[] | null;
  fallbackHref: string;
};

export function AdminBackLink({
  returnTo,
  trail,
  fallbackHref,
  ...props
}: AdminBackLinkProps) {
  const router = useRouter();
  const href = adminBackHref(returnTo, trail, fallbackHref);

  return (
    <AdminLink
      {...props}
      href={href}
      onClick={(event) => {
        event.preventDefault();

        if (consumeAdminBack(href)) {
          router.back();
        } else {
          router.replace(href);
        }
      }}
    />
  );
}
