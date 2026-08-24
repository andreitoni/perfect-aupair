import { cookies } from "next/headers";

export function containsSupabaseSessionCookie(
  cookieEntries: ReadonlyArray<{ name: string }>,
) {
  return cookieEntries.some(({ name }) => {
    return name.startsWith("sb-") && name.includes("-auth-token");
  });
}

export async function hasSupabaseSessionCookie() {
  const cookieStore = await cookies();

  return containsSupabaseSessionCookie(cookieStore.getAll());
}
