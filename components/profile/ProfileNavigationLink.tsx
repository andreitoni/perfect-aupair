"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

type ProfileNavigationLinkProps = ComponentProps<typeof Link>;

export function ProfileNavigationLink({
  prefetch = false,
  scroll = false,
  ...props
}: ProfileNavigationLinkProps) {
  return <Link {...props} prefetch={prefetch} scroll={scroll} />;
}
