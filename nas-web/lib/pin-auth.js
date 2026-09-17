"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Shared library PIN (not Google). Set APP_PIN or CINARIP_PIN and SESSION_SECRET.
// Copy nas-web/.env.example to nas-web/.env — do not commit the real PIN.

const SESSION_COOKIE_NAME = "cinarip_session";
const DEFAULT_SESSION_TTL_SEC = 30 * 60;
const MAX_PIN_FAILURES = 8;
const PIN_LOCK_MS = 30_000;

const PUBLIC_API_PATHS = new Set([
  "/api/auth/config",
  "/api/auth/session",
  "/api/auth/pin",
  "/api/auth/logout",
  "/api/health",
  "/api/freezer/status"
]);

function loadDotEnv(filePath) {
  const candidates = filePath
    ? [filePath]
    : [path.join(__dirname, ".env"), path.join(__dirname, "..", ".env")];
  for (const abs of candidates) {
    let text;
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      if (process.env[key] != null && String(process.env[key]) !== "") continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
    return true;
  }
  return false;
}

function base64urlEncode(value) {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlDecode(text) {
  const raw = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (raw.length % 4)) % 4);
  return Buffer.from(raw + pad, "base64");
}

function ttlSecondsFromEnv(env = {}) {
  const minutes = Number(env.SESSION_TTL_MINUTES);
  if (Number.isFinite(minutes) && minutes > 0) return Math.max(60, Math.round(minutes * 60));
  const sec = Number(env.SESSION_TTL_SEC);
  if (Number.isFinite(sec) && sec > 0) return Math.max(60, Math.round(sec));
  return DEFAULT_SESSION_TTL_SEC;
}

function parseEnv(env = process.env) {
  const pin = String(env.APP_PIN || env.CINARIP_PIN || "").trim();
  let sessionSecret = String(env.SESSION_SECRET || "").trim();
  let ephemeralSecret = false;
  if (!sessionSecret) {
    sessionSecret = crypto.randomBytes(32).toString("hex");
    ephemeralSecret = true;
  }
  return {
    pin,
    configured: pin.length > 0,
    sessionSecret,
    ephemeralSecret,
    ttlSec: ttlSecondsFromEnv(env),
    lock: { count: 0, until: 0 }
  };
}

function logAuthStartup(config, log = console) {
  if (config.ephemeralSecret) {
    log.warn("SESSION_SECRET is not set; using an ephemeral secret. Sessions reset on restart.");
  }
  if (!config.configured) {
    log.warn("APP_PIN / CINARIP_PIN is not set. The splash PIN cannot unlock the library until a PIN is configured.");
  }
}

function publicAuthConfig(config, now = Date.now()) {
  const lockedUntil = Number(config?.lock?.until) || 0;
  return {
    ok: true,
    configured: Boolean(config?.configured),
    ttlSec: Number(config?.ttlSec) || DEFAULT_SESSION_TTL_SEC,
    locked: lockedUntil > now,
    lockedUntil: lockedUntil > now ? lockedUntil : 0
  };
}

function publicSessionJson(session, config) {
  const ttlSec = Number(config?.ttlSec) || DEFAULT_SESSION_TTL_SEC;
  const loggedIn = Boolean(session?.ok);
  const exp = Number(session?.exp) || 0;
  return {
    ok: true,
    loggedIn,
    expiresAt: loggedIn && exp > 0 ? exp * 1000 : 0,
    ttlSec
  };
}

function signPayload(payload, secret) {
  const body = base64urlEncode(JSON.stringify(payload));
  const mac = base64urlEncode(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${mac}`;
}

function verifySigned(token, secret) {
  const text = String(token || "");
  const dot = text.lastIndexOf(".");
  if (dot < 1) return null;
  const body = text.slice(0, dot);
  const mac = text.slice(dot + 1);
  const expected = base64urlEncode(crypto.createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(base64urlDecode(body).toString("utf8"));
    const exp = Number(payload?.exp) || 0;
    if (exp && exp * 1000 < Date.now() - 60_000) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookieHeader(header) {
  const jar = {};
  for (const part of String(header || "").split(";")) {
    const piece = part.trim();
    if (!piece) continue;
    const eq = piece.indexOf("=");
    if (eq < 1) continue;
    const name = piece.slice(0, eq).trim();
    const value = piece.slice(eq + 1).trim();
    if (!name) continue;
    try {
      jar[name] = decodeURIComponent(value);
    } catch {
      jar[name] = value;
    }
  }
  return jar;
}

function isHttpsRequest(req) {
  const proto = String(req?.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (proto === "https") return true;
  return Boolean(req?.socket?.encrypted);
}

function cookieHeader(name, value, req, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  const maxAge = options.maxAge;
  if (maxAge != null) parts.push(`Max-Age=${Math.max(0, Number(maxAge) || 0)}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (isHttpsRequest(req)) parts.push("Secure");
  return parts.join("; ");
}

function clearCookieHeader(name, req) {
  return cookieHeader(name, "", req, { maxAge: 0, expires: new Date(0) });
}

function appendSetCookie(res, value) {
  const prev = res.getHeader("Set-Cookie");
  if (!prev) {
    res.setHeader("Set-Cookie", value);
    return;
  }
  const list = Array.isArray(prev) ? prev.concat(value) : [prev, value];
  res.setHeader("Set-Cookie", list);
}

function sessionFromRequest(req, config) {
  if (!config?.sessionSecret) return null;
  const jar = parseCookieHeader(req?.headers?.cookie);
  const payload = verifySigned(jar[SESSION_COOKIE_NAME], config.sessionSecret);
  if (!payload?.ok) return null;
  return { ok: true, iat: Number(payload.iat) || 0, exp: Number(payload.exp) || 0 };
}

function buildSessionCookie(config, req) {
  const now = Math.floor(Date.now() / 1000);
  const ttlSec = Number(config?.ttlSec) || DEFAULT_SESSION_TTL_SEC;
  const payload = { ok: true, iat: now, exp: now + ttlSec };
  return cookieHeader(SESSION_COOKIE_NAME, signPayload(payload, config.sessionSecret), req, {
    maxAge: ttlSec
  });
}

function normalizePathname(pathname) {
  const raw = String(pathname || "");
  if (raw === "/") return "/";
  return raw.replace(/\/+$/, "") || "/";
}

function isPublicPath(pathname) {
  const pathName = normalizePathname(pathname);
  if (pathName.startsWith("/api/")) return PUBLIC_API_PATHS.has(pathName);
  return true;
}

function wantsHtml(req, pathname) {
  const pathName = normalizePathname(pathname);
  if (pathName === "/" || pathName.endsWith(".html")) return true;
  const accept = String(req?.headers?.accept || "");
  return /text\/html/i.test(accept) && !/application\/json/i.test(accept.split(",")[0] || "");
}

function loginRedirectLocation() {
  return "/";
}

function pinsMatch(attempt, expected) {
  const left = crypto.createHash("sha256").update(String(attempt || "")).digest();
  const right = crypto.createHash("sha256").update(String(expected || "")).digest();
  return crypto.timingSafeEqual(left, right);
}

function verifyPinAttempt(pin, config, now = Date.now()) {
  if (!config?.configured) {
    return { ok: false, status: 503, error: "PIN is not configured" };
  }
  const lockedUntil = Number(config.lock?.until) || 0;
  if (lockedUntil > now) {
    return {
      ok: false,
      status: 429,
      error: "Too many attempts. Try again in a moment.",
      lockedUntil
    };
  }
  if (pinsMatch(pin, config.pin)) {
    config.lock.count = 0;
    config.lock.until = 0;
    return { ok: true };
  }
  config.lock.count = (Number(config.lock.count) || 0) + 1;
  if (config.lock.count >= MAX_PIN_FAILURES) {
    config.lock.until = now + PIN_LOCK_MS;
    config.lock.count = 0;
    return {
      ok: false,
      status: 429,
      error: "Too many attempts. Try again in a moment.",
      lockedUntil: config.lock.until
    };
  }
  return { ok: false, status: 401, error: "Wrong PIN" };
}

function clearAuthCookies(res, req) {
  appendSetCookie(res, clearCookieHeader(SESSION_COOKIE_NAME, req));
}

module.exports = {
  SESSION_COOKIE_NAME,
  DEFAULT_SESSION_TTL_SEC,
  MAX_PIN_FAILURES,
  PIN_LOCK_MS,
  PUBLIC_API_PATHS,
  loadDotEnv,
  ttlSecondsFromEnv,
  parseEnv,
  logAuthStartup,
  publicAuthConfig,
  publicSessionJson,
  signPayload,
  verifySigned,
  parseCookieHeader,
  isHttpsRequest,
  cookieHeader,
  appendSetCookie,
  sessionFromRequest,
  buildSessionCookie,
  isPublicPath,
  wantsHtml,
  loginRedirectLocation,
  pinsMatch,
  verifyPinAttempt,
  clearAuthCookies
};
