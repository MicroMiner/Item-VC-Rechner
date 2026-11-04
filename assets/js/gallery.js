import { loadData, safeUrl, element } from "./portal-data.js";
const grid = document.getElementById("galleryGrid");
const dialog = document.getElementById("galleryDialog");
const full = document.getElementById("galleryFullImage");
const title = document.getElementById("galleryTitle");
const description = document.getElementById("galleryDescription");
const position = document.getElementById("galleryPosition");
const imageStatus = document.getElementById("galleryImageStatus");
const categoryNames = new Set([
  "Spawn",
  "Bauprojekte",
  "Landschaften",
  "Community",
  "Sonstiges",
]);
const imageDirectory = new URL("../img/gallery/", import.meta.url);
let images = [],
  active = 0;
function localImage(value) {
  const url = safeUrl(value);
  return url && url.startsWith(imageDirectory.href) ? url : null;
}
function showImage(index) {
  active = (index + images.length) % images.length;
  const image = images[active];
  imageStatus.textContent = "Bild wird geladen …";
  full.alt = image.alt;
  full.width = image.width || 1920;
  full.height = image.height || 1017;
  full.src = localImage(image.src);
  title.textContent = image.title;
  description.textContent = image.description || "";
  description.hidden = !image.description;
  position.textContent = `${active + 1} / ${images.length}`;
  dialog.classList.add("is-loading");
  if (!dialog.open) {
    dialog.showModal();
    document.documentElement.classList.add("gallery-viewer-open");
  }
}
full.addEventListener("load", () => {
  dialog.classList.remove("is-loading");
  imageStatus.textContent = "";
});
full.addEventListener("error", () => {
  dialog.classList.remove("is-loading");
  imageStatus.textContent =
    "Das Originalbild konnte nicht geladen werden. Bitte versuche es später erneut.";
});
document
  .getElementById("galleryClose")
  .addEventListener("click", () => dialog.close());
document
  .getElementById("galleryPrevious")
  .addEventListener("click", () => showImage(active - 1));
document
  .getElementById("galleryNext")
  .addEventListener("click", () => showImage(active + 1));
dialog.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    showImage(active + (event.key === "ArrowRight" ? 1 : -1));
  }
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
// Modal focus and Escape handling are provided by the native dialog.
const fullscreenButton = document.getElementById("galleryFullscreen");
let ownsFullscreen = false;
dialog.addEventListener("close", () => {
  document.documentElement.classList.remove("gallery-viewer-open");
  if (ownsFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  ownsFullscreen = false;
});
if (document.documentElement.requestFullscreen) {
  fullscreenButton.hidden = false;
  fullscreenButton.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else { await document.documentElement.requestFullscreen(); ownsFullscreen = true; }
    } catch { imageStatus.textContent = "Browser-Vollbild ist hier nicht verfügbar. Das Bild nutzt weiterhin die gesamte Fensterfläche."; }
  });
  document.addEventListener("fullscreenchange", () => {
    fullscreenButton.setAttribute("aria-label", document.fullscreenElement ? "Browser-Vollbild beenden" : "Browser-Vollbild aktivieren");
    if (!document.fullscreenElement) ownsFullscreen = false;
  });
}
let touchStart = null;
dialog.addEventListener("touchstart", event => {
  touchStart = event.touches.length === 1 ? {x:event.touches[0].clientX,y:event.touches[0].clientY} : null;
}, {passive:true});
dialog.addEventListener("touchmove", event => { if(event.touches.length !== 1) touchStart = null; }, {passive:true});
dialog.addEventListener("touchend", event => {
  if (!touchStart || event.touches.length) return;
  const end = event.changedTouches[0], dx = end.clientX-touchStart.x, dy = end.clientY-touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy)*1.5 && (window.visualViewport?.scale || 1) <= 1) showImage(active + (dx < 0 ? 1 : -1));
}, {passive:true});
dialog.addEventListener("touchcancel", () => { touchStart = null; });
try {
  const raw = await loadData("assets/data/gallery.json", "images");
  const seen = new Set();
  images = raw.filter((image) => {
    if (
      !image ||
      typeof image.id !== "string" ||
      !image.id.trim() ||
      seen.has(image.id) ||
      !localImage(image.src) ||
      typeof image.title !== "string" ||
      !image.title.trim() ||
      typeof image.alt !== "string" ||
      !image.alt.trim()
    )
      return false;
    seen.add(image.id);
    return true;
  });
  document.getElementById("galleryTotal").textContent = `${images.length} ${images.length === 1 ? "Bild" : "Bilder"}`;
  grid.replaceChildren();
  for (const [index, image] of images.entries()) {
    const button = element("button", "gallery-card");
    button.type = "button";
    button.setAttribute("aria-label", `${image.title} vergrössern`);
    button.setAttribute("aria-haspopup", "dialog");
    const thumbnail = element("img", "");
    thumbnail.src = localImage(image.thumbnail) || localImage(image.src);
    thumbnail.alt = image.alt;
    thumbnail.width = image.width || 1920;
    thumbnail.height = image.height || 1017;
    thumbnail.loading = index < 3 ? "eager" : "lazy";
    thumbnail.decoding = "async";
    thumbnail.addEventListener(
      "error",
      () => {
        button.classList.add("image-unavailable");
        button.append(
          element(
            "span",
            "portal-message",
            "Vorschaubild nicht verfügbar – Original öffnen",
          ),
        );
      },
      { once: true },
    );
    const caption = element("span", "gallery-caption");
    caption.append(
      element("span", "gallery-card-title", image.title),
      element(
        "span",
        "gallery-category",
        categoryNames.has(image.category) ? image.category : "Sonstiges",
      ),
    );
    const media = element("span", "gallery-media");
    const expand = element("span", "gallery-expand", "⛶");
    expand.setAttribute("aria-hidden", "true");
    media.append(thumbnail, expand);
    button.append(media, caption);
    button.addEventListener("click", () => showImage(index));
    grid.append(button);
  }
  if (!images.length)
    grid.append(element("p", "muted", "Derzeit sind keine Bilder verfügbar."));
  if (images.length < raw.length)
    document.getElementById("galleryStatus").textContent =
      "Einige ungültige Galerieeinträge wurden nicht angezeigt.";
} catch {
  grid.replaceChildren(
    element(
      "p",
      "portal-error",
      "Die Galerie konnte nicht geladen werden. Bitte versuche es später erneut.",
    ),
  );
} finally {
  grid.setAttribute("aria-busy", "false");
}
