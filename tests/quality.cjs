const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, ".."),
  prefix = "/preview/velocity/";
const previewDir =
  process.env.SITE_SCREENSHOT_DIR ||
  path.join(require("node:os").tmpdir(), "velocity-site-previews");
if (process.env.SITE_SCREENSHOTS) fs.mkdirSync(previewDir, { recursive: true });
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
    const page = await browser.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let payload = JSON.parse(
        fs.readFileSync(
          path.join(root, "preislisten/VeloCoin_Preisliste.json"),
        ),
      ),
      writes = 0;
    await page.route("**/config.js", (r) =>
      r.fulfill({
        contentType: "application/javascript",
        body: "window.VELOCITY_API_URL='http://api.local';",
      }),
    );
    await page.route("http://api.local/**", (r) => {
      const request = r.request(),
        u = new URL(request.url());
      if (u.pathname === "/auth")
        return r.fulfill({
          json: { token: "test-token", expiresAt: Date.now() + 1800000 },
        });
      if (u.pathname === "/lists")
        return r.fulfill({
          json: { lists: [{ file: "VeloCoin_Preisliste.json" }] },
        });
      if (request.method() === "PUT") {
        payload = {
          ...request.postDataJSON().data,
          updatedAt: new Date().toISOString(),
        };
        writes++;
        return r.fulfill({
          json: { sha: "b".repeat(40), updatedAt: payload.updatedAt },
        });
      }
      return r.fulfill({ json: { data: payload, sha: "a".repeat(40) } });
    });
    await page.goto(base + "umrechner.html");
    await page.waitForFunction(
      () =>
        document.querySelector("#syncState").textContent === "Synchronisiert",
    );
    await page.locator("#toggleAdmin").click();
    await page
      .locator("#adminPanel")
      .evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
    await page.locator("#adminPassword").fill("test-only");
    await page.locator("#adminLogin button").click();
    await page.waitForFunction(
      () => !document.querySelector("#adminInner").inert,
    );
    const diamond = payload.items.find((x) => x.id === "DIAMOND");
    await page.locator("#editSearch").fill("DIAMOND");
    await page.locator('#editOptions [data-item-id="DIAMOND"]').click();
    await page.locator("#editBuy").fill("33");
    await page.locator("#editSell").fill("11");
    await page.locator("#saveEdit").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#fileStatus")
        .textContent.includes("Online gespeichert"),
    );
    assert.equal(payload.items.find((x) => x.id === "DIAMOND").sell, 11);
    await page.locator("#restoreEdit").click();
    await page.waitForFunction(
      () => document.querySelector("#restoreEdit").disabled,
    );
    await page.waitForFunction(
      () =>
        document.querySelector("#syncState").textContent === "Synchronisiert",
    );
    assert.equal(
      payload.items.find((x) => x.id === "DIAMOND").sell,
      diamond.defaultSell,
    );
    assert.equal(writes, 2);
    const longName = "W".repeat(70);
    await page.locator("#newName").fill(longName);
    await page.locator("#newBuy").fill("400");
    await page.locator("#newSell").fill("100");
    await page.locator("#add").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#syncState").textContent === "Synchronisiert",
    );
    assert.equal(payload.customItems.at(-1).name, longName);
    assert.ok(
      await page
        .locator("#customList")
        .textContent()
        .then((s) => s.includes(longName)),
    );
    const customId = payload.customItems.at(-1).id;
    await page.locator("#fromSearch").fill(longName);
    await page
      .locator('#fromOptions [data-item-id="' + customId + '"]')
      .click();
    await page.locator("#fromQty").fill("10000000");
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
      await page.addStyleTag({
        content: "html {overflow-y:scroll;scrollbar-gutter:stable}",
      });
      const overflow = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll(
            "input,button,select,.rate,.picker-options,.custom-list li,.status,.result,.calculator",
          ),
        )
          .filter((e) => e.getClientRects().length && !e.closest("[inert]"))
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return (
              r.width > 0 &&
              (r.left < -0.5 ||
                r.right > document.documentElement.clientWidth + 0.5)
            );
          })
          .map((e) => e.id || e.className),
      );
      assert.deepEqual(overflow, [], "Visible controls overflow at " + width);
      assert.ok(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
        "Page overflow at " + width,
      );
      await page.locator("#fromSearch").focus();
      await page.locator("#fromSearch").fill("W");
      const popup = await page.locator("#fromOptions").boundingBox();
      assert.ok(popup.x >= 0 && popup.x + popup.width <= width);
      await page.keyboard.press("Escape");
      await page.getByRole("link", { name: "Impressum", exact: true }).click();
      const legal = await page.locator("#impressum").boundingBox();
      assert.ok(
        legal.x >= 0 &&
          legal.x + legal.width <= width &&
          legal.y >= 0 &&
          legal.y + legal.height <= height,
      );
      await page.keyboard.press("Escape");
    }
    const unlabeled = await page
      .locator('input:not([type="hidden"]),select:not([hidden])')
      .evaluateAll((elements) =>
        elements
          .filter(
            (e) =>
              !e.labels?.length &&
              !e.getAttribute("aria-label") &&
              !e.getAttribute("aria-labelledby"),
          )
          .map((e) => e.id),
      );
    assert.deepEqual(unlabeled, []);
    const download = page.waitForEvent("download");
    await page.locator("#exportData").click();
    const exported = JSON.parse(fs.readFileSync(await (await download).path()));
    assert.equal(exported.customItems.at(-1).name, longName);
    await page
      .locator("#customList li")
      .filter({ hasText: longName })
      .getByRole("button", { name: "Löschen" })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector("#syncState").textContent === "Synchronisiert",
    );
    assert.equal(
      payload.customItems.some((x) => x.id === customId),
      false,
    );
    await page.locator("#adminLogout").click();
    assert.equal(
      await page.locator("#adminInner").evaluate((e) => e.inert),
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
      await page.locator("#adminLogin").scrollIntoViewIfNeeded();
      const login = await page.locator("#adminLogin").boundingBox();
      assert.ok(login.x >= 0 && login.x + login.width <= width);
      assert.ok(
        await page.locator("#adminLogin button").evaluate((e) => {
          const r = e.getBoundingClientRect(),
            p = e.closest("#management").getBoundingClientRect();
          return r.bottom <= p.bottom;
        }),
      );
    }
    // Deliberately reject the first list: Reset must also be safe without loaded data.
    await page.route("http://api.local/prices?*", (r) =>
      r.fulfill({ status: 502, json: { error: "Test failure" } }),
    );
    await page.reload();
    await page.waitForFunction(
      () =>
        document.querySelector("#result").textContent ===
        "Preisliste nicht verfügbar",
    );
    await page.locator("#reset").click();
    assert.equal(
      await page.locator("#result").textContent(),
      "Preisliste nicht verfügbar",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS seven widths, long names/numbers, dropdowns/dialogs, admin restore/add/delete/export/lock, labelled fields and failed-load reset",
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
