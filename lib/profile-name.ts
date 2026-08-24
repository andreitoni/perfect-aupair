const INVISIBLE_NAME_CHARACTERS = /[\u200B-\u200D\uFEFF]/g;

function hasCasedLetters(value: string) {
  return [...value].some(
    (character) =>
      character.toLocaleLowerCase() !== character.toLocaleUpperCase(),
  );
}

function titleCaseName(value: string) {
  return value.replace(
    /(^|[\s'-])(\p{L})/gu,
    (_match, separator: string, letter: string) =>
      `${separator}${letter.toLocaleUpperCase()}`,
  );
}

/**
 * Normalizes accidental all-lowercase or Caps Lock person names while keeping
 * intentional mixed casing such as McDonald unchanged.
 */
export function normalizePersonName(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(INVISIBLE_NAME_CHARACTERS, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized || !hasCasedLetters(normalized)) {
    return normalized;
  }

  const lowerCased = normalized.toLocaleLowerCase();
  const upperCased = normalized.toLocaleUpperCase();

  if (normalized !== lowerCased && normalized !== upperCased) {
    return normalized;
  }

  return titleCaseName(lowerCased);
}

export function hasSuspiciousPersonNameCasing(value: string) {
  const normalized = normalizePersonName(value);
  const nameParts = normalized.match(/[\p{L}\p{M}]+/gu) ?? [];

  return nameParts.some((part) => {
    const casedCharacters = [...part].filter(
      (character) =>
        character.toLocaleLowerCase() !== character.toLocaleUpperCase(),
    );

    if (casedCharacters.length < 2) {
      return false;
    }

    const isAllUppercase = casedCharacters.every(
      (character) => character === character.toLocaleUpperCase(),
    );
    const internalUppercaseCount = casedCharacters
      .slice(1)
      .filter(
        (character) => character === character.toLocaleUpperCase(),
      ).length;

    return isAllUppercase || internalUppercaseCount >= 2;
  });
}
