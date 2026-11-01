"use strict";
(() => {
  const config = window.VELOCITY_CONFIG || {};
  const address =
    typeof config.serverAddress === "string" ? config.serverAddress.trim() : "";
  const input = document.getElementById("serverAddress");
  const button = document.getElementById("copyServerAddress");
  const status = document.getElementById("serverCopyStatus");
  document.getElementById("serverVersion").textContent =
    config.minecraftEdition && config.minecraftVersion
      ? `Minecraft ${config.minecraftEdition} · ${config.minecraftVersion}`
      : "Serverversion derzeit nicht verfügbar";
  input.value = address;
  button.disabled = !address;
  let feedbackTimer;
  button.addEventListener("click", async () => {
    if (!address) return;
    clearTimeout(feedbackTimer);
    try {
      if (!navigator.clipboard?.writeText) throw Error("Clipboard unavailable");
      await navigator.clipboard.writeText(address);
      status.textContent = "IP kopiert";
      feedbackTimer = setTimeout(() => {
        status.textContent = "";
      }, 3000);
    } catch {
      input.focus();
      input.select();
      status.textContent =
        "Automatisches Kopieren nicht möglich. Die Serveradresse ist markiert; bitte manuell kopieren.";
    }
  });
})();
