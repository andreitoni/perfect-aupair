import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import translations from "@/lib/i18n/static-page-translations.generated.json";
import type { LanguageCode } from "@/lib/i18n/translations";

export type StaticPageRoute = keyof typeof translations;

type TranslatedLanguage = Exclude<LanguageCode, "en">;
type TranslatedText = Record<string, string>;

const NON_TRANSLATABLE_IDENTIFIERS = new Set([
  "Perfect AuPair",
  "support@example.invalid",
]);

const translationOverrides: Record<
  TranslatedLanguage,
  Record<string, string>
> = {
  es: {
    "About Perfect AuPair": "Acerca de Perfect AuPair",
    "Perfect AuPair is a modern matching platform for au pairs and host families who want a clear and direct way to discover each other.":
      "Perfect AuPair es una plataforma moderna de búsqueda para au pairs y familias anfitrionas que desean una forma clara y directa de encontrarse.",
    "Start with consistent, checkable information":
      "Empieza con información coherente y verificable",
    "Trading as Perfect AuPair": "Nombre comercial: Perfect AuPair",
    "Perfect AuPair support is not an emergency service. If someone is in immediate danger, contact local emergency services or law enforcement.":
      "El soporte de Perfect AuPair no es un servicio de emergencia. Si alguien está en peligro inmediato, contacta con los servicios de emergencia locales o con las autoridades.",
    "For immediate danger, contact local emergency services or law enforcement first. Perfect AuPair support is not an emergency service.":
      "En caso de peligro inmediato, contacta primero con los servicios de emergencia locales o con las autoridades. El soporte de Perfect AuPair no es un servicio de emergencia.",
    "Deutschland-Ratgeber": "Guía de Alemania",
    "Deutsche Informationen für Gastfamilien zu Suche, Voraussetzungen und laufenden Au-pair-Kosten.":
      "Información en alemán para familias anfitrionas sobre la búsqueda, los requisitos y los costes habituales de un au pair.",
    "Informationen auf Deutsch": "Información en alemán",
    "Deutsche Gastfamilien finden ausführliche Informationen zu Suche, Voraussetzungen und Kosten in unserem":
      "Las familias anfitrionas alemanas encontrarán información detallada sobre la búsqueda, los requisitos y los costes en nuestra",
    "how to compare au pair websites": "cómo comparar sitios web de au pair",
    "How to choose an au pair website": "Cómo elegir un sitio web de au pair",
    "Compare legal fit, costs, profile information, communication, safety tools, and when an agency or sponsor is the better choice.":
      "Compara la adecuación legal, los costes, la información del perfil, la comunicación, las herramientas de seguridad y cuándo conviene más una agencia o un patrocinador.",
    "Au pairs in the UK must have the right to work and are entitled to the applicable National Minimum Wage or National Living Wage. Host families should check current GOV.UK rules before making plans.":
      "Los au pairs en el Reino Unido deben tener derecho a trabajar y tienen derecho al salario mínimo nacional o al salario digno nacional aplicable. Las familias anfitrionas deben consultar las normas vigentes de GOV.UK antes de hacer planes.",
    "Budget for at least the applicable National Minimum Wage or National Living Wage; accommodation can affect the calculation, and employer or tax obligations may also apply.":
      "Presupuesta al menos el salario mínimo nacional o el salario digno nacional aplicable; el alojamiento puede afectar al cálculo y también pueden existir obligaciones fiscales o como empleador.",
  },
  de: {
    "About Perfect AuPair": "Über Perfect AuPair",
    "Perfect AuPair is a modern matching platform for au pairs and host families who want a clear and direct way to discover each other.":
      "Perfect AuPair ist eine moderne Matching-Plattform für Au-pairs und Gastfamilien, die einander auf klare und direkte Weise finden möchten.",
    "Start with consistent, checkable information":
      "Mit konsistenten, überprüfbaren Informationen beginnen",
    "Trading as Perfect AuPair": "Handelnd unter dem Namen Perfect AuPair",
    "Perfect AuPair support is not an emergency service. If someone is in immediate danger, contact local emergency services or law enforcement.":
      "Der Support von Perfect AuPair ist kein Notdienst. Wenn jemand in unmittelbarer Gefahr ist, wenden Sie sich an den örtlichen Rettungsdienst oder die Polizei.",
    "For immediate danger, contact local emergency services or law enforcement first. Perfect AuPair support is not an emergency service.":
      "Wenden Sie sich bei unmittelbarer Gefahr zuerst an den örtlichen Rettungsdienst oder die Polizei. Der Support von Perfect AuPair ist kein Notdienst.",
    "how to compare au pair websites": "wie man Au-pair-Webseiten vergleicht",
    "How to choose an au pair website": "So wählen Sie eine Au-pair-Webseite aus",
    "Compare legal fit, costs, profile information, communication, safety tools, and when an agency or sponsor is the better choice.":
      "Vergleichen Sie rechtliche Eignung, Kosten, Profilangaben, Kommunikation, Sicherheitswerkzeuge und wann eine Agentur oder ein Sponsor die bessere Wahl ist.",
    "Au pairs in the UK must have the right to work and are entitled to the applicable National Minimum Wage or National Living Wage. Host families should check current GOV.UK rules before making plans.":
      "Au-pairs im Vereinigten Königreich müssen ein Arbeitsrecht haben und haben Anspruch auf den geltenden National Minimum Wage oder National Living Wage. Gastfamilien sollten vor jeder Planung die aktuellen GOV.UK-Regeln prüfen.",
    "Budget for at least the applicable National Minimum Wage or National Living Wage; accommodation can affect the calculation, and employer or tax obligations may also apply.":
      "Planen Sie mindestens den geltenden National Minimum Wage oder National Living Wage ein; die Unterkunft kann die Berechnung beeinflussen, und auch Arbeitgeber- oder Steuerpflichten können gelten.",
  },
  fr: {
    "About Perfect AuPair": "À propos de Perfect AuPair",
    "Perfect AuPair is a modern matching platform for au pairs and host families who want a clear and direct way to discover each other.":
      "Perfect AuPair est une plateforme moderne de mise en relation pour les au pairs et les familles d’accueil qui souhaitent se trouver de manière claire et directe.",
    "Start with consistent, checkable information":
      "Commencez par des informations cohérentes et vérifiables",
    "Trading as Perfect AuPair": "Exerçant sous le nom de Perfect AuPair",
    "Perfect AuPair support is not an emergency service. If someone is in immediate danger, contact local emergency services or law enforcement.":
      "L’assistance de Perfect AuPair n’est pas un service d’urgence. Si une personne est en danger immédiat, contactez les services d’urgence locaux ou les autorités.",
    "For immediate danger, contact local emergency services or law enforcement first. Perfect AuPair support is not an emergency service.":
      "En cas de danger immédiat, contactez d’abord les services d’urgence locaux ou les autorités. L’assistance de Perfect AuPair n’est pas un service d’urgence.",
    "Deutschland-Ratgeber": "Guide de l’Allemagne",
    "Deutsche Informationen für Gastfamilien zu Suche, Voraussetzungen und laufenden Au-pair-Kosten.":
      "Informations en allemand pour les familles d’accueil sur la recherche, les conditions et les frais courants d’un au pair.",
    "Informationen auf Deutsch": "Informations en allemand",
    "Deutsche Gastfamilien finden ausführliche Informationen zu Suche, Voraussetzungen und Kosten in unserem":
      "Les familles d’accueil allemandes trouveront des informations détaillées sur la recherche, les conditions et les coûts dans notre",
    "how to compare au pair websites": "comment comparer les sites d’au pair",
    "How to choose an au pair website": "Comment choisir un site d’au pair",
    "Compare legal fit, costs, profile information, communication, safety tools, and when an agency or sponsor is the better choice.":
      "Comparez l’adéquation juridique, les coûts, les informations de profil, la communication, les outils de sécurité et les situations où une agence ou un sponsor est préférable.",
    "Au pairs in the UK must have the right to work and are entitled to the applicable National Minimum Wage or National Living Wage. Host families should check current GOV.UK rules before making plans.":
      "Au Royaume-Uni, les au pairs doivent avoir le droit de travailler et ont droit au salaire minimum national ou au salaire vital national applicable. Les familles d’accueil doivent vérifier les règles GOV.UK en vigueur avant de faire des projets.",
    "Budget for at least the applicable National Minimum Wage or National Living Wage; accommodation can affect the calculation, and employer or tax obligations may also apply.":
      "Prévoyez au minimum le salaire minimum national ou le salaire vital national applicable ; le logement peut modifier le calcul et des obligations fiscales ou d’employeur peuvent aussi s’appliquer.",
  },
  nl: {
    "About Perfect AuPair": "Over Perfect AuPair",
    "Perfect AuPair is a modern matching platform for au pairs and host families who want a clear and direct way to discover each other.":
      "Perfect AuPair is een modern matchingplatform voor au pairs en gastgezinnen die elkaar op een duidelijke en directe manier willen vinden.",
    "Start with consistent, checkable information":
      "Begin met consistente, controleerbare informatie",
    "Trading as Perfect AuPair": "Handelend onder de naam Perfect AuPair",
    "Perfect AuPair support is not an emergency service. If someone is in immediate danger, contact local emergency services or law enforcement.":
      "De ondersteuning van Perfect AuPair is geen nooddienst. Neem bij direct gevaar contact op met de plaatselijke hulpdiensten of de politie.",
    "For immediate danger, contact local emergency services or law enforcement first. Perfect AuPair support is not an emergency service.":
      "Neem bij direct gevaar eerst contact op met de plaatselijke hulpdiensten of de politie. De ondersteuning van Perfect AuPair is geen nooddienst.",
    "Deutschland-Ratgeber": "Duitsland-gids",
    "Deutsche Informationen für Gastfamilien zu Suche, Voraussetzungen und laufenden Au-pair-Kosten.":
      "Duitstalige informatie voor gastgezinnen over zoeken, voorwaarden en doorlopende au-pairkosten.",
    "Informationen auf Deutsch": "Informatie in het Duits",
    "Deutsche Gastfamilien finden ausführliche Informationen zu Suche, Voraussetzungen und Kosten in unserem":
      "Duitse gastgezinnen vinden uitgebreide informatie over zoeken, voorwaarden en kosten in onze",
    "how to compare au pair websites": "hoe je au-pairwebsites vergelijkt",
    "How to choose an au pair website": "Een au-pairwebsite kiezen",
    "Compare legal fit, costs, profile information, communication, safety tools, and when an agency or sponsor is the better choice.":
      "Vergelijk juridische geschiktheid, kosten, profielinformatie, communicatie, veiligheidsfuncties en wanneer een bureau of sponsor de betere keuze is.",
    "Au pairs in the UK must have the right to work and are entitled to the applicable National Minimum Wage or National Living Wage. Host families should check current GOV.UK rules before making plans.":
      "Au pairs in het Verenigd Koninkrijk moeten het recht hebben om te werken en hebben recht op het toepasselijke National Minimum Wage of National Living Wage. Gastgezinnen moeten vóór het maken van plannen de actuele GOV.UK-regels controleren.",
    "Budget for at least the applicable National Minimum Wage or National Living Wage; accommodation can affect the calculation, and employer or tax obligations may also apply.":
      "Begroot minimaal het toepasselijke National Minimum Wage of National Living Wage; huisvesting kan de berekening beïnvloeden en er kunnen ook werkgevers- of belastingverplichtingen gelden.",
  },
  it: {
    "About Perfect AuPair": "Informazioni su Perfect AuPair",
    "Perfect AuPair is a modern matching platform for au pairs and host families who want a clear and direct way to discover each other.":
      "Perfect AuPair è una moderna piattaforma di matching per au pair e famiglie ospitanti che desiderano trovarsi in modo chiaro e diretto.",
    "Start with consistent, checkable information":
      "Inizia con informazioni coerenti e verificabili",
    "Trading as Perfect AuPair": "Operante con il nome Perfect AuPair",
    "Perfect AuPair support is not an emergency service. If someone is in immediate danger, contact local emergency services or law enforcement.":
      "L’assistenza di Perfect AuPair non è un servizio di emergenza. Se qualcuno è in pericolo immediato, contatta i servizi di emergenza locali o le autorità.",
    "For immediate danger, contact local emergency services or law enforcement first. Perfect AuPair support is not an emergency service.":
      "In caso di pericolo immediato, contatta prima i servizi di emergenza locali o le autorità. L’assistenza di Perfect AuPair non è un servizio di emergenza.",
    "Deutschland-Ratgeber": "Guida alla Germania",
    "Deutsche Informationen für Gastfamilien zu Suche, Voraussetzungen und laufenden Au-pair-Kosten.":
      "Informazioni in tedesco per le famiglie ospitanti su ricerca, requisiti e costi correnti dell’au pair.",
    "Informationen auf Deutsch": "Informazioni in tedesco",
    "Deutsche Gastfamilien finden ausführliche Informationen zu Suche, Voraussetzungen und Kosten in unserem":
      "Le famiglie ospitanti tedesche trovano informazioni dettagliate su ricerca, requisiti e costi nella nostra",
    "how to compare au pair websites": "come confrontare i siti per au pair",
    "How to choose an au pair website": "Come scegliere un sito per au pair",
    "Compare legal fit, costs, profile information, communication, safety tools, and when an agency or sponsor is the better choice.":
      "Confronta l’idoneità legale, i costi, le informazioni del profilo, la comunicazione, gli strumenti di sicurezza e quando è preferibile un’agenzia o uno sponsor.",
    "Au pairs in the UK must have the right to work and are entitled to the applicable National Minimum Wage or National Living Wage. Host families should check current GOV.UK rules before making plans.":
      "Nel Regno Unito gli au pair devono avere il diritto di lavorare e hanno diritto al National Minimum Wage o al National Living Wage applicabile. Le famiglie ospitanti devono verificare le regole GOV.UK aggiornate prima di fare programmi.",
    "Budget for at least the applicable National Minimum Wage or National Living Wage; accommodation can affect the calculation, and employer or tax obligations may also apply.":
      "Prevedi almeno il National Minimum Wage o il National Living Wage applicabile; l’alloggio può influire sul calcolo e possono applicarsi anche obblighi fiscali o del datore di lavoro.",
  },
};

function normalizeStaticText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function translateStaticPageText(
  route: StaticPageRoute,
  locale: LanguageCode,
  source: string,
) {
  if (locale === "en") return source;

  const normalized = normalizeStaticText(source);
  if (!normalized) return source;
  if (NON_TRANSLATABLE_IDENTIFIERS.has(normalized)) return source;

  const override = translationOverrides[locale]?.[normalized];
  if (override) {
    const leadingWhitespace = source.match(/^\s*/)?.[0] ?? "";
    const trailingWhitespace = source.match(/\s*$/)?.[0] ?? "";
    return `${leadingWhitespace}${override}${trailingWhitespace}`;
  }

  const routeTranslations = translations[route] as Record<
    TranslatedLanguage,
    TranslatedText
  >;
  const translated = routeTranslations[locale]?.[normalized];
  if (!translated) return source;

  const leadingWhitespace = source.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = source.match(/\s*$/)?.[0] ?? "";
  return `${leadingWhitespace}${translated}${trailingWhitespace}`;
}

export function translateStaticPageNode(
  route: StaticPageRoute,
  locale: LanguageCode,
  node: ReactNode,
): ReactNode {
  if (typeof node === "string") {
    return translateStaticPageText(route, locale, node);
  }

  if (Array.isArray(node)) {
    return Children.map(node, (child) =>
      translateStaticPageNode(route, locale, child),
    );
  }

  if (!isValidElement(node)) return node;

  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.props.children === undefined) return element;

  return cloneElement(
    element,
    undefined,
    Children.map(element.props.children, (child) =>
      translateStaticPageNode(route, locale, child),
    ),
  );
}
