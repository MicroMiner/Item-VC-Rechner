"use strict";

// Legal notice and the collapsible administration panel.
(() => {
  const impressumDialog = document.getElementById("impressum");
  // Shared editorial notice for all four pages. This is not a confirmation
  // of legal compliance; any required provider details must be added factually.
  // Static project-owned markup only; no external or user content is interpolated.
  impressumDialog.innerHTML = `
    <button class="btn legal-close" id="closeImpressum" type="button"
      aria-label="Impressum schliessen" autofocus>×</button>
    <h2 id="impressumTitle">Impressum</h2>
    <dl class="legal-project">
      <div><dt>Projekt</dt> <dd>VeloCity – Minecraft Survival Server</dd></div>
      <div><dt>Webentwicklung</dt> <dd>MicroMiner</dd></div>
    </dl>
    <h3>Über das Projekt</h3>
    <p>VeloCity ist ein unabhängiges Minecraft-Community-Projekt mit eigenem Wirtschaftssystem, individuell entwickelten Plugins und ergänzenden Web-Tools.</p>
    <h3>Rechtlicher Hinweis</h3>
    <p>VeloCity ist ein unabhängiges Minecraft-Fanprojekt und steht in keiner offiziellen Verbindung zu Mojang Studios oder Microsoft.</p>
    <hr class="legal-divider">
    <p class="legal-copyright">© 2026 VeloCity</p>
  `;
  document
    .getElementById("openImpressum")
    .addEventListener("click", (event) => {
      event.preventDefault();
      if (!impressumDialog.open) impressumDialog.showModal();
    });
  document
    .getElementById("closeImpressum")
    .addEventListener("click", () => impressumDialog.close());
  impressumDialog.addEventListener("click", (event) => {
    if (event.target !== impressumDialog) return;
    const bounds = impressumDialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      impressumDialog.close();
  });
  const adminToggle = document.getElementById("toggleAdmin"),
    adminPanel = document.getElementById("adminPanel");
  if (adminToggle && adminPanel)
    adminToggle.addEventListener("click", () => {
      const expanded = adminToggle.getAttribute("aria-expanded") !== "true";
      if (!expanded && adminPanel.contains(document.activeElement))
        adminToggle.focus();
      adminToggle.setAttribute("aria-expanded", String(expanded));
      adminToggle.setAttribute(
        "aria-label",
        expanded ? "Preisverwaltung einklappen" : "Preisverwaltung ausklappen",
      );
      adminToggle.title = adminToggle.getAttribute("aria-label");
      adminPanel.inert = !expanded;
      adminPanel.setAttribute("aria-hidden", String(!expanded));
    });
})();
