"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  SESSION_COOKIE_NAME,
  DEFAULT_SESSION_TTL_SEC,
  parseEnv,
  publicAuthConfig,
  publicSessionJson,
  signPayload,
  verifySigned,
  parseCookieHeader,
  sessionFromRequest,
  buildSessionCookie,
  isPublicPath,
  wantsHtml,
  isHttpsRequest,
  verifyPinAttempt,
  cookieHeader,
  appendSetCookie
} = require("../lib/pin-auth");

describe("PIN NAS lock", () => {
  it("reads APP_PIN or CINARIP_PIN and stays unconfigured when empty", () => {
    const open = parseEnv({ SESSION_SECRET: "unit-test-secret-unit-test-secret" });
    assert.equal(open.configured, false);
    const fromApp = parseEnv({
      APP_PIN: "2468",
      SESSION_SECRET: "unit-test-secret-unit-test-secret"
    });
    assert.equal(fromApp.configured, true);
    assert.equal(fromApp.pin, "2468");
    const fromAlt = parseEnv({
      CINARIP_PIN: "1357",
      SESSION_SECRET: "unit-test-secret-unit-test-secret"
    });
    assert.equal(fromAlt.pin, "1357");
    assert.deepEqual(publicAuthConfig(fromApp), {
      ok: true,
      configured: true,
      ttlSec: DEFAULT_SESSION_TTL_SEC,
      locked: false,
      lockedUntil: 0
    });
  });

  it("defaults session TTL to 30 minutes and clamps to 60 seconds", () => {
    const secret = "unit-test-secret-unit-test-secret";
    const defaults = parseEnv({ APP_PIN: "2468", SESSION_SECRET: secret });
    assert.equal(defaults.ttlSec, 30 * 60);
    assert.equal(DEFAULT_SESSION_TTL_SEC, 1800);
    const oneMinute = parseEnv({
      APP_PIN: "2468",
      SESSION_SECRET: secret,
      SESSION_TTL_MINUTES: "1"
    });
    assert.equal(oneMinute.ttlSec, 60);
    const clamped = parseEnv({
      APP_PIN: "2468",
      SESSION_SECRET: secret,
      SESSION_TTL_MINUTES: "0.5"
    });
    assert.equal(clamped.ttlSec, 60);
    const fromSec = parseEnv({
      APP_PIN: "2468",
      SESSION_SECRET: secret,
      SESSION_TTL_SEC: "120"
    });
    assert.equal(fromSec.ttlSec, 120);
  });

  it("round-trips signed session cookies and rejects tampering", () => {
    const config = parseEnv({ APP_PIN: "2468", SESSION_SECRET: "unit-test-secret-unit-test-secret" });
    const cookie = buildSessionCookie(config, { headers: {} });
    assert.match(cookie, new RegExp(`^${SESSION_COOKIE_NAME}=`));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.doesNotMatch(cookie, /Secure/);
    const jar = parseCookieHeader(cookie.split(";")[0]);
    const req = { headers: { cookie: `${SESSION_COOKIE_NAME}=${jar[SESSION_COOKIE_NAME]}` } };
    const session = sessionFromRequest(req, config);
    assert.equal(session.ok, true);
    assert.equal(session.exp - session.iat, config.ttlSec);
    assert.match(cookie, new RegExp(`Max-Age=${config.ttlSec}`));
    const tampered = req.headers.cookie.replace(/[A-Za-z0-9_-]$/, "x");
    assert.equal(sessionFromRequest({ headers: { cookie: tampered } }, config), null);
    assert.equal(verifySigned("not-a-token", config.sessionSecret), null);
  });

  it("matches cookie exp and Max-Age to SESSION_TTL_MINUTES", () => {
    const config = parseEnv({
      APP_PIN: "2468",
      SESSION_SECRET: "unit-test-secret-unit-test-secret",
      SESSION_TTL_MINUTES: "1"
    });
    const before = Math.floor(Date.now() / 1000);
    const cookie = buildSessionCookie(config, { headers: {} });
    const after = Math.floor(Date.now() / 1000);
    assert.match(cookie, /Max-Age=60/);
    const jar = parseCookieHeader(cookie.split(";")[0]);
    const session = sessionFromRequest(
      { headers: { cookie: `${SESSION_COOKIE_NAME}=${jar[SESSION_COOKIE_NAME]}` } },
      config
    );
    assert.equal(session.ok, true);
    assert.ok(session.exp >= before + 60);
    assert.ok(session.exp <= after + 60);
    assert.equal(session.exp - session.iat, 60);
  });

  it("exposes expiresAt in session JSON", () => {
    const config = parseEnv({
      APP_PIN: "2468",
      SESSION_SECRET: "unit-test-secret-unit-test-secret",
      SESSION_TTL_MINUTES: "1"
    });
    assert.deepEqual(publicSessionJson({ ok: true, iat: 1, exp: 1000 }, config), {
      ok: true,
      loggedIn: true,
      expiresAt: 1_000_000,
      ttlSec: 60
    });
    assert.deepEqual(publicSessionJson(null, config), {
      ok: true,
      loggedIn: false,
      expiresAt: 0,
      ttlSec: 60
    });
  });

  it("sets Secure on session cookies when the request is HTTPS via a proxy", () => {
    const config = parseEnv({ APP_PIN: "2468", SESSION_SECRET: "unit-test-secret-unit-test-secret" });
    const req = { headers: { "x-forwarded-proto": "https, http" } };
    assert.equal(isHttpsRequest(req), true);
    assert.match(buildSessionCookie(config, req), /;\s*Secure/);
  });

  it("expires signed payloads", () => {
    const secret = "unit-test-secret-unit-test-secret";
    const token = signPayload({ ok: true, exp: Math.floor(Date.now() / 1000) - 120 }, secret);
    assert.equal(verifySigned(token, secret), null);
  });

  it("allows the glass splash shell without a session, but not library APIs", () => {
    assert.equal(isPublicPath("/"), true);
    assert.equal(isPublicPath("/index.html"), true);
    assert.equal(isPublicPath("/styles.css"), true);
    assert.equal(isPublicPath("/api/auth/pin"), true);
    assert.equal(isPublicPath("/api/health"), true);
    assert.equal(isPublicPath("/api/library"), false);
    assert.equal(isPublicPath("/api/stream/abc"), false);
    assert.equal(isPublicPath("/api/auth/google"), false);
  });

  it("treats the library homepage as HTML", () => {
    assert.equal(wantsHtml({ headers: { accept: "text/html" } }, "/"), true);
    assert.equal(wantsHtml({ headers: { accept: "application/json" } }, "/api/library"), false);
  });

  it("accepts the configured PIN and rejects a wrong PIN", () => {
    const config = parseEnv({ APP_PIN: "2468", SESSION_SECRET: "unit-test-secret-unit-test-secret" });
    assert.equal(verifyPinAttempt("2468", config).ok, true);
    const wrong = verifyPinAttempt("0000", config);
    assert.equal(wrong.ok, false);
    assert.equal(wrong.status, 401);
    assert.equal(wrong.error, "Wrong PIN");
  });

  it("locks after repeated failures", () => {
    const config = parseEnv({ APP_PIN: "2468", SESSION_SECRET: "unit-test-secret-unit-test-secret" });
    const now = Date.now();
    for (let i = 0; i < 7; i += 1) {
      assert.equal(verifyPinAttempt("nope", config, now).status, 401);
    }
    const locked = verifyPinAttempt("nope", config, now);
    assert.equal(locked.status, 429);
    const still = verifyPinAttempt("2468", config, now + 1000);
    assert.equal(still.status, 429);
    const after = verifyPinAttempt("2468", config, now + 31_000);
    assert.equal(after.ok, true);
  });

  it("appends Set-Cookie headers without clobbering existing cookies", () => {
    const headers = {};
    const res = {
      getHeader(name) {
        return headers[name.toLowerCase()];
      },
      setHeader(name, value) {
        headers[name.toLowerCase()] = value;
      }
    };
    res.setHeader("Set-Cookie", "unrelated=keep");
    appendSetCookie(res, cookieHeader("a", "1", { headers: {} }));
    const list = res.getHeader("Set-Cookie");
    assert.equal(list[0], "unrelated=keep");
    assert.match(list[1], /^a=/);
  });
});
