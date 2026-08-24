import { SearchPageLoading } from "@/components/search/SearchPageLoading";
import { hasSupabaseSessionCookie } from "@/lib/supabase/has-session-cookie";

export default async function Loading() {
  return (
    <SearchPageLoading isAuthenticated={await hasSupabaseSessionCookie()} />
  );
}
