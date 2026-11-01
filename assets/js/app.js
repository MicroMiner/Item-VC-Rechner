"use strict";

const APP_VERSION = "v1.0.30";
const $ = (id) => document.getElementById(id);
// Item: {id,name,buy,sell,defaultBuy,defaultSell,isCustom}
let defaults = [],
  custom = [];
let priceUpdatedAt = null,
  synchronized = false;
let writeChain = Promise.resolve();
const fmt = (n) =>
  new Intl.NumberFormat("de-CH", { maximumFractionDigits: 8 }).format(n);
const fmtPrice = (n) =>
  new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 20,
  }).format(n);
const whole = (v) => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};
const validPrice = (v) => Number.isFinite(v) && v > 0;
const num = (v) => {
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) && x >= 0 ? x : 0;
};
const list = () => [...defaults, ...custom];
const get = (id) =>
  list().find((x) => x.id === id) ||
  list()[0] || { id: "DIRT", name: "Erde", buy: 1, sell: 1 };
const wasChanged = (id) => {
  const x = list().find((x) => x.id === id);
  return !!x && (x.buy !== x.defaultBuy || x.sell !== x.defaultSell);
};
const priceLabel = (x) =>
  `${x.name} · Buy ${fmtPrice(x.buy)} / Sell ${fmtPrice(x.sell)} VC`;
const rateMarkup = (x, side) => {
  const buy = side === "to" && $("shopMode").checked;
  return `${fmtPrice(buy ? x.buy : x.sell)} VC <span class="original">${buy ? "Buy" : "Sell"}${wasChanged(x.id) ? " · Standard: " + fmtPrice(buy ? x.defaultBuy : x.defaultSell) + " VC" : ""}</span>`;
};
const status = (message) => ($("fileStatus").textContent = message);
function readUpdatedAt(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value))
    return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function renderHeaderStatus() {
  $("appVersion").textContent = APP_VERSION;
  $("economyStatus").dataset.state = synchronized ? "synced" : "disconnected";
  $("syncState").textContent = synchronized
    ? "Synchronisiert"
    : "Nicht verbunden";
  const dirt = list().find((x) => x.id === "DIRT");
  const number = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 20 });
  $("earthValue").textContent = dirt
    ? `1 Erde = ${number.format(dirt.sell)} VC (Sell)`
    : "1 Erde = — VC (Sell)";
  const count = list().length;
  $("loadedItems").textContent =
    new Intl.NumberFormat("de-CH").format(count).replace(/’/g, "'") +
    (count === 1 ? " Item" : " Items");
  const time = $("priceUpdatedAt");
  if (priceUpdatedAt) {
    time.dateTime = priceUpdatedAt;
    time.textContent = new Intl.DateTimeFormat("de-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Zurich",
    }).format(new Date(priceUpdatedAt));
    time.setAttribute(
      "aria-label",
      "Letzte gespeicherte Preisänderung: " + time.textContent,
    );
  } else {
    time.removeAttribute("datetime");
    time.textContent = "Keine Zeitangabe";
    time.setAttribute(
      "aria-label",
      "Letzte gespeicherte Preisänderung: unbekannt",
    );
  }
}
function setSynchronized(value) {
  synchronized = value;
  renderHeaderStatus();
}

function currentPayload() {
  const entry = (x) => ({
    id: x.id,
    name: x.name,
    buy: x.buy,
    sell: x.sell,
    defaultBuy: x.defaultBuy,
    defaultSell: x.defaultSell,
  });
  return {
    format: "VeloCoin-Preisliste",
    version: 2,
    baseCurrency: "VC",
    baseItem: "DIRT",
    ...(priceUpdatedAt ? { updatedAt: priceUpdatedAt } : {}),
    items: defaults.map(entry),
    customItems: custom.map(entry),
  };
}
function parsePayload(data) {
  if (
    !data ||
    data.format !== "VeloCoin-Preisliste" ||
    data.version !== 2 ||
    !Array.isArray(data.items) ||
    !Array.isArray(data.customItems)
  )
    throw Error("Ungültiges JSON-Format. Bitte Version 2 verwenden.");
  if (
    !data.items.length ||
    data.items.length > 3000 ||
    data.customItems.length > 3000
  )
    throw Error("Ungültige Anzahl von Items.");
  const seen = new Set(),
    std = [],
    cus = [];
  for (const [items, target, isCustom] of [
    [data.items, std, false],
    [data.customItems, cus, true],
  ])
    for (const item of items) {
      if (
        !item ||
        typeof item.id !== "string" ||
        !(isCustom ? /^CUSTOM_[a-zA-Z0-9_-]+$/ : /^[A-Z][A-Z0-9_]*$/).test(
          item.id,
        ) ||
        seen.has(item.id) ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        item.name.length > 100
      )
        throw Error("Ungültiger Item-Eintrag.");
      // Unterstützt auch ältere Listen mit standardPrice/price.
      const buy = item.buy ?? item.standardPrice ?? item.price ?? item.sell;
      const sell = item.sell ?? item.price ?? item.buy;
      const defaultBuy = item.defaultBuy ?? buy,
        defaultSell = item.defaultSell ?? sell;
      if (![buy, sell, defaultBuy, defaultSell].every(validPrice))
        throw Error("Ungültiger Kauf-/Verkaufspreis bei " + item.id);
      seen.add(item.id);
      target.push({
        id: item.id,
        name: item.name,
        buy,
        sell,
        defaultBuy,
        defaultSell,
        isCustom,
      });
    }
  if (!seen.has("DIRT")) throw Error("Das Basis-Item DIRT fehlt.");
  return { std, cus };
}
function applyData(data) {
  const parsed = parsePayload(data);
  defaults = parsed.std;
  custom = parsed.cus;
  priceUpdatedAt = readUpdatedAt(data.updatedAt);
  for (const id of ["fromSearch", "toSearch", "editSearch"]) $(id).value = "";
  redraw();
}
let apiUrl = (window.VELOCITY_API_URL || "").replace(/\/$/, "");
let adminSession = null,
  sessionTimer;
const sessionStorageKey = "velocity.adminSession:" + apiUrl;
let remoteSha = "";
let selectedFile = "",
  switching = false;
const validFile = (name) =>
  typeof name === "string" &&
  /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(name) &&
  name !== "index.json";
const management = $("management"),
  adminInner = $("adminInner");
function setUnlocked(unlocked, clearSaved = true) {
  management.classList.toggle("locked", !unlocked);
  adminInner.inert = !unlocked || switching;
  $("priceList").disabled = !unlocked || switching;
  $("adminPassword").value = "";
  if (!unlocked) {
    adminSession = null;
    clearTimeout(sessionTimer);
    if (clearSaved)
      try {
        localStorage.removeItem(sessionStorageKey);
      } catch {}
  }
}
function acceptSession(session) {
  if (
    typeof session.token !== "string" ||
    !Number.isFinite(session.expiresAt) ||
    session.expiresAt <= Date.now()
  )
    throw Error("Ungültige oder abgelaufene Sitzung.");
  adminSession = { token: session.token, expiresAt: session.expiresAt };
  try {
    localStorage.setItem(sessionStorageKey, JSON.stringify(adminSession));
  } catch {}
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    setUnlocked(false);
    $("adminStatus").textContent = "Sitzung abgelaufen. Bitte erneut anmelden.";
  }, session.expiresAt - Date.now());
  setUnlocked(true);
}
async function restoreSession() {
  if (!apiUrl) return;
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(sessionStorageKey));
  } catch {}
  if (!saved) return;
  if (
    typeof saved.token !== "string" ||
    !Number.isFinite(saved.expiresAt) ||
    saved.expiresAt <= Date.now()
  ) {
    setUnlocked(false);
    return;
  }
  try {
    acceptSession(await requestAdmin({ token: saved.token }));
    $("adminStatus").textContent = "";
  } catch (err) {
    setUnlocked(false);
    $("adminStatus").textContent = err.message;
  }
}
async function loadRemote() {
  setSynchronized(false);
  if (!validFile(selectedFile)) throw Error("Bitte eine Preisliste auswählen.");
  const endpoint = apiUrl
    ? apiUrl + "/prices?file=" + encodeURIComponent(selectedFile)
    : "./preislisten/" + encodeURIComponent(selectedFile);
  const r = await fetch(endpoint, { cache: "no-store" });
  if (!r.ok) throw Error("Preisliste nicht verfügbar (HTTP " + r.status + ")");
  const body = await r.json();
  const data = apiUrl ? body.data : body;
  applyData(data);
  remoteSha = apiUrl ? body.sha || "" : "";
  setSynchronized(true);
  status("Preisliste geladen · " + new Date().toLocaleTimeString("de-CH"));
}
async function requestAdmin(credentials) {
  if (!apiUrl) throw Error("API-Adresse in config.js fehlt.");
  const r = await fetch(apiUrl + "/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  if (!r.ok)
    throw Error(
      r.status === 401
        ? credentials.token
          ? "Sitzung abgelaufen. Bitte erneut anmelden."
          : "Passwort ungültig."
        : "Anmeldung derzeit nicht möglich (HTTP " + r.status + ").",
    );
  return r.json();
}
function save() {
  if (!adminSession || adminSession.expiresAt <= Date.now()) {
    setUnlocked(false);
    status("Bitte erneut anmelden.");
    return false;
  }
  if (switching || !validFile(selectedFile) || !remoteSha) return false;
  const snapshot = currentPayload(),
    file = selectedFile,
    token = adminSession.token;
  delete snapshot.updatedAt; // Only the Worker can assign a new committed timestamp.
  setSynchronized(false);
  writeChain = writeChain
    .then(async () => {
      setSynchronized(false);
      const r = await fetch(
        apiUrl + "/prices?file=" + encodeURIComponent(file),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, sha: remoteSha, data: snapshot }),
        },
      );
      const answer = await r.json().catch(() => ({}));
      if (r.status === 401) {
        setUnlocked(false);
        $("adminStatus").textContent =
          "Sitzung abgelaufen. Bitte erneut anmelden.";
      }
      if (!r.ok) throw Error(answer.error || "HTTP " + r.status);
      remoteSha = answer.sha;
      priceUpdatedAt = readUpdatedAt(answer.updatedAt);
      setSynchronized(true);
      status("Online gespeichert · " + new Date().toLocaleTimeString("de-CH"));
    })
    .catch(async (err) => {
      setSynchronized(false);
      status(
        "Speichern fehlgeschlagen: " +
          err.message +
          " · Die Online-Liste wird neu geladen.",
      );
      try {
        await loadRemote();
      } catch (e) {
        status(
          "Speichern fehlgeschlagen: " +
            err.message +
            "; auch Neuladen fehlgeschlagen.",
        );
      }
    });
  return true;
}
const saveOverrides = save;
const itemPickers = {};
function createItemPicker(side, onChange) {
  const input = $(side + "Search"),
    select = $(side + "Item"),
    popup = $(side + "Options"),
    wrapper = $(side + "Picker");
  let opened = false,
    query = "",
    matches = [],
    active = -1;
  const selectedName = () =>
    list().find((x) => x.id === select.value)?.name || "";
  function close() {
    opened = false;
    popup.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    input.value = selectedName();
    query = "";
  }
  function highlight() {
    const options = popup.querySelectorAll('[role="option"]');
    options.forEach((option, i) =>
      option.setAttribute("aria-selected", String(i === active)),
    );
    if (active >= 0 && options[active]) {
      input.setAttribute("aria-activedescendant", options[active].id);
      options[active].scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }
  function show() {
    const q = query.trim().toLocaleLowerCase();
    matches = list().filter((x) =>
      (x.id + " " + x.name).toLocaleLowerCase().includes(q),
    );
    matches.sort(
      (a, b) =>
        Number(b.id.toLocaleLowerCase() === q) -
        Number(a.id.toLocaleLowerCase() === q),
    );
    active = matches.length ? 0 : -1;
    popup.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const [i, item] of matches.entries()) {
      const option = document.createElement("div");
      option.className = "picker-option";
      option.id = side + "Option" + i;
      option.setAttribute("role", "option");
      option.dataset.itemId = item.id;
      option.textContent = priceLabel(item);
      fragment.append(option);
    }
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "picker-empty";
      empty.setAttribute("role", "status");
      empty.textContent = "Keine Items gefunden.";
      fragment.append(empty);
    }
    popup.append(fragment);
    opened = true;
    popup.hidden = false;
    input.setAttribute("aria-expanded", "true");
    highlight();
  }
  function choose(id) {
    select.value = id;
    close();
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  input.addEventListener("focus", () => {
    query = "";
    show();
    input.select();
  });
  input.addEventListener("click", () => {
    if (!opened) {
      query = "";
      show();
      input.select();
    }
  });
  input.addEventListener("input", () => {
    query = input.value;
    show();
  });
  input.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!opened) {
        query = "";
        show();
        active = e.key === "ArrowUp" ? matches.length - 1 : 0;
      } else
        active = Math.max(
          0,
          Math.min(
            matches.length - 1,
            active + (e.key === "ArrowDown" ? 1 : -1),
          ),
        );
      highlight();
    } else if (e.key === "Enter" && opened) {
      e.preventDefault();
      if (matches[active]) choose(matches[active].id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") close();
  });
  popup.addEventListener("mousedown", (e) => e.preventDefault());
  popup.addEventListener("click", (e) => {
    const option = e.target.closest('[role="option"]');
    if (option) choose(option.dataset.itemId);
  });
  document.addEventListener("pointerdown", (e) => {
    if (opened && !wrapper.contains(e.target)) close();
  });
  document.addEventListener("focusin", (e) => {
    if (opened && !wrapper.contains(e.target)) close();
  });
  select.addEventListener("change", () => {
    close();
    onChange();
  });
  return { sync: close };
}
function renderSelect(side) {
  const s = $(side + "Item"),
    keep = s.value || (side === "from" ? "DIAMOND" : "DIRT");
  s.replaceChildren();
  for (const item of list()) {
    const o = document.createElement("option");
    o.value = item.id;
    o.textContent = priceLabel(item);
    s.append(o);
  }
  s.value = keep;
  if (!s.value && s.options.length) s.selectedIndex = 0;
  itemPickers[side]?.sync();
}
let latestConversion = null;
function update() {
  itemPickers.from?.sync();
  itemPickers.to?.sync();
  const a = get($("fromItem").value),
    b = get($("toItem").value),
    shop = $("shopMode").checked;
  const targetPrice = shop ? b.buy : b.sell;
  $("fromRate").innerHTML = rateMarkup(a, "from");
  $("toRate").innerHTML = rateMarkup(b, "to");
  $("toRateLabel").textContent = shop
    ? "Kaufpreis pro Item"
    : "Verkaufswert pro Item";
  $("resultMode").textContent = shop
    ? "SHOP · SELL → BUY"
    : "WERTVERGLEICH · SELL → SELL";
  $("fromQty").step = shop ? "1" : "any";
  const amount = shop ? whole($("fromQty").value) : num($("fromQty").value);
  if ($("fromQty").value !== "") $("fromQty").value = amount;
  const value = amount * a.sell,
    ratio = value / targetPrice;
  const dest = shop ? Math.max(0, Math.floor(ratio + 1e-10)) : ratio;
  latestConversion =
    list().length && Number.isFinite(dest)
      ? { itemId: b.id, amount: dest }
      : null;
  $("useResult").disabled = !latestConversion;
  $("result").textContent = shop
    ? `${fmt(amount)} × ${a.name} verkaufen → ${fmt(dest)} × ${b.name} kaufen`
    : `${fmt(amount)} × ${a.name} = ${fmt(dest)} × ${b.name}`;
}
$("shopMode").addEventListener("change", () => update());
function redraw() {
  renderSelect("from");
  renderSelect("to");
  update();
  renderCustom();
  renderEditor();
  renderHeaderStatus();
}
function renderEditor() {
  const sel = $("editItem"),
    keep = sel.value || "DIAMOND";
  sel.replaceChildren();
  for (const item of list()) {
    const o = document.createElement("option");
    o.value = item.id;
    o.textContent = priceLabel(item);
    sel.append(o);
  }
  sel.value = keep;
  if (!sel.value && sel.options.length) sel.selectedIndex = 0;
  syncEditor();
  $("modifiedCount").textContent =
    `${list().filter((x) => wasChanged(x.id)).length} Item(s) mit geändertem Buy/Sell-Preis.`;
}
function syncEditor() {
  itemPickers.edit?.sync();
  const id = $("editItem").value;
  if (!id) return;
  const x = get(id);
  $("editBuy").value = x.buy;
  $("editSell").value = x.sell;
  $("editBuyDefault").textContent =
    "Standard: " + fmtPrice(x.defaultBuy) + " VC";
  $("editSellDefault").textContent =
    "Standard: " + fmtPrice(x.defaultSell) + " VC";
  $("restoreEdit").disabled = !wasChanged(id);
}
function refreshPrices() {
  const from = $("fromItem").value,
    to = $("toItem").value,
    edit = $("editItem").value;
  renderSelect("from");
  renderSelect("to");
  $("fromItem").value = from;
  $("toItem").value = to;
  update();
  renderEditor();
  $("editItem").value = edit;
  syncEditor();
}
function renderCustom() {
  const ul = $("customList");
  ul.replaceChildren();
  for (const item of custom) {
    const li = document.createElement("li"),
      txt = document.createElement("span"),
      del = document.createElement("button");
    txt.textContent = `${item.name} · Buy ${fmtPrice(item.buy)} / Sell ${fmtPrice(item.sell)} VC`;
    del.className = "btn";
    del.textContent = "Löschen";
    del.type = "button";
    del.addEventListener("click", () => {
      custom = custom.filter((x) => x.id !== item.id);
      save();
      redraw();
    });
    li.append(txt, del);
    ul.append(li);
  }
}
for (const side of ["from", "to"])
  itemPickers[side] = createItemPicker(side, () => update());
itemPickers.edit = createItemPicker("edit", () => syncEditor());
$("fromQty").addEventListener("input", () => update());
$("quantityShortcuts").addEventListener("click", (e) => {
  const button = e.target.closest("button[data-amount]");
  if (!button) return;
  const amount = num($("fromQty").value) + Number(button.dataset.amount);
  if (!Number.isFinite(amount)) return;
  $("fromQty").value = amount;
  update();
});
$("clearQty").addEventListener("click", () => {
  $("fromQty").value = "";
  update();
  $("fromQty").focus();
});
$("useResult").addEventListener("click", () => {
  if (!latestConversion) return;
  const { itemId, amount } = latestConversion,
    previousFrom = $("fromItem").value;
  $("fromSearch").value = "";
  $("toSearch").value = "";
  renderSelect("from");
  renderSelect("to");
  $("fromItem").value = itemId;
  $("toItem").value = previousFrom;
  $("fromQty").value = amount;
  update();
});
$("swap").addEventListener("click", () => {
  const a = $("fromItem").value,
    b = $("toItem").value;
  $("fromSearch").value = "";
  $("toSearch").value = "";
  renderSelect("from");
  renderSelect("to");
  $("fromItem").value = b;
  $("toItem").value = a;
  update();
});
$("reset").addEventListener("click", () => {
  $("shopMode").checked = false;
  $("fromSearch").value = "";
  $("toSearch").value = "";
  $("fromQty").value = "1";
  renderSelect("from");
  renderSelect("to");
  $("fromItem").value = list().some((x) => x.id === "DIAMOND")
    ? "DIAMOND"
    : list()[0].id;
  $("toItem").value = "DIRT";
  update();
});
$("copy").addEventListener("click", async () => {
  const msg = $("result").textContent;
  try {
    await navigator.clipboard.writeText(msg);
    $("copyStatus").textContent = "Ergebnis kopiert.";
  } catch (e) {
    $("copyStatus").textContent = "Kopieren nicht unterstützt.";
  }
});
$("add").addEventListener("click", () => {
  const name = $("newName").value.trim(),
    buyRaw = num($("newBuy").value),
    sellRaw = num($("newSell").value),
    msg = $("addStatus");
  if (!name || !validPrice(buyRaw) || !validPrice(sellRaw)) {
    msg.textContent = "Bitte Namen und beide Preise grösser als null eingeben.";
    return;
  }
  const id =
      "CUSTOM_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    buy = buyRaw,
    sell = sellRaw;
  custom.push({
    id,
    name,
    buy,
    sell,
    defaultBuy: buy,
    defaultSell: sell,
    isCustom: true,
  });
  save();
  $("fromSearch").value = "";
  redraw();
  $("fromItem").value = id;
  update();
  $("newName").value = "";
  msg.textContent = "Eigenes Item hinzugefügt.";
});
$("saveEdit").addEventListener("click", () => {
  const id = $("editItem").value,
    buyRaw = num($("editBuy").value),
    sellRaw = num($("editSell").value),
    msg = $("editStatus");
  if (!validPrice(buyRaw) || !validPrice(sellRaw)) {
    msg.textContent =
      "Beide Preise müssen endliche Zahlen grösser als null sein.";
    return;
  }
  const x = list().find((x) => x.id === id);
  if (!x) return;
  x.buy = buyRaw;
  x.sell = sellRaw;
  save();
  msg.textContent = "Buy und Sell übernommen.";
  refreshPrices();
  renderCustom();
});
$("restoreEdit").addEventListener("click", () => {
  const x = list().find((x) => x.id === $("editItem").value);
  if (!x) return;
  x.buy = x.defaultBuy;
  x.sell = x.defaultSell;
  save();
  $("editStatus").textContent = "Beide Standardpreise wiederhergestellt.";
  refreshPrices();
  renderCustom();
});
function exportList() {
  const blob = new Blob([JSON.stringify(currentPayload(), null, 2) + "\n"], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = selectedFile;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status("JSON-Sicherung heruntergeladen.");
}
$("exportData").addEventListener("click", exportList);
$("reloadData").addEventListener("click", async () => {
  if (
    !confirm(
      "Nicht gespeicherte Änderungen durch aktuelle Online-Werte ersetzen?",
    )
  )
    return;
  try {
    await chooseList($("priceList").value);
  } catch (err) {
    status(err.message);
  }
});
$("adminLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = $("adminPassword").value;
  const msg = $("adminStatus");
  msg.textContent = "Zugang wird geprüft …";
  try {
    acceptSession(await requestAdmin({ password: pw }));
    msg.textContent = "";
    status("Verwaltung entsperrt. Änderungen werden online gespeichert.");
  } catch (err) {
    msg.textContent = err.message;
  }
});
$("adminLogout").addEventListener("click", () => {
  setUnlocked(false);
  $("adminStatus").textContent = "Verwaltung gesperrt.";
});
async function chooseList(file) {
  const previous = selectedFile;
  switching = true;
  $("priceList").disabled = true;
  adminInner.inert = true;
  try {
    await writeChain;
    selectedFile = file;
    await loadRemote();
    $("priceList").value = file;
    $("listStatus").textContent = "Geladen: " + file;
  } catch (err) {
    selectedFile = previous;
    $("priceList").value = previous;
    $("listStatus").textContent = err.message;
    throw err;
  } finally {
    switching = false;
    const locked = management.classList.contains("locked");
    $("priceList").disabled = locked;
    adminInner.inert = locked;
  }
}
async function init() {
  setUnlocked(false, false);
  await restoreSession();
  try {
    const r = await fetch(
      apiUrl ? apiUrl + "/lists" : "./preislisten/index.json",
      { cache: "no-store" },
    );
    if (!r.ok)
      throw Error(
        "Preislisten-Verzeichnis nicht verfügbar (HTTP " + r.status + ").",
      );
    const body = await r.json();
    if (!Array.isArray(body.lists))
      throw Error("Ungültiges Preislisten-Verzeichnis.");
    const entries = body.lists.filter((x) => validFile(x.file));
    if (!entries.length) throw Error("Keine Preislisten gefunden.");
    for (const entry of entries) {
      const o = document.createElement("option");
      o.value = entry.file;
      o.textContent = entry.name || entry.file;
      $("priceList").append(o);
    }
    await chooseList(entries[0].file);
  } catch (err) {
    setSynchronized(false);
    $("listStatus").textContent = err.message;
    status("Laden fehlgeschlagen: " + err.message);
    $("result").textContent = "Preisliste nicht verfügbar";
  }
}
renderHeaderStatus();
init();
