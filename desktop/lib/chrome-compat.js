const CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

const CHROME_COMPAT_SCRIPT = `
(() => {
  if (window.__chromeCompatInstalled) return;
  window.__chromeCompatInstalled = true;

  try {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined, configurable: true });
  } catch {
    // Some pages lock down navigator.
  }

  if (!window.chrome) {
    window.chrome = { runtime: {} };
  }

  try {
    const chromeUa =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
    if (/electron/i.test(navigator.userAgent)) {
      Object.defineProperty(navigator, "userAgent", { get: () => chromeUa, configurable: true });
      Object.defineProperty(navigator, "vendor", { get: () => "Google Inc.", configurable: true });
    }
  } catch {
    // Some pages lock down navigator.
  }
})();
`;

function isLoginOrCaptchaUrl(url) {
  return /tornadomovies\.co\/user\/premiummembership/i.test(String(url || ""));
}

function setupChromeCompatibility(session, contents) {
  if (session) {
    session.setUserAgent(CHROME_USER_AGENT);
  }

  if (!contents) return;

  const inject = (frame) => {
    if (!frame || frame.isDestroyed()) return;
    frame.executeJavaScript(CHROME_COMPAT_SCRIPT).catch(() => {
      // Ignore injection failures on restricted frames.
    });
  };

  contents.on("dom-ready", () => inject(contents.mainFrame));
}

module.exports = {
  CHROME_USER_AGENT,
  isLoginOrCaptchaUrl,
  setupChromeCompatibility
};
