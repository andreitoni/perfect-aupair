import type { ProfileSearchSort } from "@/lib/profiles/pagination";
import {
  SearchSortControl,
  type SearchSortLabels,
} from "@/components/search/SearchSortControl";

type SearchResultsToolbarProps = {
  basePath: string;
  filters: Record<string, string | string[] | undefined>;
  resultSummary: string;
  sort: ProfileSearchSort;
  labels: SearchSortLabels;
};

export function SearchResultsToolbar({
  basePath,
  filters,
  labels,
  resultSummary,
  sort,
}: SearchResultsToolbarProps) {
  return (
    <div className="mb-4 hidden items-center justify-between gap-4 border-b border-[#d8e0e6] px-1 pb-4 lg:flex">
      <p className="min-w-0 truncate text-sm font-black text-[#25302d]/82">
        {resultSummary}
      </p>

      <SearchSortControl
        basePath={basePath}
        filters={filters}
        labels={labels}
        sort={sort}
      />
    </div>
  );
}
