"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  TornadoClient,
  collectLinks,
  parseAjaxUrlsFromHtml,
  nestedApiPaths,
  nestedDownloadUrls,
  splitHeadersAndBody,
  acceptForApiPath,
  shouldForceIpv4,
  prefersIpv6,
  parseDownloadForms,
  formToDownloadUrl,
  collectLoadshareHosts
} = require("../lib/tornado");
const { downloadLoginWallMessage } = require("../lib/tornado-session");

const MOVIE_URL = "https://www4.tornadomovies.co/movie/dune/abc123";
const VIP_DOWNLOAD_URL =
  "https://vip-1-1-ip6.loadshare.org/download/1/VideoID-zBpjS8fj/6361lY/e9BdHE/0GwNX1/mRb1s2/2160?name=the-lord-of-the-rings-the-return-of-the-king-part-1_2160&token=ip=2a09:bac1:7681:5708::e:364~st=1788239485~exp=1788325885~acl=/*~hmac=test";
const MOVIE_PAGE = `<html>
  <meta name="csrf-param" content="_csrf">
  <meta name="csrf-token" content="tok123">
  <body>Dune</body>
</html>`;
const LOGIN_WALL_PAGE = `<form action="/user/login">SignupForm[email]<input name="SignupForm[email]"></form>`;
const LOGGED_IN_HOME = `<html><a href="/user/logout">Logout</a></html>`;

function emptyResult(urlPath = "") {
  return { status: 200, body: "", effectiveUrl: urlPath, locations: [] };
}

function stubClient(handler) {
  const client = new TornadoClient();
  client.request = async (urlPath, options = {}) => handler(String(urlPath), options || {});
  return client;
}

describe("collectLinks", () => {
  it("finds protocol-relative LoadShare download links", () => {
    const links = collectLinks('click <a href="//loadshare.org/download/abc123?name=Dune.mp4">get</a>', new Set());
    assert.ok([...links].some((url) => /https:\/\/loadshare\.org\/download\/abc123/.test(url)));
  });

  it("finds JSON-escaped LoadShare download links", () => {
    const links = collectLinks('{"url":"https:\\/\\/loadshare.org\\/download\\/xyz"}', new Set());
    assert.ok([...links].some((url) => url.includes("https://loadshare.org/download/xyz")));
  });

  it("finds data-href, data-url, /d/, and /file/ LoadShare paths", () => {
    const html = `
      <a data-href="https://loadshare.net/d/tokenA">d</a>
      <div data-url="https://loadshare.org/file/tokenB"></div>
      <a href="https://loadshare.org/download/tokenC">dl</a>
    `;
    const links = collectLinks(html, new Set());
    assert.ok([...links].some((url) => /loadshare\.net\/d\/tokenA/.test(url)));
    assert.ok([...links].some((url) => /loadshare\.org\/file\/tokenB/.test(url)));
    assert.ok([...links].some((url) => /loadshare\.org\/download\/tokenC/.test(url)));
  });

  it("does not collect random CDN URLs", () => {
    const links = collectLinks(
      "https://cdn.example.com/download/file.mp4 https://files.example.net/file/abc",
      new Set()
    );
    assert.equal(links.size, 0);
  });

  it("keeps vip-*-ip6.loadshare.org /download/ URLs including IPv6 token and acl=/*", () => {
    const cases = [
      VIP_DOWNLOAD_URL,
      `<a href="${VIP_DOWNLOAD_URL}">get</a>`,
      JSON.stringify({ src: VIP_DOWNLOAD_URL }).replace(/\//g, "\\/"),
      `<a href="${VIP_DOWNLOAD_URL.replace(/&/g, "&amp;")}">get</a>`,
      `<a data-href="${VIP_DOWNLOAD_URL}">get</a>`
    ];
    for (const sample of cases) {
      const links = collectLinks(sample, new Set());
      assert.ok(
        [...links].some((url) => {
          return (
            /https:\/\/vip-1-1-ip6\.loadshare\.org\/download\/1\/VideoID-zBpjS8fj/.test(url) &&
            /token=ip=2a09:bac1:7681:5708::e:364/.test(url) &&
            /acl=\/\*/.test(url) &&
            /hmac=test/.test(url)
          );
        }),
        `did not keep vip-ip6 LoadShare URL from: ${String(sample).slice(0, 80)}`
      );
    }
  });

  it("collects LoadShare URLs from JSON src/file/link keys and meta refresh", () => {
    const json = JSON.stringify({
      src: VIP_DOWNLOAD_URL,
      nested: { file: VIP_DOWNLOAD_URL.replace("2160?", "1080?") }
    });
    const fromJson = collectLinks(json, new Set());
    assert.ok([...fromJson].some((url) => /vip-1-1-ip6\.loadshare\.org\/download/.test(url)));

    const html = `<meta http-equiv="refresh" content="0;url=${VIP_DOWNLOAD_URL}">`;
    const fromMeta = collectLinks(html, new Set());
    assert.ok([...fromMeta].some((url) => /vip-1-1-ip6\.loadshare\.org\/download/.test(url)));
  });
});

describe("LoadShare IP family", () => {
  it("forces IPv4 for Tornado hosts and not for LoadShare or ip6 CDN hosts", () => {
    assert.equal(shouldForceIpv4("https://www4.tornadomovies.co/getdownload/abc/true"), true);
    assert.equal(shouldForceIpv4("https://loadshare.org/download/x"), false);
    assert.equal(shouldForceIpv4("https://vip-1-1-ip6.loadshare.org/download/x"), false);
    assert.equal(shouldForceIpv4("https://cdn.loadshare.net/d/x"), false);
    assert.equal(prefersIpv6("https://vip-1-1-ip6.loadshare.org/download/x"), true);
    assert.equal(prefersIpv6("https://loadshare.org/download/x"), false);
  });

  it("uses IPv6 for Tornado when TORNADO_IP=6", () => {
    const prev = process.env.TORNADO_IP;
    process.env.TORNADO_IP = "6";
    try {
      assert.equal(shouldForceIpv4("https://www4.tornadomovies.co/getdownload/abc/true"), false);
      assert.equal(prefersIpv6("https://www4.tornadomovies.co/tornado-1"), true);
      assert.equal(shouldForceIpv4("https://loadshare.org/download/x"), false);
    } finally {
      if (prev == null) delete process.env.TORNADO_IP;
      else process.env.TORNADO_IP = prev;
    }
  });
});

describe("LoadShare forms and host diagnostics", () => {
  it("builds a GET URL from a LoadShare form action and hidden inputs", () => {
    const html = `
      <form method="get" action="https://vip-1-1-ip6.loadshare.org/download/1/VideoID-abc/2160">
        <input type="hidden" name="name" value="movie_2160">
        <input type="hidden" name="token" value="ip=2a09:bac1::1~acl=/*~hmac=test">
      </form>
    `;
    const forms = parseDownloadForms(html);
    assert.equal(forms.length, 1);
    const built = formToDownloadUrl(forms[0]);
    assert.match(built, /vip-1-1-ip6\.loadshare\.org\/download\/1\/VideoID-abc\/2160/);
    assert.match(built, /name=movie_2160/);
    assert.match(built, /hmac=test/);
    const hosts = collectLoadshareHosts("see vip-1-1-ip6.loadshare.org player", new Set());
    assert.ok([...hosts].some((host) => host.includes("vip-1-1-ip6.loadshare.org")));
  });
});

describe("nested ajax URL extraction", () => {
  it("extracts getbutton ajax URLs that use a different id", () => {
    const html = `
      <script>
        $.ajax({ url: '/getlink/OTHERID/true' });
        $.get('/getdownload/ZZZID/movie');
        $.post('/getbutton/YYYID/1');
      </script>
    `;
    const ajax = parseAjaxUrlsFromHtml(html);
    assert.ok(ajax.some((url) => url.includes("OTHERID")));
    assert.ok(ajax.some((url) => url.includes("ZZZID")));
    assert.ok(ajax.some((url) => url.includes("YYYID")));
    const nested = nestedDownloadUrls(html);
    assert.ok(nested.some((url) => url.includes("/getlink/OTHERID/true")));
    assert.ok(nestedApiPaths(html).some((url) => url.includes("OTHERID")));
  });
});

describe("splitHeadersAndBody", () => {
  it("strips the effective-URL trailer and collects every Location hop", () => {
    const raw = [
      "HTTP/1.1 302 Found",
      "Location: https://loadshare.org/download/hop1",
      "",
      "HTTP/1.1 302 Found",
      "Location: https://loadshare.org/download/hop2",
      "",
      "HTTP/1.1 200 OK",
      "Content-Type: text/html",
      "",
      "<html>no url here</html>",
      "__CINARIP_EFFECTIVE__:https://loadshare.org/download/hop2"
    ].join("\n");
    const parsed = splitHeadersAndBody(raw);
    assert.equal(parsed.effectiveUrl, "https://loadshare.org/download/hop2");
    assert.ok(parsed.locations.includes("https://loadshare.org/download/hop1"));
    assert.ok(parsed.locations.includes("https://loadshare.org/download/hop2"));
    assert.equal(parsed.body.includes("__CINARIP_EFFECTIVE__"), false);
    assert.match(parsed.body, /no url here/);
    assert.match(parsed.headerDump, /200 OK/);
  });

  it("collects X-Redirect and Refresh hops", () => {
    const raw = [
      "HTTP/1.1 302 Found",
      `X-Redirect: ${VIP_DOWNLOAD_URL}`,
      "Refresh: 0;url=https://loadshare.net/d/from-refresh",
      "",
      "HTTP/1.1 200 OK",
      "",
      "<html>ok</html>"
    ].join("\n");
    const parsed = splitHeadersAndBody(raw);
    assert.ok(parsed.locations.some((url) => /vip-1-1-ip6\.loadshare\.org\/download/.test(url)));
    assert.ok(parsed.locations.includes("https://loadshare.net/d/from-refresh"));
  });

  it("still splits a dump with no trailer", () => {
    const raw = "HTTP/1.1 200 OK\nContent-Type: text/html\n\n<body>ok</body>";
    const parsed = splitHeadersAndBody(raw);
    assert.equal(parsed.effectiveUrl, "");
    assert.deepEqual(parsed.locations, []);
    assert.equal(parsed.body, "<body>ok</body>");
  });
});

describe("acceptForApiPath", () => {
  it("sends JSON Accept for getdownload and HTML for getbutton/getlink", () => {
    assert.equal(acceptForApiPath("getdownload"), "application/json, text/javascript, */*;q=0.01");
    assert.equal(acceptForApiPath("/getdownload/abc/true"), "application/json, text/javascript, */*;q=0.01");
    assert.equal(acceptForApiPath("getbutton"), "text/html, */*;q=0.01");
    assert.equal(acceptForApiPath("/getlink/abc/true"), "text/html, */*;q=0.01");
  });
});

describe("findDirectLink", () => {
  it("follows nested ajax URLs that use a different download id", async () => {
    const calls = [];
    const client = stubClient((urlPath, options) => {
      calls.push({ urlPath, accept: options.headers?.Accept || "" });
      if (/\/movie\//.test(urlPath)) return { status: 200, body: MOVIE_PAGE, locations: [], effectiveUrl: urlPath };
      if (/getbutton\/abc123/.test(urlPath)) {
        return {
          status: 200,
          body: "<script>$.ajax({ url: '/getlink/OTHERID/true' });</script>",
          locations: [],
          effectiveUrl: urlPath
        };
      }
      if (/getlink\/OTHERID/.test(urlPath)) {
        return {
          status: 200,
          body: '{"url":"https:\\/\\/loadshare.org\\/download\\/from-nested"}',
          locations: [],
          effectiveUrl: urlPath
        };
      }
      return emptyResult(urlPath);
    });

    const result = await client.findDirectLink(MOVIE_URL);
    assert.equal(result.ok, true);
    assert.ok(calls.some((call) => /getlink\/OTHERID/.test(call.urlPath)));
    assert.ok(calls.some((call) => /getdownload/.test(call.urlPath) && /application\/json/.test(call.accept)));
    assert.ok(calls.some((call) => /getbutton/.test(call.urlPath) && /text\/html/.test(call.accept)));
    assert.match(result.best.url, /loadshare\.org\/download\/from-nested/);
  });

  it("collects a LoadShare URL from Location and effectiveUrl when the body omits it", async () => {
    const client = stubClient((urlPath) => {
      if (/\/movie\//.test(urlPath)) return { status: 200, body: MOVIE_PAGE, locations: [], effectiveUrl: urlPath };
      if (/getdownload\/abc123/.test(urlPath)) {
        return {
          status: 302,
          body: "<html>thanks</html>",
          locations: ["https://loadshare.org/download/redirected-file"],
          effectiveUrl: "https://loadshare.org/download/redirected-file"
        };
      }
      return emptyResult(urlPath);
    });

    const result = await client.findDirectLink(MOVIE_URL);
    assert.equal(result.ok, true);
    assert.match(result.best.url, /loadshare\.org\/download\/redirected-file/);
  });

  it("uses the login-wall message when the movie page is a login form", async () => {
    const client = stubClient((urlPath) => {
      if (/\/movie\//.test(urlPath)) {
        return { status: 200, body: LOGIN_WALL_PAGE, locations: [], effectiveUrl: urlPath };
      }
      if (/tornado-1/.test(urlPath)) {
        return { status: 200, body: LOGGED_IN_HOME, locations: [], effectiveUrl: urlPath };
      }
      return emptyResult(urlPath);
    });

    const result = await client.findDirectLink(MOVIE_URL);
    assert.equal(result.ok, false);
    assert.equal(result.error, downloadLoginWallMessage());
  });

  it("uses the login-wall message when sessionStatus is logged out", async () => {
    const client = stubClient((urlPath) => {
      if (/\/movie\//.test(urlPath)) return { status: 200, body: MOVIE_PAGE, locations: [], effectiveUrl: urlPath };
      if (/tornado-1/.test(urlPath)) {
        return { status: 200, body: "<html>Please sign in</html>", locations: [], effectiveUrl: urlPath };
      }
      return emptyResult(urlPath);
    });

    const result = await client.findDirectLink(MOVIE_URL);
    assert.equal(result.ok, false);
    assert.equal(result.error, downloadLoginWallMessage());
  });

  it("includes a short diagnostic when logged in and no LoadShare link is found", async () => {
    const client = stubClient((urlPath) => {
      if (/\/movie\//.test(urlPath)) return { status: 200, body: MOVIE_PAGE, locations: [], effectiveUrl: urlPath };
      if (/tornado-1/.test(urlPath)) {
        return { status: 200, body: LOGGED_IN_HOME, locations: [], effectiveUrl: urlPath };
      }
      if (/getbutton\/abc123\/true/.test(urlPath)) {
        return { status: 200, body: "<div>empty button widget</div>", locations: [], effectiveUrl: urlPath };
      }
      return { status: 200, body: "nope", locations: [], effectiveUrl: urlPath };
    });

    const result = await client.findDirectLink(MOVIE_URL);
    assert.equal(result.ok, false);
    assert.match(result.error, /No LoadShare download link found/);
    assert.match(result.error, /ids=abc123/);
    assert.match(result.error, /last=\/get/);
    assert.match(result.error, /HTTP 200/);
    assert.match(result.error, /loggedIn=true/);
    assert.match(result.error, /preview=/);
    assert.match(result.error, /loadshareHost=no/);
    assert.match(result.error, /ipv4=yes/);
    assert.match(result.error, /effectiveHost=/);
    assert.ok(!/<html[\s\S]{200,}/i.test(result.error));
  });

  it("collects a vip-ip6 LoadShare URL from nested JSON src", async () => {
    const client = stubClient((urlPath) => {
      if (/\/movie\//.test(urlPath)) return { status: 200, body: MOVIE_PAGE, locations: [], effectiveUrl: urlPath };
      if (/getdownload\/abc123/.test(urlPath)) {
        return {
          status: 200,
          body: JSON.stringify({ src: VIP_DOWNLOAD_URL, file: VIP_DOWNLOAD_URL }),
          locations: [],
          effectiveUrl: urlPath
        };
      }
      return emptyResult(urlPath);
    });

    const result = await client.findDirectLink(MOVIE_URL);
    assert.equal(result.ok, true);
    assert.match(result.best.url, /vip-1-1-ip6\.loadshare\.org\/download\/1\/VideoID-zBpjS8fj/);
    assert.match(result.best.url, /token=ip=2a09:bac1/);
    assert.equal(result.best.qualityLabel, "4K");
  });

  it("collects a vip-ip6 LoadShare URL from getdownload form action", async () => {
    const client = stubClient((urlPath) => {
      if (/\/movie\//.test(urlPath)) return { status: 200, body: MOVIE_PAGE, locations: [], effectiveUrl: urlPath };
      if (/getdownload\/abc123/.test(urlPath)) {
        return {
          status: 200,
          body: `<form method="get" action="${VIP_DOWNLOAD_URL}"><input type="hidden" name="x" value="1"></form>`,
          locations: [],
          effectiveUrl: urlPath
        };
      }
      return emptyResult(urlPath);
    });

    const result = await client.findDirectLink(MOVIE_URL);
    assert.equal(result.ok, true);
    assert.match(result.best.url, /vip-1-1-ip6\.loadshare\.org\/download/);
  });

  it("collects a vip-ip6 LoadShare URL from X-Redirect without following the file", async () => {
    const client = stubClient((urlPath, options) => {
      if (/\/movie\//.test(urlPath)) return { status: 200, body: MOVIE_PAGE, locations: [], effectiveUrl: urlPath };
      if (/getdownload\/abc123/.test(urlPath)) {
        assert.equal(options.follow, false);
        return {
          status: 302,
          body: "",
          locations: [],
          headers: { "x-redirect": VIP_DOWNLOAD_URL },
          effectiveUrl: urlPath
        };
      }
      return emptyResult(urlPath);
    });

    const result = await client.findDirectLink(MOVIE_URL);
    assert.equal(result.ok, true);
    assert.match(result.best.url, /vip-1-1-ip6\.loadshare\.org\/download/);
  });
});
