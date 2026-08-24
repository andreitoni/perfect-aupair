import Link from "next/link";
import {
  getProfileCardImageSrcSet,
  getProfilePhotoVariantUrl,
} from "@/lib/images/optimization";
import { getProfilePhotoUrl } from "@/lib/profile/photos";
import { loadBoundedPublicProfileCards } from "@/lib/profile/public-catalog";
import { createClient } from "@/lib/supabase/server";
import {
  formatCountryName,
  formatLanguageName,
  formatStartWindow,
} from "@/lib/i18n/translations";
import { languageOptions } from "@/lib/profile-options";
import { formatCatalogResultCount } from "@/lib/search/catalog-ui";

type FeaturedAuPair = {
  id: string;
  public_slug: string | null;
  account_type: "au_pair" | "family";
  full_name: string | null;
  first_name?: string | null;
  age?: number | null;
  gender?: string | null;
  country: string | null;
  city: string | null;
  availability_start_from?: string | null;
  availability_start_to?: string | null;
  primary_photo_path?: string | null;
};

function firstName(profile: FeaturedAuPair) {
  return (
    profile.first_name?.trim() ||
    profile.full_name?.trim().split(/\s+/)[0] ||
    "Au-pair"
  );
}

function availabilityMonthOptions() {
  const now = new Date();

  return Array.from({ length: 12 }, (_, offset) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));

    return {
      label: new Intl.DateTimeFormat("de-DE", {
        month: "long",
        timeZone: "UTC",
        year: "numeric",
      }).format(date),
      value: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
    };
  });
}

export async function GermanAuPairCatalogPreview() {
  const [catalog, supabase] = await Promise.all([
    loadBoundedPublicProfileCards<FeaturedAuPair>({
      accountType: "au_pair",
      filters: {
        gender: "female",
        ageMin: "18",
        ageMax: "24",
      },
      sort: "recently_active",
      pageSize: 3,
      includeCountries: true,
    }),
    createClient(),
  ]);
  const auPairs = catalog.data;
  const candidateCount = formatCatalogResultCount(
    catalog.totalItems,
    catalog.totalIsCapped,
  );
  const months = availabilityMonthOptions();

  if (catalog.error || auPairs.length === 0) return null;

  return (
    <section aria-labelledby="aktuelle-au-pair-profile">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="aktuelle-au-pair-profile"
            className="text-xl font-black text-[#25302d]"
          >
            Aktuelle Au-pair-Profile
          </h2>
          <p className="mt-2">
            Aktuell {candidateCount} Profile von Kandidatinnen zwischen 18 und
            24 Jahren. Suchen Sie direkt nach Herkunftsland, Sprache und
            Verfügbarkeit oder öffnen Sie den vollständigen Katalog.
          </p>
        </div>
        <Link
          href="/search-aupair"
          className="font-black text-[#25302d] underline"
        >
          Alle Au-pairs ansehen
        </Link>
      </div>

      <form
        action="/search-aupair"
        className="mt-4 grid gap-3 rounded-[1.15rem] bg-[#f4f8f8] p-4 ring-1 ring-[#d8e5e5] sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end"
      >
        <label className="text-sm font-black text-[#25302d]">
          Herkunftsland
          <select
            name="country"
            defaultValue=""
            className="mt-1 block min-h-11 w-full rounded-xl border border-[#cbd8dc] bg-white px-3 text-base font-semibold"
          >
            <option value="">Alle Länder</option>
            {catalog.countries.map((country) => (
              <option key={country} value={country}>
                {formatCountryName(country, "de")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-black text-[#25302d]">
          Sprache
          <select
            name="language"
            defaultValue=""
            className="mt-1 block min-h-11 w-full rounded-xl border border-[#cbd8dc] bg-white px-3 text-base font-semibold"
          >
            <option value="">Alle Sprachen</option>
            {languageOptions.map((language) => (
              <option key={language} value={language}>
                {formatLanguageName(language, "de")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-black text-[#25302d]">
          Verfügbar ab
          <select
            name="startFrom"
            defaultValue=""
            className="mt-1 block min-h-11 w-full rounded-xl border border-[#cbd8dc] bg-white px-3 text-base font-semibold"
          >
            <option value="">Jeder Starttermin</option>
            {months.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-full bg-[#25302d] px-5 text-sm font-black text-white transition hover:bg-[#35413e]"
        >
          Profile filtern
        </button>
      </form>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {auPairs.map((profile) => {
          const name = firstName(profile);
          const photoUrl = getProfilePhotoUrl(
            supabase,
            profile.primary_photo_path,
          );
          const photoSrc = photoUrl
            ? getProfilePhotoVariantUrl(photoUrl, 640)
            : null;
          const photoSrcSet = photoUrl
            ? getProfileCardImageSrcSet(photoUrl)
            : undefined;
          const location = [profile.city, formatCountryName(profile.country, "de")]
            .filter(Boolean)
            .join(", ");
          const availability = formatStartWindow(
            "de",
            profile.availability_start_from,
            profile.availability_start_to,
          );

          return (
            <Link
              key={profile.id}
              href={`/profile/${profile.public_slug ?? profile.id}`}
              className="overflow-hidden rounded-[1.15rem] bg-white ring-1 ring-[#d6dee4] transition hover:-translate-y-0.5 hover:shadow-sm"
            >
              <div className="relative aspect-[4/3] bg-[#edf3f4]">
                {photoSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element -- protected profile photos use the bounded same-origin transform route
                  <img
                    src={photoSrc}
                    srcSet={photoSrcSet}
                    alt={`Au-pair-Profil von ${name}`}
                    sizes="(min-width: 640px) 30vw, 100vw"
                    width={640}
                    height={640}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover object-[center_22%]"
                  />
                ) : null}
              </div>
              <div className="p-4">
                <h3 className="font-black text-[#25302d]">
                  {name}
                  {profile.age ? `, ${profile.age}` : ""}
                </h3>
                {location ? <p className="mt-1 text-xs">{location}</p> : null}
                <p className="mt-2 text-xs">
                  {availability || "Start nach Absprache"}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
