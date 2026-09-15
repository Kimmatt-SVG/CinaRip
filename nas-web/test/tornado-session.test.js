"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { TornadoClient } = require("../lib/tornado");
const {
  requireRecaptcha,
  isVerificationError,
  parseCsrfFromHtml,
  isDownloadLoginWall,
  downloadLoginWallMessage,
  CAPTCHA_FINISH_MESSAGE,
  hasIdentityCookie,
  htmlLooksLikeChallenge,
  htmlShowsLoggedIn,
  htmlShowsLoggedOut,
  evaluateSessionStatus
} = require("../lib/tornado-session");

describe("Tornado NAS session", () => {
  it("refuses a login POST when recaptcha is empty", () => {
    const blocked = requireRecaptcha("");
    assert.equal(blocked.ok, false);
    assert.equal(blocked.needsCaptcha, true);
    assert.match(blocked.error, /paste _identity-frontend1/i);
    assert.match(blocked.error, /Application → Cookies/i);
    assert.match(blocked.error, /Chrome login does not count/i);
  });

  it("allows login when a recaptcha token is present", () => {
    assert.equal(requireRecaptcha("03AGdBq8token"), null);
  });

  it("treats verification-code responses as captcha failures", () => {
    assert.equal(isVerificationError("Verification code incorrect"), true);
    assert.equal(isVerificationError("Logged in"), false);
  });

  it("parses Yii CSRF meta tags", () => {
    const html = `<meta name="csrf-param" content="_csrf">\n<meta name="csrf-token" content="abcToken">`;
    assert.deepEqual(parseCsrfFromHtml(html), { param: "_csrf", token: "abcToken" });
  });

  it("detects getdownload login walls and not LoadShare HTML", () => {
    assert.equal(isDownloadLoginWall('{"response":false,"msg":"Please login"}'), true);
    assert.equal(isDownloadLoginWall("<html>" + "x".repeat(20000) + '<a href="/user/login">login</a></html>'), false);
    assert.equal(
      isDownloadLoginWall('<a href="https://loadshare.org/download/file?name=Dune.mp4">get</a>'),
      false
    );
    assert.match(downloadLoginWallMessage(), /not signed into Tornado/i);
    assert.match(downloadLoginWallMessage(), /paste _identity-frontend1/i);
    assert.match(downloadLoginWallMessage(), /Application → Cookies/i);
  });

  it("keeps the finish-captcha wording for empty tokens", () => {
    assert.equal(requireRecaptcha("   ").error, CAPTCHA_FINISH_MESSAGE);
  });

  it("treats identity and _identity cookies as a real session", () => {
    assert.equal(hasIdentityCookie({ identity: "user:auth:1" }), true);
    assert.equal(hasIdentityCookie({ _identity: "abc" }), true);
    assert.equal(hasIdentityCookie({ "_identity-frontend": "x" }), true);
    assert.equal(hasIdentityCookie({ "_identity-frontend1": "x" }), true);
    assert.equal(hasIdentityCookie({ PHPSESSID: "anon" }), false);
    assert.equal(hasIdentityCookie({ "advanced-frontend": "sess" }), false);
    assert.equal(hasIdentityCookie({}), false);
  });

  it("detects logout links and Cloudflare walls", () => {
    assert.equal(htmlShowsLoggedIn('<a href="/user/logout">Logout</a>'), true);
    assert.equal(htmlShowsLoggedOut('<form action="/user/login">SignupForm[email]</form>'), true);
    assert.equal(htmlLooksLikeChallenge("<html>Just a moment... challenge-platform</html>"), true);
    assert.equal(htmlShowsLoggedOut("<html>Just a moment... challenge-platform</html>"), false);
  });

  it("reports logged in from a logout link even without a username", () => {
    const result = evaluateSessionStatus({
      html: '<html><a href="/user/logout">Log out</a></html>',
      status: 200,
      jar: {}
    });
    assert.equal(result.loggedIn, true);
    assert.equal(result.confirmed, true);
    assert.equal(result.evidence, "logout-link");
  });

  it("reports logged in from an identity cookie on a real page without a logout link", () => {
    const result = evaluateSessionStatus({
      html: '<html><meta name="csrf-token" content="tok"><div class="film_list">home</div></html>',
      status: 200,
      jar: { identity: "yii-identity", PHPSESSID: "abc" }
    });
    assert.equal(result.loggedIn, true);
    assert.equal(result.confirmed, true);
    assert.equal(result.evidence, "identity-cookie");
  });

  it("reports logged in from a Yii2 _identity-frontend cookie, not advanced-frontend alone", () => {
    const withIdentity = evaluateSessionStatus({
      html: '<html><meta name="csrf-token" content="tok"><div class="film_list">home</div></html>',
      status: 200,
      jar: { "_identity-frontend1": "yii-identity", "advanced-frontend": "sess" }
    });
    assert.equal(withIdentity.loggedIn, true);
    assert.equal(withIdentity.hasIdentity, true);
    assert.equal(withIdentity.confirmed, true);
    assert.equal(withIdentity.evidence, "identity-cookie");

    const sessionOnly = evaluateSessionStatus({
      html: "<html>Please sign in</html>",
      status: 200,
      jar: { "advanced-frontend": "sess" }
    });
    assert.notEqual(sessionOnly.loggedIn, false);
    assert.equal(sessionOnly.hasIdentity, false);
    assert.equal(sessionOnly.confirmed, false);
    assert.equal(sessionOnly.evidence, "unconfirmed-session");
  });

  it("does not treat a Cloudflare wall as logged out when an identity cookie exists", () => {
    const result = evaluateSessionStatus({
      html: "<html>Just a moment... cdn-cgi/challenge</html>",
      status: 200,
      jar: { identity: "yii-identity" },
      lastKnown: true
    });
    assert.equal(result.loggedIn, true);
    assert.equal(result.confirmed, false);
    assert.equal(result.evidence, "challenge");
  });

  it("returns lastKnown/null instead of loggedIn=false when a probe fails", () => {
    const withLastKnown = evaluateSessionStatus({
      html: "",
      status: 0,
      jar: { _identity: "abc" },
      lastKnown: true,
      error: "ECONNRESET"
    });
    assert.equal(withLastKnown.loggedIn, true);
    assert.equal(withLastKnown.confirmed, false);
    assert.equal(withLastKnown.evidence, "probe-failed");

    const unknown = evaluateSessionStatus({
      html: "",
      status: 0,
      jar: { identity: "abc" },
      error: "fetch failed"
    });
    assert.equal(unknown.loggedIn, null);
    assert.equal(unknown.confirmed, false);
  });

  it("reports logged out only on a successful login page without session cookies", () => {
    const result = evaluateSessionStatus({
      html: '<html>Please sign in</html>',
      status: 200,
      jar: { PHPSESSID: "anon" }
    });
    assert.equal(result.loggedIn, false);
    assert.equal(result.confirmed, true);
    assert.equal(result.evidence, "login-page");
  });
});

describe("TornadoClient.sessionStatus", () => {
  const previousRoot = process.env.DATA_ROOT;
  let dataRoot;

  function stubClient(handler, jar = {}) {
    const client = new TornadoClient();
    client.jar = { ...jar };
    client.request = async (urlPath) => handler(String(urlPath));
    return client;
  }

  before(() => {
    dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-session-"));
    process.env.DATA_ROOT = dataRoot;
  });

  after(() => {
    if (previousRoot == null) delete process.env.DATA_ROOT;
    else process.env.DATA_ROOT = previousRoot;
  });

  it("treats a logout link as logged in", async () => {
    const client = stubClient(() => ({
      status: 200,
      body: '<html><a href="/user/logout">Logout</a></html>',
      locations: [],
      effectiveUrl: "/tornado-1"
    }));
    const status = await client.sessionStatus();
    assert.equal(status.ok, true);
    assert.equal(status.loggedIn, true);
    assert.equal(status.confirmed, true);
  });

  it("treats an identity cookie plus a real page as logged in", async () => {
    const client = stubClient(
      () => ({
        status: 200,
        body: '<html><meta name="csrf-token" content="tok"><div class="film_list"></div></html>',
        locations: [],
        effectiveUrl: "/tornado-1"
      }),
      { identity: "yii-identity" }
    );
    const status = await client.sessionStatus();
    assert.equal(status.loggedIn, true);
    assert.equal(status.hasIdentity, true);
    assert.equal(status.confirmed, true);
  });

  it("treats a pasted _identity-frontend1 cookie as logged in", async () => {
    const client = stubClient(
      () => ({
        status: 200,
        body: '<html><meta name="csrf-token" content="tok"><div class="film_list"></div></html>',
        locations: [],
        effectiveUrl: "/tornado-1"
      }),
      { "_identity-frontend1": "yii-advanced", "advanced-frontend": "sess" }
    );
    const status = await client.sessionStatus();
    assert.equal(status.loggedIn, true);
    assert.equal(status.hasIdentity, true);
    assert.equal(status.hasCookies, true);
    assert.equal(status.confirmed, true);
  });

  it("keeps lastKnown when the home page is a Cloudflare wall", async () => {
    const seed = stubClient(() => ({
      status: 200,
      body: '<html><a href="/user/logout">Logout</a></html>',
      locations: [],
      effectiveUrl: "/tornado-1"
    }));
    await seed.sessionStatus();

    const client = stubClient(
      (urlPath) => ({
        status: 200,
        body: urlPath.includes("profile")
          ? "<html>Just a moment... challenge-platform</html>"
          : "<html>Just a moment... challenge-platform</html>",
        locations: [],
        effectiveUrl: urlPath
      }),
      { identity: "yii-identity" }
    );
    const status = await client.sessionStatus();
    assert.equal(status.loggedIn, true);
    assert.equal(status.ok, false);
    assert.equal(status.confirmed, false);
  });

  it("does not report logged out when a probe throws and identity cookies exist", async () => {
    const client = stubClient(() => {
      throw new Error("fetch failed");
    }, { _identity: "abc" });
    const status = await client.sessionStatus();
    assert.equal(status.ok, false);
    assert.notEqual(status.loggedIn, false);
    assert.equal(status.hasIdentity, true);
  });
});
