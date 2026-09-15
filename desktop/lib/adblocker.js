const fs = require("fs");
const path = require("path");
const fetch = require("cross-fetch");
const { app } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");

let blocker = null;
let adblockerSession = null;

const ALLOWLIST_FILTERS = [
  "@@||loadshare.org^$important",
  "@@||loadshare.org^",
  "@@||tornadomovies.co^$important",
  "@@||tornadomovies.co^",
  "@@||aniwaves.ru^$important",
  "@@||aniwaves.ru^"
];

function cachePath() {
  return path.join(app.getPath("userData"), "adblocker-engine.bin");
}

async function setupAdblocker(session) {
  if (!session) {
    throw new Error("Browser session is required for ad blocking.");
  }

  blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
    path: cachePath(),
    read: fs.promises.readFile.bind(fs.promises),
    write: fs.promises.writeFile.bind(fs.promises)
  });

  // Cosmetic scriptlets/CSS injection into BrowserView has been crashing Electron
  // on Windows (0xC0000005). Keep network blocking only.
  if (blocker.config) {
    blocker.config.loadCosmeticFilters = false;
    blocker.config.enableMutationObserver = false;
  }

  adblockerSession = session;
  blocker.enableBlockingInSession(session);

  if (typeof blocker.updateFromDiff === "function") {
    blocker.updateFromDiff({ added: ALLOWLIST_FILTERS });
  }

  return blocker;
}

function setAdblockerEnabled(session, enabled) {
  if (!blocker || !session) return;

  // Never disable after enable: Ghostery's disable() unregisters IPC handlers and
  // clears session webRequest listeners, which crashes pages still using the preload.
  if (!enabled) return;
  if (!blocker.isBlockingEnabled(session)) {
    blocker.enableBlockingInSession(session);
  }
}

function syncAdblockerForUrl() {
  // Keep blocking enabled for the whole session. Site/CDN exceptions are allowlisted.
}

function isAdblockerEnabled(session) {
  return Boolean(blocker && session && blocker.isBlockingEnabled(session));
}

module.exports = {
  setupAdblocker,
  isAdblockerEnabled,
  setAdblockerEnabled,
  syncAdblockerForUrl
};
