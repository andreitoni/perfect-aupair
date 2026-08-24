"use client";

import { recordAdminNavigation } from "@/components/admin/admin-client-history";
import NextLink from "next/link";
import type { ComponentProps } from "react";

type AdminLinkProps = ComponentProps<typeof NextLink>;

export function AdminLink(props: AdminLinkProps) {
  const { onClick, ...linkProps } = props;

  return (
    <NextLink
      {...linkProps}
      prefetch={false}
      onClick={(event) => {
        onClick?.(event);

        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.replace ||
          props.target === "_blank" ||
          typeof props.href !== "string"
        ) {
          return;
        }

        recordAdminNavigation(props.href);
      }}
    />
  );
}
