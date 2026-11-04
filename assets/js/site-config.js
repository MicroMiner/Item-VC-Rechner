"use strict";
// Public server information only. Keep economy API settings in config.js.
window.VELOCITY_CONFIG = Object.freeze({
  serverName: "VeloCity",
  minecraftEdition: "Java",
  minecraftVersion: "1.26.3",
  serverAddress: null,
  discordInvite: null,
  // Public BlueMap address. HTTP maps can only open in a separate tab from HTTPS Pages.
  blueMapUrl: "http://134.255.208.82:13003/?utm_source=chatgpt.com#world:0:0:0:1500:0:0:0:0:perspective",
  // HTTPS proxy for embedding; the direct external link stays available.
  blueMapEmbedUrl: "https://velocity-bluemap-proxy.red-base-d220.workers.dev/#world:0:0:0:1500:0:0:0:0:perspective",
  // "static": GitHub-Importer; switch to "api" only after D1/Worker activation.
  newsSource: "static",
});
