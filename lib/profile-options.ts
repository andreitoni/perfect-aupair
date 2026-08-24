export type PhoneCountryCodeOption = {
  value: string;
  label: string;
};

const countryCodes = [
  "AF", "AX", "AL", "DZ", "AS", "AD", "AO", "AI", "AQ", "AG", "AR", "AM",
  "AW", "AU", "AT", "AZ", "BS", "BH", "BD", "BB", "BY", "BE", "BZ", "BJ",
  "BM", "BT", "BO", "BQ", "BA", "BW", "BV", "BR", "IO", "BN", "BG", "BF",
  "BI", "CV", "KH", "CM", "CA", "KY", "CF", "TD", "CL", "CN", "CX", "CC",
  "CO", "KM", "CG", "CD", "CK", "CR", "CI", "HR", "CU", "CW", "CY", "CZ",
  "DK", "DJ", "DM", "DO", "EC", "EG", "SV", "GQ", "ER", "EE", "SZ", "ET",
  "FK", "FO", "FJ", "FI", "FR", "GF", "PF", "TF", "GA", "GM", "GE", "DE",
  "GH", "GI", "GR", "GL", "GD", "GP", "GU", "GT", "GG", "GN", "GW", "GY",
  "HT", "HM", "VA", "HN", "HK", "HU", "IS", "IN", "ID", "IR", "IQ", "IE",
  "IM", "IL", "IT", "JM", "JP", "JE", "JO", "KZ", "KE", "KI", "KP", "KR",
  "KW", "KG", "LA", "LV", "LB", "LS", "LR", "LY", "LI", "LT", "LU", "MO",
  "MG", "MW", "MY", "MV", "ML", "MT", "MH", "MQ", "MR", "MU", "YT", "MX",
  "FM", "MD", "MC", "MN", "ME", "MS", "MA", "MZ", "MM", "NA", "NR", "NP",
  "NL", "NC", "NZ", "NI", "NE", "NG", "NU", "NF", "MK", "MP", "NO", "OM",
  "PK", "PW", "PS", "PA", "PG", "PY", "PE", "PH", "PN", "PL", "PT", "PR",
  "QA", "RE", "RO", "RU", "RW", "BL", "SH", "KN", "LC", "MF", "PM", "VC",
  "WS", "SM", "ST", "SA", "SN", "RS", "SC", "SL", "SG", "SX", "SK", "SI",
  "SB", "SO", "ZA", "GS", "SS", "ES", "LK", "SD", "SR", "SJ", "SE", "CH",
  "SY", "TW", "TJ", "TZ", "TH", "TL", "TG", "TK", "TO", "TT", "TN", "TR",
  "TM", "TC", "TV", "UG", "UA", "AE", "GB", "US", "UM", "UY", "UZ", "VU",
  "VE", "VN", "VG", "VI", "WF", "EH", "YE", "ZM", "ZW"
];

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export const countries = countryCodes
  .map((code) => regionNames.of(code))
  .filter((country): country is string => Boolean(country));

export const nationalities = countries;

const countryNameToCode = new Map(
  countryCodes
    .map((code) => {
      const country = regionNames.of(code);
      return country ? ([country, code] as const) : null;
    })
    .filter((entry): entry is readonly [string, string] => Boolean(entry)),
);

const countryCodeAliases: Record<string, string> = {
  "Aland Islands": "AX",
  "Åland Islands": "AX",
  "Czech Republic": "CZ",
  "United States of America": "US",
};

function flagEmojiFromCountryCode(code: string) {
  return code
    .toUpperCase()
    .replace(/./g, (char) =>
      String.fromCodePoint(127397 + char.charCodeAt(0)),
    );
}

export function getCountryFlagEmoji(country: string | null | undefined) {
  const normalizedCountry = country?.trim();

  if (!normalizedCountry) return null;

  const countryCode =
    countryNameToCode.get(normalizedCountry) ??
    countryCodeAliases[normalizedCountry];

  return countryCode ? flagEmojiFromCountryCode(countryCode) : null;
}

export const languageOptions = [
  "Afrikaans",
  "Albanian",
  "Amharic",
  "Arabic",
  "Armenian",
  "Assamese",
  "Azerbaijani",
  "Basque",
  "Belarusian",
  "Bengali",
  "Bosnian",
  "Bulgarian",
  "Burmese",
  "Catalan",
  "Cebuano",
  "Chinese",
  "Croatian",
  "Czech",
  "Danish",
  "Dutch",
  "English",
  "Estonian",
  "Farsi",
  "Filipino",
  "Finnish",
  "French",
  "Georgian",
  "German",
  "Greek",
  "Gujarati",
  "Haitian Creole",
  "Hausa",
  "Hebrew",
  "Hindi",
  "Hungarian",
  "Icelandic",
  "Igbo",
  "Indonesian",
  "Irish",
  "Italian",
  "Japanese",
  "Kannada",
  "Kazakh",
  "Khmer",
  "Kinyarwanda",
  "Korean",
  "Kurdish",
  "Kyrgyz",
  "Lao",
  "Latvian",
  "Lithuanian",
  "Macedonian",
  "Malagasy",
  "Malay",
  "Malayalam",
  "Marathi",
  "Mongolian",
  "Nepali",
  "Norwegian",
  "Pashto",
  "Polish",
  "Portuguese",
  "Punjabi",
  "Romanian",
  "Russian",
  "Serbian",
  "Sinhala",
  "Slovak",
  "Slovenian",
  "Somali",
  "Spanish",
  "Swahili",
  "Swedish",
  "Tamil",
  "Telugu",
  "Thai",
  "Turkish",
  "Ukrainian",
  "Urdu",
  "Uzbek",
  "Vietnamese",
  "Yoruba",
  "Zulu"
];

// Unique calling codes are stable international metadata. Keeping the
// precomputed values avoids shipping the full libphonenumber metadata to every
// registration/onboarding browser just to build this select.
const phoneCallingCodes = [
  "+1", "+7", "+20", "+27", "+30", "+31", "+32", "+33", "+34", "+36",
  "+39", "+40", "+41", "+43", "+44", "+45", "+46", "+47", "+48", "+49",
  "+51", "+52", "+53", "+54", "+55", "+56", "+57", "+58", "+60", "+61",
  "+62", "+63", "+64", "+65", "+66", "+81", "+82", "+84", "+86", "+90",
  "+91", "+92", "+93", "+94", "+95", "+98", "+211", "+212", "+213",
  "+216", "+218", "+220", "+221", "+222", "+223", "+224", "+225", "+226",
  "+227", "+228", "+229", "+230", "+231", "+232", "+233", "+234", "+235",
  "+236", "+237", "+238", "+239", "+240", "+241", "+242", "+243", "+244",
  "+245", "+246", "+247", "+248", "+249", "+250", "+251", "+252", "+253",
  "+254", "+255", "+256", "+257", "+258", "+260", "+261", "+262", "+263",
  "+264", "+265", "+266", "+267", "+268", "+269", "+290", "+291", "+297",
  "+298", "+299", "+350", "+351", "+352", "+353", "+354", "+355", "+356",
  "+357", "+358", "+359", "+370", "+371", "+372", "+373", "+374", "+375",
  "+376", "+377", "+378", "+380", "+381", "+382", "+383", "+385", "+386",
  "+387", "+389", "+420", "+421", "+423", "+500", "+501", "+502", "+503",
  "+504", "+505", "+506", "+507", "+508", "+509", "+590", "+591", "+592",
  "+593", "+594", "+595", "+596", "+597", "+598", "+599", "+670", "+672",
  "+673", "+674", "+675", "+676", "+677", "+678", "+679", "+680", "+681",
  "+682", "+683", "+685", "+686", "+687", "+688", "+689", "+690", "+691",
  "+692", "+850", "+852", "+853", "+855", "+856", "+880", "+886", "+960",
  "+961", "+962", "+963", "+964", "+965", "+966", "+967", "+968", "+970",
  "+971", "+972", "+973", "+974", "+975", "+976", "+977", "+992", "+993",
  "+994", "+995", "+996", "+998",
] as const;

export const phoneCountryCodes: PhoneCountryCodeOption[] = phoneCallingCodes.map(
  (code) => ({
    value: code,
    label: code,
  }),
);

export const phoneCountryCodeValues = phoneCountryCodes.map(
  (option) => option.value,
);

export const childrenOptions = ["1 child", "2 children", "3+ children"];

export const allowanceCurrencyOptions = ["EUR", "GBP", "USD"];

export const religionOptions = [
  "Christianity",
  "Islam",
  "Hinduism",
  "Buddhism",
  "Judaism",
  "Sikhism",
  "No religion",
  "Other",
  "Prefer not to say",
];

export const startWindows = [
  "Now",
  "In 1–3 months",
  "In 3–6 months",
  "More than 6 months",
  "Flexible",
];

export const durations = [
  "1–3 months",
  "3–6 months",
  "6–9 months",
  "9–12 months",
  "12+ months",
  "Flexible",
];

export const smokingOptions = [
  { label: "Non-smoker", value: "non_smoker" },
  { label: "Smoker", value: "smoker" },
];
