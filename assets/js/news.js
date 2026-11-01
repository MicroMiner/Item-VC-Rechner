import { loadData, safeUrl, element } from "./portal-data.js";
const container = document.getElementById("newsList");
const preview = container.dataset.preview === "true";
const categories = new Set(["Ankündigung", "Update", "Changelog", "Wartung"]);
const dateFormatter = new Intl.DateTimeFormat("de-CH", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Zurich",
});
function validEntry(entry) {
  return (
    entry &&
    typeof entry.id === "string" &&
    entry.id.trim() &&
    ["manual", "discord"].includes(entry.source) &&
    (entry.source === "manual"
      ? entry.sourceId == null || typeof entry.sourceId === "string"
      : typeof entry.sourceId === "string" && entry.sourceId.trim()) &&
    categories.has(entry.category) &&
    typeof entry.title === "string" &&
    entry.title.trim() &&
    typeof entry.content === "string" &&
    entry.content.trim() &&
    typeof entry.publishedAt === "string" &&
    /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(entry.publishedAt) &&
    Number.isFinite(Date.parse(entry.publishedAt))
  );
}
function renderEntry(entry) {
  const article = element(
    "article",
    preview ? "news-preview" : "card news-card",
  );
  const meta = element("div", "news-meta");
  meta.append(element("span", "news-category", entry.category));
  const time = element(
    "time",
    "",
    dateFormatter.format(new Date(entry.publishedAt)),
  );
  time.dateTime = entry.publishedAt;
  meta.append(time);
  const heading = element(preview ? "h3" : "h2", "", entry.title);
  const excerpt =
    entry.content.length > 180
      ? entry.content.slice(0, 180).trimEnd() + " …"
      : entry.content;
  article.append(
    meta,
    heading,
    element("p", "news-content", preview ? excerpt : entry.content),
  );
  if (!preview) {
    const src = safeUrl(entry.image);
    if (src) {
      const image = element("img", "news-image");
      image.src = src;
      image.alt = entry.title;
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener(
        "error",
        () => {
          image.remove();
          article.append(
            element(
              "p",
              "muted",
              "Das Beitragsbild ist derzeit nicht verfügbar.",
            ),
          );
        },
        { once: true },
      );
      article.append(image);
    }
    const url = safeUrl(entry.url);
    if (url) {
      const link = element("a", "portal-link", "Mehr erfahren");
      link.href = url;
      link.rel = "noopener noreferrer";
      article.append(link);
    }
  }
  return article;
}
try {
  const raw = await loadData("assets/data/updates.json", "updates");
  const seen = new Set();
  const entries = raw
    .filter((entry) => {
      if (!validEntry(entry) || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  container.replaceChildren();
  if (!entries.length) {
    container.append(
      element(
        "p",
        "muted",
        raw.length
          ? "Derzeit sind keine gültigen Neuigkeiten verfügbar."
          : preview
            ? "Aktuell gibt es noch keine Neuigkeiten."
            : "Noch keine Neuigkeiten vorhanden. Hier findest du zukünftig alle wichtigen Änderungen rund um VeloCity.",
      ),
    );
  } else {
    container.append(
      ...(preview ? entries.slice(0, 1) : entries).map(renderEntry),
    );
    if (!preview && entries.length < raw.length)
      container.append(
        element(
          "p",
          "muted",
          "Einige ungültige oder doppelte Meldungen wurden nicht angezeigt.",
        ),
      );
  }
} catch {
  container.replaceChildren(
    element(
      "p",
      "portal-error",
      "Neuigkeiten konnten nicht geladen werden. Bitte versuche es später erneut.",
    ),
  );
}
