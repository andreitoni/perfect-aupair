import "server-only";

import { createHash } from "node:crypto";

export type ProfileContentVersionSource = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  bio?: string | null;
  childcare_experience?: string | null;
  children_info?: string | null;
  accommodation_info?: string | null;
  expectations?: string | null;
};

function lengthPrefixed(value: string | null | undefined) {
  const normalized = value ?? "";

  return `${Buffer.byteLength(normalized, "utf8")}:${normalized}`;
}

export function getProfileContentVersion(
  profile: ProfileContentVersionSource,
  photoStoragePaths: readonly string[],
) {
  const orderedPhotoStoragePaths = [...photoStoragePaths].sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
  );
  const serialized = [
    profile.full_name,
    profile.first_name,
    profile.last_name,
    profile.bio,
    profile.childcare_experience,
    profile.children_info,
    profile.accommodation_info,
    profile.expectations,
    ...orderedPhotoStoragePaths,
  ]
    .map(lengthPrefixed)
    .join("");

  return createHash("sha256").update(serialized, "utf8").digest("hex");
}
