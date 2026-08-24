import type {
  Dictionary,
  I18nKey,
  Translate,
  TranslationValues,
} from "@/lib/i18n/translations";

function interpolate(template: string, values: TranslationValues = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

export function createDictionaryTranslator(dictionary: Dictionary): Translate {
  return (key, values) => interpolate(dictionary[key], values);
}

export function hasDictionaryKey(
  dictionary: Dictionary,
  value: string,
): value is I18nKey {
  return Object.prototype.hasOwnProperty.call(dictionary, value);
}
