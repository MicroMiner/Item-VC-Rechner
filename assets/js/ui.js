"use strict";

// Legal notice and the collapsible administration panel.
(() => {
  const impressumDialog = document.getElementById("impressum");
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
