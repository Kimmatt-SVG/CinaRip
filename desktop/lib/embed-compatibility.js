const { webFrameMain } = require("electron");
const { CHROME_USER_AGENT } = require("./chrome-compat");

const OPERA_GX_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.205 Safari/537.36 OPR/119.0.5497.40";

const EMBED_UA_HOST_PATTERN =
  /(?:^|\.)vidnest\.fun$|(?:^|\.)animanga\.fun$|(?:^|\.)vidplay\.|(?:^|\.)megacloud\.|(?:^|\.)rabbitstream\.net$|(?:^|\.)echovideo\.|(?:^|\.)gn1r5n\.org$|(?:^|\.)myvidplay\.com$/i;

const EMBED_COMPAT_SCRIPT = `
(() => {
  if (window.__embedCompatInstalled) return;
  window.__embedCompatInstalled = true;

  const host = String(window.location.hostname || "");
  const isEmbedHost = /(?:^|\\.)vidnest\\.fun$|(?:^|\\.)animanga\\.fun$|(?:^|\\.)vidplay\\.|(?:^|\\.)megacloud\\.|(?:^|\\.)rabbitstream\\.net$|(?:^|\\.)echovideo\\.|(?:^|\\.)gn1r5n\\.org$|(?:^|\\.)myvidplay\\.com$/i.test(host);

  if (isEmbedHost) {
    try {
      const operaUa =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.205 Safari/537.36 OPR/119.0.5497.40";
      if (!/OPR\\//i.test(navigator.userAgent)) {
        Object.defineProperty(navigator, "userAgent", { get: () => operaUa, configurable: true });
        Object.defineProperty(navigator, "vendor", { get: () => "Opera Software ASA", configurable: true });
      }
    } catch {
      // Some pages lock down navigator.
    }
  }

  function isOperaPromoText(text) {
    const value = String(text || "");
    if (/opera\\s*gx/i.test(value) && /unlock|install|please/i.test(value)) return true;
    if (/browse faster/i.test(value) && /ad blocking|built-in security/i.test(value)) return true;
    if (/opera/i.test(value) && /browse faster|ad blocking|built-in security/i.test(value)) return true;
    return false;
  }

  function nodeMentionsOperaGate(node) {
    if (!node || node === document.body || node === document.documentElement) return false;
    return isOperaPromoText(node.textContent || node.innerText || "");
  }

  function clickDismissControl(root) {
    const selectors = [
      "button",
      "a",
      "[role='button']",
      "input[type='button']",
      "[aria-label*='close' i]",
      "[class*='close' i]",
      "[class*='dismiss' i]"
    ];

    for (const selector of selectors) {
      for (const element of root.querySelectorAll(selector)) {
        const label = String(
          element.textContent || element.value || element.getAttribute("aria-label") || ""
        ).trim();
        if (/^(ok|cancel|close|skip|no thanks|dismiss|x)$/i.test(label)) {
          element.click();
          return true;
        }
        if (element.className && /close|dismiss/i.test(String(element.className))) {
          element.click();
          return true;
        }
      }
    }
    return false;
  }

  function removeOperaGateOverlays() {
    let dismissed = false;

    for (const element of document.querySelectorAll("body *")) {
      if (!nodeMentionsOperaGate(element)) continue;

      const dialogRoot =
        element.closest(
          "[role='dialog'], [class*='modal'], [class*='dialog'], [class*='popup'], [class*='overlay']"
        ) || element;

      if (clickDismissControl(dialogRoot)) {
        dismissed = true;
        continue;
      }

      dialogRoot.remove();
      dismissed = true;
    }

    return dismissed;
  }

  function dismissOperaGate() {
    if (!isOperaPromoText(document.body?.innerText || "")) return;
    removeOperaGateOverlays();
  }

  const observer = new MutationObserver(() => dismissOperaGate());
  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  dismissOperaGate();
  setInterval(dismissOperaGate, 500);
})();
`;

function hostNeedsEmbedUa(url) {
  try {
    return EMBED_UA_HOST_PATTERN.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function setupEmbedUserAgent(session) {
  if (!session) return;

  session.webRequest.onBeforeSendHeaders({ urls: ["*://*/*"] }, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };

    if (hostNeedsEmbedUa(details.url)) {
      requestHeaders["User-Agent"] = OPERA_GX_USER_AGENT;
    } else {
      requestHeaders["User-Agent"] = CHROME_USER_AGENT;
      requestHeaders["Sec-CH-UA"] =
        '"Chromium";v="134", "Google Chrome";v="134", "Not-A.Brand";v="99"';
      requestHeaders["Sec-CH-UA-Mobile"] = "?0";
      requestHeaders["Sec-CH-UA-Platform"] = '"Windows"';
    }

    callback({ cancel: false, requestHeaders });
  });
}

function injectEmbedCompatibility(frame) {
  if (!frame || frame.isDestroyed()) return;
  frame.executeJavaScript(EMBED_COMPAT_SCRIPT).catch(() => {
    // Ignore injection failures on restricted frames.
  });
}

function injectAllFrames(contents) {
  if (!contents || contents.isDestroyed()) return;

  injectEmbedCompatibility(contents.mainFrame);
  for (const frame of contents.mainFrame.framesInSubtree) {
    injectEmbedCompatibility(frame);
  }
}

function setupEmbedCompatibility(session, contents) {
  setupEmbedUserAgent(session);

  if (!contents) return;

  contents.on("dom-ready", () => injectAllFrames(contents));

  contents.on("did-frame-finish-load", (_event, isMainFrame, frameProcessId, frameRoutingId) => {
    const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
    if (!frame || frame.isDestroyed()) return;
    let frameUrl = "";
    try {
      frameUrl = frame.url || "";
    } catch {
      return;
    }
    if (isMainFrame || hostNeedsEmbedUa(frameUrl)) {
      injectEmbedCompatibility(frame);
    }
  });
}

module.exports = {
  OPERA_GX_USER_AGENT,
  setupEmbedCompatibility
};
