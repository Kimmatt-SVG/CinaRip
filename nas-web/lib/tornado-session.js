"use strict";

const COOKIE_LOGIN_MESSAGE =
  "The NAS is not signed into Tornado (Chrome login does not count). On CinaRip Search, paste _identity-frontend1 and advanced-frontend from Chrome DevTools → Application → Cookies.";
const CAPTCHA_FINISH_MESSAGE = COOKIE_LOGIN_MESSAGE;

function requireRecaptcha(token) {
  if (String(token || "").trim()) return null;
  return {
    ok: false,
    needsCaptcha: true,
    error: CAPTCHA_FINISH_MESSAGE
  };
}

function isVerificationError(message) {
  return /verification code|recaptcha|captcha/i.test(String(message || ""));
}

function parseCsrfFromHtml(html) {
  const text = String(html || "");
  return {
    param: text.match(/name="csrf-param" content="([^"]+)"/i)?.[1] || "_csrf",
    token: text.match(/name="csrf-token" content="([^"]+)"/i)?.[1] || ""
  };
}

function isDownloadLoginWall(body) {
  const text = String(body || "");
  if (/loadshare\.(?:org|net)\//i.test(text)) return false;
  try {
    const data = JSON.parse(text);
    if (data && data.response === false && /login|captcha|premium|verification/i.test(JSON.stringify(data))) {
      return true;
    }
  } catch {
    // not JSON
  }
  if (text.length < 8000 && /SignupForm\[email\]/i.test(text) && /\/user\/login/i.test(text)) return true;
  if (text.length < 4000 && /please\s+(log|sign)\s*in/i.test(text)) return true;
  if (text.length < 4000 && isVerificationError(text) && !/<html/i.test(text)) return true;
  return false;
}

function downloadLoginWallMessage() {
  return COOKIE_LOGIN_MESSAGE;
}

const IDENTITY_COOKIE_RE = /^_?identity/i;
const IDENTITY_COOKIE_NAMES = ["identity", "_identity"];
const SESSION_COOKIE_NAMES = ["advanced-frontend"];

function cookieValue(jar, name) {
  if (!jar || typeof jar !== "object") return "";
  const wanted = String(name || "").toLowerCase();
  for (const [key, value] of Object.entries(jar)) {
    if (String(key || "").toLowerCase() === wanted && value != null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function isNonEmptyCookieValue(value) {
  return value != null && String(value).trim();
}

function isIdentityCookieName(name) {
  return IDENTITY_COOKIE_RE.test(String(name || ""));
}

function hasIdentityCookie(jar) {
  if (!jar || typeof jar !== "object") return false;
  return Object.entries(jar).some(([name, value]) => isIdentityCookieName(name) && isNonEmptyCookieValue(value));
}

function hasNamedSessionCookie(jar) {
  return SESSION_COOKIE_NAMES.some((name) => cookieValue(jar, name));
}

function hasSessionEvidence(jar) {
  return hasIdentityCookie(jar) || hasNamedSessionCookie(jar);
}

function htmlLooksLikeChallenge(html) {
  const text = String(html || "");
  return /just a moment|cf-browser-verification|challenge-platform|cf-challenge|attention required|enable javascript and cookies|checking your browser|cf-error|cdn-cgi\/challenge/i.test(
    text
  );
}

function htmlShowsLoggedIn(html) {
  return /\/user\/logout/i.test(String(html || ""));
}

function htmlLooksLikeSite(html) {
  const text = String(html || "");
  if (!text || htmlLooksLikeChallenge(text)) return false;
  return /csrf-token|tornado|SignupForm|film_list|\/user\/|premiummembership/i.test(text);
}

function htmlShowsLoggedOut(html) {
  const text = String(html || "");
  if (!text || htmlLooksLikeChallenge(text) || htmlShowsLoggedIn(text)) return false;
  if (/SignupForm\[email\]/i.test(text) && /\/user\/login/i.test(text)) return true;
  if (text.length < 4000 && /please\s+(log|sign)\s*in/i.test(text)) return true;
  return false;
}

function evaluateSessionStatus({ html = "", status = 0, jar = {}, lastKnown = null, error = "" } = {}) {
  const hasIdentity = hasIdentityCookie(jar);
  const hasSession = hasSessionEvidence(jar);
  const failed =
    Boolean(error) ||
    (!html && (!status || status >= 500));
  const challenge = htmlLooksLikeChallenge(html) || status === 403 || status === 503;
  const loggedInHtml = htmlShowsLoggedIn(html);
  const loggedOutHtml = htmlShowsLoggedOut(html);

  if (loggedInHtml) {
    return { loggedIn: true, evidence: "logout-link", hasIdentity, confirmed: true };
  }
  if (loggedOutHtml && !hasSession) {
    return { loggedIn: false, evidence: "login-page", hasIdentity, confirmed: true };
  }
  if (hasIdentity && htmlLooksLikeSite(html) && !challenge && !failed) {
    return { loggedIn: true, evidence: "identity-cookie", hasIdentity, confirmed: true };
  }

  const fallback = typeof lastKnown === "boolean" ? lastKnown : null;
  if (hasIdentity || hasSession || failed || challenge) {
    return {
      loggedIn: fallback,
      evidence: failed ? "probe-failed" : challenge ? "challenge" : hasIdentity ? "unconfirmed-identity" : "unconfirmed-session",
      hasIdentity,
      confirmed: false
    };
  }
  if (htmlLooksLikeSite(html)) {
    return { loggedIn: false, evidence: "no-session", hasIdentity: false, confirmed: true };
  }
  return {
    loggedIn: fallback,
    evidence: "unknown",
    hasIdentity: false,
    confirmed: false
  };
}

module.exports = {
  COOKIE_LOGIN_MESSAGE,
  CAPTCHA_FINISH_MESSAGE,
  IDENTITY_COOKIE_NAMES,
  requireRecaptcha,
  isVerificationError,
  parseCsrfFromHtml,
  isDownloadLoginWall,
  downloadLoginWallMessage,
  cookieValue,
  hasIdentityCookie,
  htmlLooksLikeChallenge,
  htmlShowsLoggedIn,
  htmlShowsLoggedOut,
  htmlLooksLikeSite,
  evaluateSessionStatus
};
