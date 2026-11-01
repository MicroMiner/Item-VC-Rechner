const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, ".."),
  prefix = "/preview/velocity/";
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://local").pathname;
  if (!pathname.startsWith(prefix)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const rel = decodeURIComponent(pathname.slice(prefix.length)) || "index.html";
  if (rel === "config.js") {
    res.setHeader("Content-Type", types[".js"]);
    res.end("window.VELOCITY_API_URL='';");
    return;
  }
  const target = path.resolve(root, rel);
  if (!target.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader(
      "Content-Type",
      types[path.extname(target)] || "application/octet-stream",
    );
    res.end(data);
  });
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port + prefix;
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
      }),
      errors = [],
      requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // Simulate an old cached response for the previous asset URL. Every page
    // must request the new URL so the shared dialog cannot open uninitialized.
    let staleUiRequests = 0;
    await page.route(url => url.pathname.endsWith("/assets/js/ui.js") && !url.search, route => {
      staleUiRequests++;
      return route.fulfill({contentType:"application/javascript", body:"throw Error('stale UI asset requested');"});
    });
    page.on("request", (r) => requests.push(r.url()));
    const gallery = JSON.parse(
      fs.readFileSync(path.join(root, "assets/data/gallery.json")),
    );
    assert.equal(gallery.images.length, 6);
    assert.equal(
      fs.existsSync(path.join(root, "assets/images/presentation")),
      false,
    );
    for (const image of gallery.images) {
      assert.ok(fs.existsSync(path.join(root, image.src)));
      assert.ok(fs.existsSync(path.join(root, image.thumbnail)));
    }
    for (const [route, name] of [
      ["index.html", "Startseite"],
      ["umrechner.html", "Umrechner"],
      ["neuigkeiten.html", "Neuigkeiten"],
      ["galerie.html", "Galerie"],
    ]) {
      await page.goto(base + route);
      assert.equal(await page.locator(".site-nav a").count(), 4);
      assert.equal(
        await page.locator(".site-nav [aria-current=page]").innerText(),
        name,
      );
      assert.deepEqual(
        await page
          .locator(".site-nav a")
          .evaluateAll((links) => links.map((a) => a.getAttribute("href"))),
        ["index.html", "umrechner.html", "neuigkeiten.html", "galerie.html"],
      );
      await page.getByRole("link", { name: "Impressum", exact: true }).click();
      assert.equal(await page.locator("#impressum").isVisible(), true);
      const legalText = (await page.locator("#impressum").textContent()).replace(/\s+/g, " ").trim();
      assert.equal(legalText, "× Impressum Projekt VeloCity – Minecraft Survival Server Webentwicklung MicroMiner Über das Projekt VeloCity ist ein unabhängiges Minecraft-Community-Projekt mit eigenem Wirtschaftssystem, individuell entwickelten Plugins und ergänzenden Web-Tools. Rechtlicher Hinweis VeloCity ist ein unabhängiges Minecraft-Fanprojekt und steht in keiner offiziellen Verbindung zu Mojang Studios oder Microsoft. © 2026 VeloCity");
      assert.doesNotMatch(legalText, /Wird ergänzt|Platzhalter|Betreiber|Anschrift|E-Mail/);
      assert.equal(await page.locator("#closeImpressum").evaluate(e=>e===document.activeElement),true);
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(()=>document.activeElement===document.body||document.activeElement.closest("#impressum")!==null),true);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#impressum").isVisible(), false);
      assert.equal(await page.locator("#openImpressum").evaluate(e=>e===document.activeElement),true);
      for (const [width,height] of [[320,640],[375,667],[430,932],[768,1024],[1024,768],[1440,900],[1920,1080]]) {
        await page.setViewportSize({width,height});
        await page.getByRole("link", { name: "Impressum", exact: true }).click();
        const bounds=await page.locator("#impressum").boundingBox();
        assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y>=0&&bounds.y+bounds.height<=height);
        assert.equal(await page.locator("#impressum").evaluate(e=>e.scrollWidth<=e.clientWidth),true);
        await page.locator("#closeImpressum").click();
        assert.equal(await page.locator("#impressum").isVisible(), false);
      }
      await page.getByRole("link", { name: "Impressum", exact: true }).click();
      await page.mouse.click(1,1);
      assert.equal(await page.locator("#impressum").isVisible(), false);
      await page.setViewportSize({width:1440,height:900});
      await page.locator(".site-logo").click();
      await page.waitForURL(base + "index.html");
    }
    await page.waitForFunction(
      () =>
        document.querySelector("#serverVersion").textContent ===
        "Minecraft Java · 1.26.3",
    );
    assert.equal(await page.locator("#serverAddress").inputValue(), "");
    assert.equal(
      await page.locator("#serverAddress").getAttribute("placeholder"),
      "Serveradresse folgt",
    );
    assert.equal(await page.locator("#copyServerAddress").isDisabled(), true);
    await page.waitForFunction(() =>
      document
        .querySelector("#newsList")
        .textContent.includes("Aktuell gibt es noch keine Neuigkeiten"),
    );
    assert.equal(await page.getByRole("link", { name: /Discord/ }).count(), 0);
    await page
      .getByRole("link", { name: "Alle Neuigkeiten", exact: true })
      .click();
    await page.waitForURL(base + "neuigkeiten.html");
    await page.waitForFunction(() =>
      document
        .querySelector("#newsList")
        .textContent.includes("Noch keine Neuigkeiten vorhanden"),
    );
    // Fixture entries exist only inside this test, never in the published JSON.
    const entry = (id, date, extra = {}) => ({
      id,
      source: "manual",
      sourceId: null,
      category: "Update",
      title: id,
      content: "Text " + id,
      publishedAt: date,
      image: null,
      url: null,
      ...extra,
    });
    const news = [
      entry("older", "2026-10-01T12:00:00+02:00"),
      entry("newer", "2026-11-01T12:00:00+01:00", {
        source: "discord",
        sourceId: "123456789",
        title: "<img src=x onerror=alert(1)>",
        content: "<script>window.injected=true</script>",
        image: "javascript:alert(1)",
        url: "javascript:alert(1)",
      }),
      entry("middle", "2026-10-15T12:00:00+02:00", {
        category: "Changelog",
        url: "https://example.com/info",
        image: gallery.images[0].thumbnail,
      }),
      entry("broken", "not-a-date"),
      entry("older", "2026-10-02T12:00:00+02:00"),
    ];
    await page.route("**/assets/data/updates.json", (r) =>
      r.fulfill({ json: { version: 1, updatedAt: null, updates: news } }),
    );
    await page.reload();
    await page.waitForFunction(
      () => document.querySelectorAll(".news-card").length === 3,
    );
    assert.deepEqual(await page.locator(".news-card h2").allTextContents(), [
      "<img src=x onerror=alert(1)>",
      "middle",
      "older",
    ]);
    assert.equal(
      await page.locator(".news-card").first().locator("img,a,script").count(),
      0,
    );
    assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.equal(
      await page.locator(".news-card time").first().innerText(),
      "01.11.2026",
    );
    assert.equal(await page.locator(".news-card a").count(), 1);
    assert.equal(
      await page.locator(".news-card a").getAttribute("href"),
      "https://example.com/info",
    );
    await page.goto(base + "index.html");
    await page.waitForFunction(
      () => document.querySelectorAll(".news-preview").length === 1,
    );
    assert.equal(
      await page.locator(".news-preview h3").innerText(),
      "<img src=x onerror=alert(1)>",
    );
    // Configuration is the single source for version/address. Test clipboard success and manual fallback.
    await page.route("**/assets/js/site-config.js", (r) =>
      r.fulfill({
        contentType: "application/javascript",
        body: "window.VELOCITY_CONFIG={minecraftEdition:'Java',minecraftVersion:'9.9.9',serverAddress:'play.velocity.test'};",
      }),
    );
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.copiedAddress = text;
          },
        },
      }),
    );
    await page.reload();
    await page.waitForFunction(
      () => !document.querySelector("#copyServerAddress").disabled,
    );
    assert.equal(
      await page.locator("#serverVersion").innerText(),
      "Minecraft Java · 9.9.9",
    );
    await page.locator("#copyServerAddress").click();
    assert.equal(
      await page.evaluate(() => window.copiedAddress),
      "play.velocity.test",
    );
    assert.equal(
      await page.locator("#serverCopyStatus").innerText(),
      "IP kopiert",
    );
    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => {
        throw Error("denied");
      };
    });
    await page.locator("#copyServerAddress").click();
    assert.match(
      await page.locator("#serverCopyStatus").innerText(),
      /manuell kopieren/,
    );
    assert.equal(
      await page
        .locator("#serverAddress")
        .evaluate(
          (e) =>
            document.activeElement === e &&
            e.selectionStart === 0 &&
            e.selectionEnd === e.value.length,
        ),
      true,
    );
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        configurable: true,
      }),
    );
    await page.locator("#copyServerAddress").click();
    assert.match(
      await page.locator("#serverCopyStatus").innerText(),
      /manuell kopieren/,
    );
    await page.route("**/assets/data/updates.json", (r) =>
      r.fulfill({ status: 500, body: "{}" }),
    );
    for (const route of ["index.html", "neuigkeiten.html"]) {
      await page.goto(base + route);
      await page.waitForFunction(() =>
        document
          .querySelector("#newsList")
          .textContent.includes("konnten nicht geladen werden"),
      );
    }
    await page.route("**/assets/data/updates.json", (r) =>
      r.fulfill({ json: { version: 99, updates: [] } }),
    );
    await page.reload();
    await page.waitForFunction(() =>
      document
        .querySelector("#newsList")
        .textContent.includes("konnten nicht geladen werden"),
    );
    await page.route("**/assets/data/updates.json", (r) =>
      r.fulfill({
        json: {
          version: 1,
          updatedAt: null,
          updates: [
            entry("long", "2026-11-01T12:00:00+01:00", {
              title: "W".repeat(500),
              content: "W".repeat(1000),
            }),
          ],
        },
      }),
    );
    for (const route of ["index.html", "neuigkeiten.html"]) {
      await page.goto(base + route);
      await page.waitForFunction(() =>
        document.querySelector("#newsList article"),
      );
      for (const width of [320, 375, 430, 768, 1024, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
          "Long news overflow at " + width,
        );
      }
    }
    // Each thumbnail and original must load, including names with spaces and umlauts.
    await page.goto(base + "galerie.html");
    await page.waitForFunction(
      () => document.querySelectorAll(".gallery-card").length === 6,
    );
    for (const image of await page.locator(".gallery-card img").all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate((e) => e.decode());
    }
    assert.equal(
      requests.some(
        (url) =>
          url.includes("/assets/img/gallery/") && !url.includes("/thumbs/"),
      ),
      false,
    );
    await page.locator(".gallery-card").first().click();
    await page.locator("#galleryFullImage").evaluate((e) => e.decode());
    assert.equal(await page.locator("#galleryPosition").innerText(), "1 / 6");
    for (let i = 1; i < 6; i++) {
      await page.locator("#galleryNext").click();
      await page.locator("#galleryFullImage").evaluate((e) => e.decode());
      assert.equal(
        await page.locator("#galleryFullImage").getAttribute("alt"),
        gallery.images[i].alt,
      );
    }
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#galleryPosition").innerText(), "1 / 6");
    await page.keyboard.press("ArrowLeft");
    assert.equal(await page.locator("#galleryPosition").innerText(), "6 / 6");
    await page.locator("#galleryPrevious").click();
    assert.equal(await page.locator("#galleryPosition").innerText(), "5 / 6");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#galleryDialog").isVisible(), false);
    assert.equal(
      await page
        .locator(".gallery-card")
        .first()
        .evaluate((e) => e === document.activeElement),
      true,
    );
    for (const [width, height] of [
      [320, 640],
      [375, 667],
      [430, 932],
      [768, 1024],
      [1024, 768],
      [1440, 900],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      await page.locator(".gallery-card").first().click();
      const box = await page.locator("#galleryDialog").boundingBox();
      assert.ok(
        box.x >= 0 &&
          box.x + box.width <= width &&
          box.y >= 0 &&
          box.y + box.height <= height,
      );
      const image = await page.locator("#galleryFullImage").boundingBox();
      assert.ok(image.width <= box.width && image.height <= box.height);
      await page.locator("#galleryClose").click();
      assert.equal(await page.locator("#galleryDialog").isVisible(), false);
      const columns = await page
        .locator("#galleryGrid")
        .evaluate(
          (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length,
        );
      assert.equal(columns, width > 1100 ? 3 : width > 600 ? 2 : 1);
    }
    await page.locator(".gallery-card").first().click();
    await page.mouse.click(1, 1);
    assert.equal(await page.locator("#galleryDialog").isVisible(), false);
    await page.route("**/assets/data/gallery.json", (r) =>
      r.fulfill({ status: 503, body: "{}" }),
    );
    await page.reload();
    await page.waitForFunction(() =>
      document
        .querySelector("#galleryGrid")
        .textContent.includes("konnte nicht geladen werden"),
    );
    assert.equal(staleUiRequests, 0, "A page still requests the stale UI URL");
    assert.deepEqual(errors, []);
    assert.equal(
      requests.some((url) => url.includes("/presentation/")),
      false,
    );
    console.log(
      "PASS four-page navigation/legal dialogs, config/IP clipboard/fallback, news sorting/empty/error/XSS, six real images, lightbox controls/focus and seven responsive widths",
    );
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
