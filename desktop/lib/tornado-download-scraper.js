const DIRECT_LINK_PATTERN =
  /https?:\/\/[^\s"'<>]*loadshare\.org\/download\/[^\s"'<>]+/gi;

const GETBUTTON_TYPES = ["true", "movie", "1", "0"];
const DOWNLOAD_API_PATHS = ["getdownload", "getbutton", "getlink"];
const FETCH_LINKS_TIMEOUT_MS = 12_000;
const PAGE_SCAN_BUDGET_MS = 8_000;

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })
  ]).finally(() => clearTimeout(timer));
}
const {
  canonicalMoviePageUrl,
  extractMovieIdFromUrl
} = require("./movie-url-utils");
const { extractGetbuttonId, extractDownloadIds, canonicalContentUrl } = require("./tv-url-utils");

function buildTornadoDownloadScraperScript() {
  return `
(() => {
  if (window.__tornadoDirectDownloadScraperInstalled) return;
  window.__tornadoDirectDownloadScraperInstalled = true;

  const isContentPage = () => /\\/(?:movie|tv-series|tv|serie|series|episode|episodes)\\//i.test(
    window.location.pathname
  );

  const isMoviePage = () => /\\/movie\\//i.test(window.location.pathname);

  const movieIdFromPath = () => {
    const match = window.location.pathname.match(/\\/movie\\/[^/]+\\/([^/]+)/i);
    return match ? match[1] : null;
  };

  const pushDirectLink = (url, source) => {
    if (!url || !/loadshare\\.org\\/download\\//i.test(url)) return;
    window.__tornadoCollectedLinks = window.__tornadoCollectedLinks || new Set();
    window.__tornadoCollectedLinks.add(url);
    console.log("[TornadoDirectDownload]", JSON.stringify({
      ts: new Date().toISOString(),
      url,
      source
    }));
  };

  const collectFromText = (text, source) => {
    if (!text || !/loadshare\\.org/i.test(text)) return;
    const matches = String(text).match(/https?:\\/\\/[^\\s"'<>]*loadshare\\.org\\/download\\/[^\\s"'<>]+/gi);
    if (!matches) return;
    for (const url of matches) pushDirectLink(url, source);
  };

  const collectFromDom = () => {
    if (!isContentPage()) return;

    const found = new Set();
    for (const element of document.querySelectorAll("a[href], [data-href], [data-url]")) {
      for (const attr of ["href", "data-href", "data-url"]) {
        const value = element.getAttribute(attr);
        if (value && /loadshare\\.org\\/download\\//i.test(value)) {
          found.add(value);
        }
      }
    }

    collectFromText(document.documentElement?.innerHTML || "", "html-scan");
    for (const url of found) pushDirectLink(url, "dom");
  };

  const hookAjax = () => {
    if (!window.jQuery) {
      setTimeout(hookAjax, 250);
      return;
    }

    window.jQuery(document).ajaxSuccess((_event, _xhr, settings, data) => {
      const url = String(settings?.url || "");
      if (/loadshare|getbutton|getlink|download|player/i.test(url) || /loadshare/i.test(String(data))) {
        if (typeof data === "string") {
          collectFromText(data, "ajax:" + url);
        } else if (data != null) {
          try {
            collectFromText(JSON.stringify(data), "ajax-json:" + url);
          } catch {
            // Ignore serialization failures.
          }
        }
      }
    });
  };

  const tryPlayerApis = () => {
    if (!window.Player) return { ok: false, status: "player-missing" };

    const actions = [];
    if (typeof window.Player.getLinks === "function") {
      try {
        window.Player.getLinks();
        actions.push("getLinks");
      } catch (error) {
        actions.push("getLinks-error:" + String(error?.message || error));
      }
    }

    if (typeof window.Player.requestLink === "function") {
      try {
        window.Player.requestLink();
        actions.push("requestLink");
      } catch (error) {
        actions.push("requestLink-error:" + String(error?.message || error));
      }
    }

    return { ok: actions.length > 0, actions };
  };

  const fetchGetbuttonLinks = (forcedId) => {
    const id =
      forcedId ||
      document.querySelector("#player .play_button[data-id]")?.getAttribute("data-id") ||
      document.querySelector(".play_button[data-id]")?.getAttribute("data-id") ||
      movieIdFromPath();

    if (!id) {
      return Promise.resolve({ ok: false, reason: "missing-movie-id" });
    }

    if (!window.jQuery) {
      return Promise.resolve({ ok: false, reason: "missing-jquery" });
    }

    const clickCloudTriggers = () => {
      const selectors = [
        "#click_to_download",
        ".download_drop",
        ".fa-cloud-download",
        ".fa-cloud-download-alt",
        ".fa-cloud",
        "[class*='cloud-download']",
        "[class*='download-cloud']",
        "#player [class*='cloud']",
        "#player [class*='download']"
      ];
      for (const selector of selectors) {
        for (const element of document.querySelectorAll(selector)) {
          try {
            element.click();
          } catch {}
        }
      }
    };

    const tryApi = (path, dataType) =>
      new Promise((resolve) => {
        window.jQuery.ajax({
          url: "/" + path + "/" + id + "/true",
          type: "get",
          dataType,
          timeout: 15000,
          success: (data) => resolve({ ok: true, path, data }),
          error: () => resolve({ ok: false, path })
        });
      });

    return (async () => {
      clickCloudTriggers();
      const getdownload = await tryApi("getdownload", "json");
      if (getdownload.ok) {
        if (typeof getdownload.data === "string") collectFromText(getdownload.data, "getdownload");
        else {
          try {
            collectFromText(JSON.stringify(getdownload.data), "getdownload-json");
          } catch {}
        }
      }

      const getbutton = await tryApi("getbutton", "html");
      if (getbutton.ok && typeof getbutton.data === "string") {
        const html = String(getbutton.data || "");
        collectFromText(html, "getbutton");
        const temp = document.createElement("div");
        temp.innerHTML = html;
        for (const element of temp.querySelectorAll("a[href], [data-href], [data-url]")) {
          for (const attr of ["href", "data-href", "data-url"]) {
            const value = element.getAttribute(attr);
            if (value && /loadshare\\.org\\/download\\//i.test(value)) {
              pushDirectLink(value, "getbutton-dom");
            }
          }
          collectFromText(element.outerHTML || "", "getbutton-element");
        }
        const trigger = temp.querySelector("#click_to_download") || temp.querySelector("[class*='cloud']");
        if (trigger) {
          try {
            trigger.click();
          } catch {}
        }
      }

      return { ok: true, movieId: id, getdownload: getdownload.ok, getbutton: getbutton.ok };
    })();
  };

  window.__tornadoScanDirectDownloads = async (forcedMovieId) => {
    if (!isContentPage() && !forcedMovieId) {
      return { ok: false, reason: "not-content-page", links: [] };
    }

    window.__tornadoCollectedLinks = new Set();
    collectFromDom();
    const player = tryPlayerApis();
    const getbutton = await fetchGetbuttonLinks(forcedMovieId || null);
    collectFromDom();

    return {
      ok: true,
      player,
      getbutton,
      linkCount: document.querySelectorAll('a[href*="loadshare.org/download/"]').length,
      links: [...(window.__tornadoCollectedLinks || [])]
    };
  };

  if (isContentPage()) {
    hookAjax();
    collectFromDom();
  }
})();
`;
}

function setupTornadoDownloadScraper(contents) {
  if (!contents || contents.isDestroyed()) return;

  const inject = () => {
    contents.executeJavaScript(buildTornadoDownloadScraperScript()).catch(() => {
      // Ignore injection failures on restricted pages.
    });
  };

  contents.on("dom-ready", inject);
  contents.on("did-finish-load", inject);
}

async function fetchDirectLinksForMovie(contents, movieUrl) {
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready.", links: [] };
  }

  const canonicalUrl = canonicalMoviePageUrl(movieUrl) || canonicalContentUrl(movieUrl) || movieUrl;
  const downloadIds = extractDownloadIds(canonicalUrl);
  const movieId = downloadIds[0] || extractMovieIdFromUrl(canonicalUrl) || extractGetbuttonId(canonicalUrl || movieUrl);
  if (!movieId) {
    return { ok: false, error: "Invalid content URL (missing download ID).", links: [] };
  }

  await contents.executeJavaScript(buildTornadoDownloadScraperScript()).catch(() => {});

  const script = `
    (async () => {
      const downloadIds = ${JSON.stringify(downloadIds)};
      const types = ${JSON.stringify(GETBUTTON_TYPES)};
      const links = new Set();
      const attempts = [];
      const deadline = Date.now() + ${PAGE_SCAN_BUDGET_MS};

      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const timedOut = () => Date.now() >= deadline;

      const sanitizeUrl = (url) => {
        const text = String(url || "")
          .replace(/&amp;/gi, "&")
          .replace(/&quot;/gi, '"')
          .replace(/&#39;/gi, "'");
        if (!text || /&amp;/i.test(text)) return "";
        try {
          const parsed = new URL(text, window.location.href);
          parsed.hash = "";
          return parsed.toString();
        } catch {
          return "";
        }
      };

      const collectText = (text) => {
        const matches = String(text || "").match(/https?:\\/\\/[^\\s"'<>]*loadshare\\.org\\/download\\/[^\\s"'<>]+/gi);
        if (!matches) return;
        for (const url of matches) {
          const clean = sanitizeUrl(url);
          if (clean) links.add(clean);
        }
      };

      const collectLinksFromDom = () => {
        for (const element of document.querySelectorAll(
          'a[href*="loadshare.org/download/"], [data-href*="loadshare.org/download/"], [data-url*="loadshare.org/download/"]'
        )) {
          for (const attr of ["href", "data-href", "data-url"]) {
            const value = element.getAttribute(attr);
            if (!value || !/loadshare\\.org\\/download\\//i.test(value)) continue;
            const clean = sanitizeUrl(value);
            if (clean) links.add(clean);
          }
        }
      };

      const downloadTriggerSelectors = [
        "#click_to_download",
        ".download_drop",
        ".cloud-download",
        ".download-cloud",
        ".fa-cloud-download",
        ".fa-cloud-download-alt",
        ".fa-cloud",
        ".icon-cloud",
        "[class*='cloud-download']",
        "[class*='download-cloud']",
        "[title*='download' i]",
        "[aria-label*='download' i]",
        "#player [class*='cloud']",
        "#player [class*='download']",
        ".player-controls [class*='cloud']",
        ".player-controls [class*='download']"
      ];

      const findDownloadTriggers = (root) => {
        const scope = root || document;
        const found = [];
        const seen = new Set();
        for (const selector of downloadTriggerSelectors) {
          for (const element of scope.querySelectorAll(selector)) {
            if (!element || seen.has(element)) continue;
            seen.add(element);
            found.push(element);
          }
        }
        return found;
      };

      const clickDownloadTriggers = async (root) => {
        const triggers = findDownloadTriggers(root);
        const clicked = [];
        for (const element of triggers) {
          try {
            element.click();
            clicked.push(element.id || element.className || element.tagName);
          } catch {}
        }
        if (clicked.length) await sleep(500);
        return clicked;
      };

      const parseAjaxUrlsFromHtml = (html) => {
        const urls = new Set();
        const patterns = [
          /url\\s*:\\s*['"]([^'"]+)['"]/gi,
          /\\.get\\(\\s*['"]([^'"]+)['"]/gi,
          /\\.post\\(\\s*['"]([^'"]+)['"]/gi
        ];
        for (const pattern of patterns) {
          let match;
          while ((match = pattern.exec(String(html || ""))) !== null) {
            const value = match[1];
            if (/getdownload|getbutton|getlink|download|loadshare/i.test(value)) {
              urls.add(value);
            }
          }
        }
        return [...urls];
      };

      const linkHeights = () =>
        [...links].map((url) => {
          const match = String(url).match(/\\/(2160|1440|1080|720|480|360)(?:\\?|&|$|\\/)/i);
          return match ? Number(match[1]) : 0;
        });

      const maxLinkHeight = () => {
        const heights = linkHeights();
        return heights.length ? Math.max(...heights) : 0;
      };

      const fetchDownloadApi = async (apiPath, type, dataType, movieId) => {
        const url = "/" + apiPath + "/" + movieId + "/" + type;
        try {
          const data = await new Promise((resolve, reject) => {
            window.jQuery.ajax({
              url,
              type: "get",
              dataType,
              timeout: 6000,
              success: resolve,
              error: (_xhr, status, error) => reject(new Error(String(status || error || "ajax-error")))
            });
          });
          return { ok: true, url, dataType, data };
        } catch (error) {
          return { ok: false, url, dataType, reason: error.message || "api-failed" };
        }
      };

      const ingestApiResponse = (response) => {
        if (!response?.ok) return 0;
        const before = links.size;
        if (typeof response.data === "string") {
          collectText(response.data);
        } else if (response.data != null) {
          try {
            collectText(JSON.stringify(response.data));
          } catch {}
        }
        return links.size - before;
      };

      const ensureMount = () => {
        let mount = document.getElementById("__queue_getbutton_mount");
        if (!mount) {
          mount = document.createElement("div");
          mount.id = "__queue_getbutton_mount";
          mount.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;";
          document.body.appendChild(mount);
        }
        return mount;
      };

      const injectGetbuttonHtml = (html) => {
        const mount = ensureMount();
        mount.innerHTML = "";
        const range = document.createRange();
        const fragment = range.createContextualFragment(String(html || ""));
        mount.appendChild(fragment);
        return (
          mount.querySelector("#click_to_download") ||
          findDownloadTriggers(mount)[0] ||
          document.querySelector("#click_to_download")
        );
      };

      const activateDownloadDropdown = async (type, movieId) => {
        if (!window.jQuery) {
          return { ok: false, type, movieId, reason: "missing-jquery" };
        }
        if (timedOut()) {
          return { ok: false, type, movieId, reason: "deadline" };
        }

        const beforeAll = links.size;
        const apiAttempts = [];
        const apiPaths = ${JSON.stringify(DOWNLOAD_API_PATHS)};

        for (const apiPath of apiPaths) {
          if (timedOut()) break;
          const dataType = apiPath === "getdownload" ? "json" : "html";
          const response = await fetchDownloadApi(apiPath, type, dataType, movieId);
          apiAttempts.push({
            apiPath,
            ok: response.ok,
            reason: response.reason || null,
            found: ingestApiResponse(response)
          });

          if (response.ok && typeof response.data === "string") {
            const html = response.data;
            const isErrorPage = /something went wrong|please report this problem|oops/i.test(
              String(html).toLowerCase()
            );
            if (isErrorPage) {
              return {
                ok: false,
                type,
                movieId,
                reason: "error-page",
                htmlLength: html.length,
                htmlPreview: String(html).replace(/\\s+/g, " ").trim().slice(0, 240),
                apiAttempts
              };
            }

            collectText(html);
            const button = injectGetbuttonHtml(html);
            const nestedUrls = parseAjaxUrlsFromHtml(html);
            for (const nestedUrl of nestedUrls) {
              if (timedOut()) break;
              try {
                const nested = await new Promise((resolve, reject) => {
                  window.jQuery.ajax({
                    url: nestedUrl,
                    type: "get",
                    dataType: /json/i.test(nestedUrl) ? "json" : "html",
                    timeout: 6000,
                    success: resolve,
                    error: (_xhr, status, error) => reject(new Error(String(status || error)))
                  });
                });
                ingestApiResponse({ ok: true, data: nested });
              } catch {}
            }

            await clickDownloadTriggers(ensureMount());
            if (button) button.click();

            const started = Date.now();
            while (Date.now() - started < 2000 && !timedOut()) {
              await sleep(250);
              collectLinksFromDom();
              if (links.size > beforeAll) break;
              if (button?.classList?.contains("qualLoaded")) {
                collectLinksFromDom();
                if (links.size > beforeAll) break;
              }
            }
          }

          if (links.size > beforeAll) break;
        }

        return {
          ok: links.size > beforeAll,
          type,
          movieId,
          reason: links.size > beforeAll ? null : "dropdown-timeout",
          found: links.size - beforeAll,
          maxHeight: maxLinkHeight(),
          apiAttempts,
          htmlPreview: ""
        };
      };

      if (!window.jQuery) {
        return { ok: false, reason: "missing-jquery", movieId: downloadIds[0] || null, links: [] };
      }

      await clickDownloadTriggers(document);

      for (const movieId of downloadIds) {
        if (timedOut()) break;
        for (const type of types) {
          if (timedOut()) break;
          const attempt = await activateDownloadDropdown(type, movieId);
          attempts.push(attempt);
          if (links.size > 0) break;
        }
        if (links.size > 0) break;
      }

      if (!timedOut() && window.Player && /\\/(?:movie|tv-series|tv|serie|series|episode|episodes)\\//i.test(window.location.pathname)) {
        try {
          if (typeof window.Player.getLinks === "function") window.Player.getLinks();
        } catch {}
        try {
          if (typeof window.Player.requestLink === "function") window.Player.requestLink();
        } catch {}
        await sleep(800);
        collectLinksFromDom();
      }

      return {
        ok: links.size > 0,
        movieId: downloadIds[0] || null,
        downloadIds,
        attempts,
        maxHeight: maxLinkHeight(),
        links: [...links]
      };
    })()
  `;

  try {
    return await withTimeout(
      contents.executeJavaScript(script),
      FETCH_LINKS_TIMEOUT_MS,
      "Download link scan timed out."
    );
  } catch (error) {
    return { ok: false, error: error.message || String(error), links: [] };
  }
}

async function scanDirectDownloads(contents, movieUrl = null) {
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  if (movieUrl) {
    return fetchDirectLinksForMovie(contents, movieUrl);
  }

  await contents.executeJavaScript(buildTornadoDownloadScraperScript()).catch(() => {});
  try {
    return await contents.executeJavaScript(
      "(async () => window.__tornadoScanDirectDownloads?.() || { ok: false, links: [] })()"
    );
  } catch (error) {
    return { ok: false, error: error.message || String(error), links: [] };
  }
}

module.exports = {
  DIRECT_LINK_PATTERN,
  GETBUTTON_TYPES,
  extractMovieIdFromUrl,
  withTimeout,
  buildTornadoDownloadScraperScript,
  setupTornadoDownloadScraper,
  fetchDirectLinksForMovie,
  scanDirectDownloads
};
