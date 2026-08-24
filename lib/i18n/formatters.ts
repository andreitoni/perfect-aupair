import type { LanguageCode } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/translations";

export function formatProfileBadge(
  type: "au_pair" | "family" | string | null | undefined,
  t: Translate,
) {
  return type === "family" ? t("common.family") : t("common.auPair");
}

export function formatProfileActivityStatus(
  status: string | null | undefined,
  t: Translate,
) {
  if (status === "active") return t("activity.active");
  if (status === "recently_active") return t("activity.recentlyActive");

  return null;
}

export function formatGeneratedFamilyDisplayName(name: string, t: Translate) {
  return t("format.family.generatedName", {
    name: name.trim(),
  });
}

export function formatFamilyDisplayName(
  value: string | null | undefined,
  t: Translate,
) {
  const name = value?.trim();

  if (!name) return null;

  const generatedNameMatch = name.match(/^The\s+(.+?)\s+family$/i);

  if (!generatedNameMatch) {
    return name;
  }

  return formatGeneratedFamilyDisplayName(generatedNameMatch[1], t);
}

export function formatFamilyStoryDisplayName(
  value: string | null | undefined,
  t: Translate,
) {
  const name = value?.trim();

  if (!name) return null;

  const generatedNameMatch = name.match(/^The\s+(.+?)\s+family$/i);

  if (!generatedNameMatch) {
    return name;
  }

  return t("format.family.storyGeneratedName", {
    name: generatedNameMatch[1].trim(),
  });
}

export function formatGender(
  value: string | null | undefined,
  t: Translate,
) {
  if (value === "female") return t("enum.gender.female");
  if (value === "male") return t("enum.gender.male");
  return null;
}

export function formatSmoking(
  value: string | null | undefined,
  t: Translate,
) {
  if (value === "non_smoker") return t("enum.smoking.nonSmoker");
  if (value === "smoker") return t("enum.smoking.smoker");
  return t("common.notSet");
}

const religionLabels: Record<string, Partial<Record<LanguageCode, string>>> = {
  Christianity: {
    en: "Christianity",
    it: "Cristianesimo",
    de: "Christentum",
    es: "Cristianismo",
    fr: "Christianisme",
    nl: "Christendom",
  },
  Islam: {
    en: "Islam",
    it: "Islam",
    de: "Islam",
    es: "Islam",
    fr: "Islam",
    nl: "Islam",
  },
  Hinduism: {
    en: "Hinduism",
    it: "Induismo",
    de: "Hinduismus",
    es: "Hinduismo",
    fr: "Hindouisme",
    nl: "Hindoeïsme",
  },
  Buddhism: {
    en: "Buddhism",
    it: "Buddismo",
    de: "Buddhismus",
    es: "Budismo",
    fr: "Bouddhisme",
    nl: "Boeddhisme",
  },
  Judaism: {
    en: "Judaism",
    it: "Ebraismo",
    de: "Judentum",
    es: "Judaísmo",
    fr: "Judaïsme",
    nl: "Jodendom",
  },
  Sikhism: {
    en: "Sikhism",
    it: "Sikhismo",
    de: "Sikhismus",
    es: "Sijismo",
    fr: "Sikhisme",
    nl: "Sikhisme",
  },
  "No religion": {
    en: "No religion",
    it: "Nessuna religione",
    de: "Keine Religion",
    es: "Sin religión",
    fr: "Aucune religion",
    nl: "Geen religie",
  },
  Other: {
    en: "Other",
    it: "Altro",
    de: "Andere",
    es: "Otra",
    fr: "Autre",
    nl: "Anders",
  },
  "Prefer not to say": {
    en: "Prefer not to say",
    it: "Preferisco non dirlo",
    de: "Möchte ich nicht angeben",
    es: "Prefiero no decirlo",
    fr: "Préfère ne pas répondre",
    nl: "Zeg ik liever niet",
  },
};

export function formatReligion(
  value: string | null | undefined,
  locale: LanguageCode,
) {
  if (!value) return null;

  return religionLabels[value]?.[locale] ?? religionLabels[value]?.en ?? value;
}

export function formatChildrenInfo(
  value: string | null | undefined,
  t: Translate,
) {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === "no children" || normalized === "0 children") {
    return t("enum.children.none");
  }
  if (normalized === "1 child") return t("enum.children.one");
  if (normalized === "3+ children") return t("enum.children.threePlus");

  const count = normalized.match(/^(\d+) children$/)?.[1];
  if (count) return t("enum.children.count", { count });

  return value;
}

const countryLabels: Record<string, Partial<Record<LanguageCode, string>>> = {
  Austria: {
    it: "Austria",
    de: "Österreich",
    es: "Austria",
    fr: "Autriche",
    nl: "Oostenrijk",
  },
  France: {
    it: "Francia",
    de: "Frankreich",
    es: "Francia",
    fr: "France",
    nl: "Frankrijk",
  },
  "United States": {
    it: "Stati Uniti",
    de: "Vereinigte Staaten",
    es: "Estados Unidos",
    fr: "États-Unis",
    nl: "Verenigde Staten",
  },
  Germany: {
    it: "Germania",
    de: "Deutschland",
    es: "Alemania",
    fr: "Allemagne",
    nl: "Duitsland",
  },
  Switzerland: {
    it: "Svizzera",
    de: "Schweiz",
    es: "Suiza",
    fr: "Suisse",
    nl: "Zwitserland",
  },
  "United Kingdom": {
    it: "Regno Unito",
    de: "Vereinigtes Königreich",
    es: "Reino Unido",
    fr: "Royaume-Uni",
    nl: "Verenigd Koninkrijk",
  },
  Romania: {
    it: "Romania",
    de: "Rumänien",
    es: "Rumanía",
    fr: "Roumanie",
    nl: "Roemenië",
  },
  Sweden: {
    it: "Svezia",
    de: "Schweden",
    es: "Suecia",
    fr: "Suède",
    nl: "Zweden",
  },
  Denmark: {
    it: "Danimarca",
    de: "Dänemark",
    es: "Dinamarca",
    fr: "Danemark",
    nl: "Denemarken",
  },
};

export function formatCountryName(
  value: string | null | undefined,
  locale: LanguageCode,
  t: Translate,
) {
  if (!value) return t("common.countryNotSet");
  return countryLabels[value]?.[locale] ?? value;
}

const languageLabels: Record<string, Partial<Record<LanguageCode, string>>> = {
  English: { it: "Inglese", de: "Englisch", es: "Inglés", fr: "Anglais", nl: "Engels" },
  German: { it: "Tedesco", de: "Deutsch", es: "Alemán", fr: "Allemand", nl: "Duits" },
  French: { it: "Francese", de: "Französisch", es: "Francés", fr: "Français", nl: "Frans" },
  Spanish: { it: "Spagnolo", de: "Spanisch", es: "Español", fr: "Espagnol", nl: "Spaans" },
  Italian: { it: "Italiano", de: "Italienisch", es: "Italiano", fr: "Italien", nl: "Italiaans" },
  Dutch: { it: "Olandese", de: "Niederländisch", es: "Neerlandés", fr: "Néerlandais", nl: "Nederlands" },
  Romanian: { it: "Rumeno", de: "Rumänisch", es: "Rumano", fr: "Roumain", nl: "Roemeens" },
};

export function formatLanguageName(
  value: string | null | undefined,
  locale: LanguageCode,
  t: Translate,
) {
  if (!value) return t("common.notSet");
  return languageLabels[value]?.[locale] ?? value;
}
