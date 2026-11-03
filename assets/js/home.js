"use strict";
(() => {
  const config = window.VELOCITY_CONFIG || {};
  const address =
    typeof config.serverAddress === "string" ? config.serverAddress.trim() : "";
  function validServerAddress(value) {
    const match = /^(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(?::([0-9]{1,5}))?$/.exec(value);
    if (!match || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) return false;
    const host = match[1];
    if (host.startsWith("[")) {
      try { return new URL("http://" + host).hostname.startsWith("["); } catch { return false; }
    }
    if (/^[0-9.]+$/.test(host)) return host.split(".").length === 4 && host.split(".").every(part => Number(part) <= 255 && part.length > 0);
    return host.length <= 253 && host.split(".").every(part => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(part));
  }
  const available = validServerAddress(address);
  const input = document.getElementById("serverAddress");
  const button = document.getElementById("copyServerAddress");
  const status = document.getElementById("serverCopyStatus");
  document.getElementById("serverVersion").textContent =
    config.minecraftEdition && config.minecraftVersion
      ? `Minecraft ${config.minecraftEdition} • ${config.minecraftVersion}`
      : "Serverversion derzeit nicht verfügbar";
  input.value = address;
  button.disabled = !available;
  let feedbackTimer;
  button.addEventListener("click", async () => {
    if (!available) return;
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
