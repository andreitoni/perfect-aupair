import { expect, test } from "@playwright/test";

test("llms.txt exposes factual canonical sources without a ranking claim", async ({
  request,
}) => {
  const response = await request.get("/llms.txt");
  const body = await response.text();

  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toContain("text/plain");
  expect(body).toContain("Canonical website: https://perfectaupair.example");
  expect(body).toContain("https://perfectaupair.example/guides");
  expect(body).toContain("https://perfectaupair.example/safety");
  expect(body).toContain("https://perfectaupair.example/privacy");
  expect(body).toContain("https://perfectaupair.example/de/ratgeber");
  expect(body).toContain(
    "https://perfectaupair.example/de/au-pair-visum-deutschland",
  );
  expect(body).toContain(
    "https://perfectaupair.example/de/au-pair-vertrag-deutschland",
  );
  expect(body).toContain("Do not infer a universal ranking");
  expect(body).not.toMatch(/Perfect AuPair is (?:the )?(?:best|#1|number one)/i);
});

test("editorial answers expose canonical social, language, and structured metadata", async ({
  request,
}) => {
  const [englishResponse, germanResponse, aboutResponse, countryResponse] =
    await Promise.all([
      request.get("/guides/best-au-pair-website"),
      request.get("/de/beste-au-pair-webseite"),
      request.get("/about"),
      request.get("/guides/germany"),
    ]);
  const [englishHtml, germanHtml, aboutHtml, countryHtml] = await Promise.all([
    englishResponse.text(),
    germanResponse.text(),
    aboutResponse.text(),
    countryResponse.text(),
  ]);

  for (const response of [
    englishResponse,
    germanResponse,
    aboutResponse,
    countryResponse,
  ]) {
    expect(response.ok()).toBeTruthy();
  }

  expect(englishHtml).toMatch(/<html[^>]+lang="en"/);
  expect(englishHtml).toContain(
    'property="og:url" content="https://perfectaupair.example/guides/best-au-pair-website"',
  );
  expect(englishHtml).toContain(
    'rel="alternate" hrefLang="de" href="https://perfectaupair.example/de/beste-au-pair-webseite"',
  );
  expect(englishHtml).toContain('"@type":"Article"');
  expect(englishHtml).toContain('"@type":"FAQPage"');
  expect(englishHtml).toContain("There is no universal best au pair website");

  expect(germanHtml).toMatch(/<html[^>]+lang="de"/);
  expect(germanHtml).toContain(
    'property="og:url" content="https://perfectaupair.example/de/beste-au-pair-webseite"',
  );
  expect(germanHtml).toContain(
    'rel="alternate" hrefLang="en" href="https://perfectaupair.example/guides/best-au-pair-website"',
  );
  expect(germanHtml).toContain('"@type":"Article"');
  expect(germanHtml).toContain('"@type":"FAQPage"');
  expect(germanHtml).toContain("Eine allgemein beste Au-pair-Website gibt es nicht");

  expect(aboutHtml).toContain(
    'property="og:url" content="https://perfectaupair.example/about"',
  );
  expect(countryHtml).toContain(
    'property="og:url" content="https://perfectaupair.example/guides/germany"',
  );
  expect(countryHtml).toContain("Requirements for an au pair in Germany");
  expect(countryHtml).toContain('"@type":"FAQPage"');
  expect(countryHtml).toContain("6 hours per day and 30 hours per week");
  expect(aboutHtml).toContain('name="twitter:card" content="summary_large_image"');
  expect(countryHtml).toContain('name="twitter:card" content="summary_large_image"');
});

test("sitemap publishes the reciprocal English and German answer URLs", async ({
  request,
}) => {
  const response = await request.get("/sitemap.xml");
  const sitemap = await response.text();

  expect(response.ok()).toBeTruthy();
  expect(sitemap).toContain(
    "https://perfectaupair.example/guides/best-au-pair-website",
  );
  expect(sitemap).toContain(
    "https://perfectaupair.example/de/beste-au-pair-webseite",
  );
  expect(sitemap).toContain('hreflang="x-default"');
});

test("German cost guide exposes the free calculator as structured data", async ({
  request,
}) => {
  const response = await request.get("/de/au-pair-kosten-deutschland");
  const html = await response.text();

  expect(response.ok()).toBeTruthy();
  expect(html).toContain('"@type":"WebApplication"');
  expect(html).toContain('"name":"Au-pair-Kostenrechner Deutschland"');
  expect(html).toContain('"price":"0"');
  expect(html).toContain('"name":"Perfect AuPair Redaktion"');
  expect(html).toContain('"dateModified":"2026-08-13"');
  expect(html).toContain("Redaktionell geprüft am");
});

test("German landing and related guides promote the cost calculator contextually", async ({
  request,
}) => {
  const [landingResponse, pocketMoneyResponse, hostFamilyResponse] =
    await Promise.all([
      request.get("/de"),
      request.get("/de/au-pair-taschengeld-deutschland"),
      request.get("/de/gastfamilie-werden"),
    ]);
  const [landingHtml, pocketMoneyHtml, hostFamilyHtml] = await Promise.all([
    landingResponse.text(),
    pocketMoneyResponse.text(),
    hostFamilyResponse.text(),
  ]);

  expect(landingResponse.ok()).toBeTruthy();
  expect(landingHtml).toContain("Was kostet ein Au-pair in Deutschland?");
  expect(landingHtml).toContain('href="/de/au-pair-kosten-deutschland"');
  expect(pocketMoneyHtml).toContain("Gesamtkosten statt nur Taschengeld planen");
  expect(hostFamilyHtml).toContain("Budget vor der Suche festlegen");
});

test("German requirements, visa, and contract guides expose practical tools", async ({
  request,
}) => {
  const [requirementsResponse, visaResponse, contractResponse] =
    await Promise.all([
      request.get("/de/au-pair-voraussetzungen-deutschland"),
      request.get("/de/au-pair-visum-deutschland"),
      request.get("/de/au-pair-vertrag-deutschland"),
    ]);
  const [requirementsHtml, visaHtml, contractHtml] = await Promise.all([
    requirementsResponse.text(),
    visaResponse.text(),
    contractResponse.text(),
  ]);

  for (const response of [
    requirementsResponse,
    visaResponse,
    contractResponse,
  ]) {
    expect(response.ok()).toBeTruthy();
  }

  expect(requirementsHtml).toContain("Passen die Grundvoraussetzungen?");
  expect(requirementsHtml).toContain("Für Au-pairs aus Drittstaaten wird mindestens Niveau A1 erwartet");
  expect(visaHtml).toContain("Au-pair-Visum: Vorbereitungscheckliste");
  expect(contractHtml).toContain("Au-pair-Vertrag: Gesprächscheckliste");
  expect(visaHtml).toContain("Drucken / als PDF speichern");
  expect(contractHtml).toContain("Drucken / als PDF speichern");
});
