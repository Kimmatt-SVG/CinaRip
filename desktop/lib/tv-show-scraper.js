const { isAniwaveUrl, isAniwaveHost, scrapeAniwaveTvShowFromPage, setupAniwaveScraper } = require("./aniwave-scraper");

function buildTvShowScraperScript() {
  return `
(() => {
  if (window.__tornadoTvShowScraperInstalled) return;
  window.__tornadoTvShowScraperInstalled = true;

  const normalize = (url) => {
    try {
      const parsed = new URL(url, window.location.href);
      parsed.hash = "";
      return parsed.toString().replace(/\\/$/, "");
    } catch {
      return "";
    }
  };

  const parseSeasonEpisode = (text) => {
    const source = String(text || "");
    const patterns = [
      /\\bS(\\d{1,2})\\s*E(\\d{1,3})\\b/i,
      /\\b(\\d{1,2})x(\\d{1,3})\\b/,
      /season[-_\\s]?(\\d{1,2}).*?episode[-_\\s]?(\\d{1,3})/i,
      /season[-_\\s]?(\\d{1,2})/i,
      /episode[-_\\s]?(\\d{1,3})/i
    ];

    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (!match) continue;
      if (/episode/i.test(pattern.source) && match.length < 3) {
        return { season: 0, episode: Number.parseInt(match[1], 10) || 0 };
      }
      if (/season/i.test(pattern.source) && match.length < 3) {
        return { season: Number.parseInt(match[1], 10) || 0, episode: 0 };
      }
      if (match.length >= 3) {
        return {
          season: Number.parseInt(match[1], 10) || 0,
          episode: Number.parseInt(match[2], 10) || 0
        };
      }
    }

    return { season: 0, episode: 0 };
  };

  const seasonFromText = (text) => {
    const parsed = parseSeasonEpisode(text);
    if (parsed.season > 0) return parsed.season;
    const match = String(text || "").match(/\\bseason\\s*(\\d{1,2})\\b/i);
    return match ? Number.parseInt(match[1], 10) || null : null;
  };

  const isSeasonLabel = (text) => /^season\\s*\\d{1,2}$/i.test(String(text || "").trim());

  const showIdentityFromPath = (pathname) => {
    const path = String(pathname || "");
    const seriesMatch = path.match(/\\/(?:tv-series|tv|serie|series)\\/([^/]+)\\/([^/]+)/i);
    if (seriesMatch) {
      const slug = seriesMatch[1];
      const seasonMatch = slug.match(/^(.*)-season-(\\d{1,2})$/i);
      return {
        kind: "series",
        slug,
        baseSlug: seasonMatch ? seasonMatch[1] : slug,
        season: seasonMatch ? Number.parseInt(seasonMatch[2], 10) : null,
        showId: seriesMatch[2]
      };
    }

    const episodeMatch = path.match(/\\/(?:episode|episodes|watch)\\/([^/]+)\\/([^/]+)/i);
    if (episodeMatch) {
      const slug = episodeMatch[1];
      const seasonMatch = slug.match(/^(.*)-season-(\\d{1,2})$/i);
      return {
        kind: "episode",
        slug,
        baseSlug: seasonMatch ? seasonMatch[1] : slug,
        season: seasonMatch ? Number.parseInt(seasonMatch[2], 10) : null,
        showId: episodeMatch[2]
      };
    }

    return null;
  };

  const currentShow = () => showIdentityFromPath(window.location.pathname);

  const extractContentSlug = (hrefOrSlug) => {
    const text = String(hrefOrSlug || "");
    try {
      const parsed = new URL(text, window.location.href);
      const match = parsed.pathname.match(
        /\\/(?:tv-series|tv|serie|series|episode|episodes|watch)\\/([^/]+)/i
      );
      if (match) return match[1];
    } catch {
      // fall through
    }
    const pathMatch = text.match(
      /\\/(?:tv-series|tv|serie|series|episode|episodes|watch)\\/([^/]+)/i
    );
    return pathMatch ? pathMatch[1] : text;
  };

  const slugMatchesCurrentShow = (hrefOrSlug) => {
    const identity = currentShow();
    if (!identity?.baseSlug) return false;
    const slug = extractContentSlug(hrefOrSlug);
    const escaped = identity.baseSlug.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
    const pattern = new RegExp("^" + escaped + "(?:-season-\\\\d{1,2})?$", "i");
    return pattern.test(slug);
  };

  const isRelatedNoiseSection = (element) => {
    if (!element || element === document.body || element === document.documentElement) return false;
    let node = element;
    let depth = 0;
    while (node && node !== document.body && depth < 12) {
      const marker = [node.id, typeof node.className === "string" ? node.className : ""]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (
        /recommend|related|similar|you.?may|also.?like|trending|popular|suggestions|more.?like|film_related|movies-list-wrap/i.test(
          marker
        )
      ) {
        return true;
      }

      node = node.parentElement;
      depth += 1;
    }
    return false;
  };

  const buildSeasonPageUrl = (seasonNumber) => {
    const identity = currentShow();
    if (!identity?.baseSlug) return null;
    try {
      const current = new URL(window.location.href);
      const seasonSlug = identity.baseSlug + "-season-" + seasonNumber;
      const escaped = identity.baseSlug.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
      const seasonPattern = new RegExp(escaped + "-season-\\\\d{1,2}", "i");
      if (seasonPattern.test(current.pathname)) {
        current.pathname = current.pathname.replace(seasonPattern, seasonSlug);
      } else {
        const parts = current.pathname.split("/").filter(Boolean);
        if (parts.length >= 2) {
          parts[1] = seasonSlug;
          current.pathname = "/" + parts.slice(0, 3).join("/");
        }
      }
      return current.toString().replace(/\\/$/, "");
    } catch {
      return null;
    }
  };

  const findPrimarySeasonToggle = () => {
    const selectors = [
      ".dropdown-toggle",
      "[data-toggle='dropdown']",
      "button[class*='season' i]",
      "[class*='season' i][class*='dropdown' i]",
      "[class*='season' i][class*='toggle' i]"
    ];

    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const text = String(element.textContent || "").trim();
        if (!isSeasonLabel(text) && !seasonFromText(text)) continue;
        if (isRelatedNoiseSection(element)) continue;
        return element;
      }
    }

    return null;
  };

  const seasonMenuForToggle = (toggle) => {
    if (!toggle) return null;
    const root =
      toggle.closest(".dropdown, [class*='dropdown'], [class*='season']") || toggle.parentElement;
    if (!root) return null;
    return (
      root.querySelector(".dropdown-menu.show, .dropdown-menu, [role='menu'], [role='listbox'], ul") ||
      null
    );
  };

  const openSeasonDropdown = async () => {
    const toggle = findPrimarySeasonToggle();
    if (!toggle) return null;

    toggle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    toggle.click();
    await new Promise((resolve) => setTimeout(resolve, 250));

    let menu = seasonMenuForToggle(toggle);
    if (menu && menu.querySelector("a, button, li, [role='option'], [role='menuitem']")) {
      return { toggle, menu };
    }

    return { toggle, menu: menu || null };
  };

  const collectDropdownSeasonItems = (menu) => {
    if (!menu) return [];
    return [...menu.querySelectorAll("a, button, li, [role='option'], [role='menuitem']")].filter(
      (element) => {
        const label = String(element.textContent || element.getAttribute("aria-label") || "").trim();
        return isSeasonLabel(label) || seasonFromText(label);
      }
    );
  };

  const detectActiveSeason = () => {
    const identity = currentShow();
    if (identity?.season) return identity.season;

    const sources = [
      window.location.pathname,
      window.location.href,
      document.title,
      document.querySelector("h1, .title, .movie-title, .show-title")?.textContent || ""
    ];

    for (const source of sources) {
      const match = String(source).match(/season[-_\\s]?(\\d{1,2})/i);
      if (match) return Number.parseInt(match[1], 10) || 1;
    }

    const toggle = findPrimarySeasonToggle();
    if (toggle) {
      const season = seasonFromText(toggle.textContent || "");
      if (season) return season;
    }

    return 1;
  };

  const isEpisodeLink = (href) => {
    if (!href) return false;
    // Tornado episode download/stream pages end in *-watching.html
    return /\\/[A-Za-z0-9_-]+-watching\\.html?/i.test(href);
  };

  const matchesActiveSeasonSlug = (href, activeSeason) => {
    const identity = currentShow();
    if (!identity?.baseSlug) return false;
    const escaped = identity.baseSlug.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
    const pattern = new RegExp(
      "/(?:tv-series|tv|serie|series)/" + escaped + "-season-" + activeSeason + "/",
      "i"
    );
    return pattern.test(String(href || ""));
  };

  const collectEpisodeLinks = (activeSeason) => {
    const found = new Map();
    const identity = currentShow();
    const season = Number.parseInt(activeSeason, 10) || identity?.season || 1;
    const seasonId = identity?.showId || null;

    const consider = (element, ignoreNoise, requireSeasonId) => {
      if (!ignoreNoise && isRelatedNoiseSection(element)) return;
      const rawHref = element.getAttribute("href") || "";
      const href = normalize(rawHref);
      if (!href || !isEpisodeLink(href)) return;
      if (!matchesActiveSeasonSlug(href, season)) return;
      if (requireSeasonId && seasonId && !href.includes("/" + seasonId + "/")) return;

      const text = String(element.textContent || "").trim();
      const label = [text, href, element.getAttribute("title") || ""].join(" ");
      const numbers = parseSeasonEpisode(label);
      if (numbers.season > 0 && numbers.season !== season) return;

      if (!found.has(href)) {
        found.set(href, {
          url: href,
          title: text || "Episode",
          season,
          episode: numbers.episode
        });
      }
    };

    // Prefer links that include this page's season id.
    for (const element of document.querySelectorAll("a[href*='-watching']")) {
      consider(element, false, true);
    }

    if (!found.size) {
      for (const element of document.querySelectorAll("a[href*='-watching']")) {
        consider(element, true, true);
      }
    }

    // Fall back to same-slug season watching links if season-id matching found nothing.
    if (!found.size) {
      for (const element of document.querySelectorAll("a[href*='-watching']")) {
        consider(element, true, false);
      }
    }

    return [...found.values()];
  };

  const normalizeEpisodeNumbers = (episodes, activeSeason) => {
    const sorted = [...episodes].sort((a, b) => {
      const aEpisode = a.episode > 0 ? a.episode : Number.MAX_SAFE_INTEGER;
      const bEpisode = b.episode > 0 ? b.episode : Number.MAX_SAFE_INTEGER;
      if (aEpisode !== bEpisode) return aEpisode - bEpisode;
      return String(a.title).localeCompare(String(b.title));
    });

    return sorted.map((item, index) => ({
      ...item,
      season: activeSeason,
      episode: item.episode > 0 ? item.episode : index + 1
    }));
  };

  const collectAvailableSeasons = (menu) => {
    const seasons = new Map();
    const identity = currentShow();

    const preferUrl = (existingUrl, nextUrl) => {
      const existing = existingUrl || "";
      const next = nextUrl || "";
      if (!existing) return next || null;
      if (!next) return existing;
      const existingWatching = /\\/[A-Za-z0-9_-]+-watching\\.html?/i.test(existing);
      const nextWatching = /\\/[A-Za-z0-9_-]+-watching\\.html?/i.test(next);
      // Prefer season hub URLs over episode-1 watching links.
      if (existingWatching && !nextWatching) return next;
      return existing;
    };

    const addSeason = (num, label, url) => {
      const parsed = Number.parseInt(num, 10);
      if (!parsed || parsed < 1 || parsed > 99) return;
      if (url && !slugMatchesCurrentShow(url)) return;

      const key = String(parsed);
      const normalizedUrl = url ? normalize(url) : null;
      if (normalizedUrl && !slugMatchesCurrentShow(normalizedUrl)) return;

      const existing = seasons.get(key);
      if (!existing) {
        seasons.set(key, {
          number: parsed,
          label: String(label || "Season " + parsed).trim() || "Season " + parsed,
          url: normalizedUrl || null
        });
        return;
      }
      existing.url = preferUrl(existing.url, normalizedUrl);
      if ((!existing.label || existing.label === "Season " + parsed) && label) {
        existing.label = String(label).trim() || existing.label;
      }
    };

    for (const select of document.querySelectorAll("select[name*='season' i], select[id*='season' i]")) {
      if (isRelatedNoiseSection(select)) continue;
      for (const option of select.options) {
        const label = String(option.textContent || option.value || "").trim();
        const num = seasonFromText(label) || seasonFromText(option.value);
        if (num) addSeason(num, label, null);
      }
    }

    for (const element of collectDropdownSeasonItems(menu)) {
      const label = String(element.textContent || element.getAttribute("aria-label") || "").trim();
      const href = normalize(element.getAttribute("href") || "");
      const num =
        seasonFromText(element.getAttribute("data-season") || "") ||
        seasonFromText(label) ||
        (href && slugMatchesCurrentShow(href) ? seasonFromText(href) : null);
      if (num) addSeason(num, label || "Season " + num, href || null);
    }

    // Only same-show season links: /series/{base}-season-N/{uniqueSeasonId}/...
    if (identity?.baseSlug) {
      const escaped = identity.baseSlug.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
      const hrefNeedle = identity.baseSlug + "-season-";
      for (const element of document.querySelectorAll("a[href*='-season-']")) {
        if (isRelatedNoiseSection(element)) continue;
        const href = normalize(element.getAttribute("href") || "");
        if (!href || !href.includes(hrefNeedle)) continue;
        if (!slugMatchesCurrentShow(href)) continue;
        const match = href.match(new RegExp(escaped + "-season-(\\\\d{1,2})", "i"));
        const num = match ? Number.parseInt(match[1], 10) : seasonFromText(href);
        if (!num) continue;
        addSeason(num, "Season " + num, href);
      }
    }

    if (identity?.season) {
      const hub = (() => {
        try {
          const parts = window.location.pathname.split("/").filter(Boolean);
          if (parts.length >= 3 && !/-watching\\.html?/i.test(parts[parts.length - 1])) {
            return normalize(window.location.origin + "/" + parts.slice(0, 3).join("/"));
          }
          if (parts.length >= 3) {
            return normalize(window.location.origin + "/" + parts.slice(0, 3).join("/"));
          }
        } catch {
          // ignore
        }
        return normalize(window.location.href);
      })();
      addSeason(identity.season, "Season " + identity.season, hub);
    }

    return [...seasons.values()].sort((a, b) => a.number - b.number);
  };

  const readShowMeta = () => {
    const pageUrl = normalize(window.location.href);
    const baseTitle =
      document.querySelector("h1, .title, .movie-title, .show-title")?.textContent?.trim() ||
      document.title.replace(/\\s*[-|].*$/, "").trim() ||
      "TV Show";
    const showTitle = baseTitle.replace(/\\s*[-–]\\s*season\\s*\\d+.*$/i, "").trim() || baseTitle;

    const posterCandidates = [
      document.querySelector('meta[property="og:image"]')?.content,
      document.querySelector('meta[name="twitter:image"]')?.content,
      document.querySelector(".film-poster img, .movie-poster img, .poster img, img.poster")?.currentSrc,
      document.querySelector(".film-poster img, .movie-poster img, .poster img, img.poster")?.src,
      document.querySelector(".poster[data-img]")?.getAttribute("data-img")
    ];
    let posterUrl = "";
    for (const raw of posterCandidates) {
      try {
        if (!raw || String(raw).startsWith("data:")) continue;
        posterUrl = new URL(String(raw), window.location.href).href;
        if (posterUrl) break;
      } catch {
        // try next
      }
    }

    return { pageUrl, showTitle, posterUrl: posterUrl || undefined };
  };

  const clickSeasonOption = async (target, menu) => {
    const opened = menu ? { menu } : await openSeasonDropdown();
    const items = collectDropdownSeasonItems(opened?.menu);

    for (const element of items) {
      const label = String(element.textContent || element.getAttribute("aria-label") || "").trim();
      const href = normalize(element.getAttribute("href") || "");
      const num =
        seasonFromText(element.getAttribute("data-season") || "") ||
        seasonFromText(label) ||
        (href && slugMatchesCurrentShow(href) ? seasonFromText(href) : null);
      if (num !== target) continue;

      // Never click navigational anchors mid-scrape — that unloads the page.
      if (href && slugMatchesCurrentShow(href) && !/^#|^javascript:/i.test(href)) {
        return { season: target, url: href };
      }

      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      element.click();
      await new Promise((resolve) => setTimeout(resolve, 800));
      return { season: target, url: null };
    }

    for (const element of document.querySelectorAll("a[href*='-season-']")) {
      if (isRelatedNoiseSection(element)) continue;
      const href = normalize(element.getAttribute("href") || "");
      if (!href || !slugMatchesCurrentShow(href)) continue;
      const num = seasonFromText(href) || seasonFromText(element.textContent || "");
      if (num !== target) continue;
      return { season: target, url: href };
    }

    return null;
  };

  const selectSeason = async (seasonNumber) => {
    const target = Number.parseInt(seasonNumber, 10);
    if (!target) return { season: detectActiveSeason(), url: null };

    if (detectActiveSeason() === target) {
      return { season: target, url: null };
    }

    const select = document.querySelector("select[name*='season' i], select[id*='season' i]");
    if (select && !isRelatedNoiseSection(select)) {
      for (const option of select.options) {
        const label = [option.textContent, option.value].join(" ");
        const num = seasonFromText(label) || seasonFromText(option.value);
        if (num === target) {
          select.value = option.value;
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.dispatchEvent(new Event("change", { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 800));
          return { season: target, url: null };
        }
      }
    }

    const clicked = await clickSeasonOption(target);
    if (clicked) return clicked;

    return { season: detectActiveSeason(), url: null };
  };

  window.__tornadoDiscoverTvSeasons = async () => {
    const meta = readShowMeta();
    let seasons = collectAvailableSeasons(null);
    if (seasons.length < 2) {
      const opened = await openSeasonDropdown();
      seasons = collectAvailableSeasons(opened?.menu);
    }
    if (!seasons.length) {
      const fallback = detectActiveSeason();
      seasons = [
        {
          number: fallback,
          label: "Season " + fallback,
          url: meta.pageUrl
        }
      ];
    }

    return {
      ok: seasons.length > 0,
      showTitle: meta.showTitle,
      showUrl: meta.pageUrl,
      posterUrl: meta.posterUrl,
      seasons,
      seasonCount: seasons.length,
      showSlug: currentShow()?.baseSlug || null
    };
  };

  window.__tornadoScanTvShow = async (requestedSeason, options = {}) => {
    const meta = readShowMeta();
    const pageUrl = meta.pageUrl;
    const pathname = window.location.pathname || "";
    const isShowPage = /\\/(?:tv-series|tv|serie|series)\\//i.test(pathname);
    const skipSelect = Boolean(options && options.skipSelect);
    const currentSeason = detectActiveSeason();

    let activeSeason = currentSeason;

    if (requestedSeason && !skipSelect && Number(requestedSeason) !== currentSeason) {
      const selected = await selectSeason(requestedSeason);
      activeSeason = selected?.season || currentSeason;
      if (selected?.url) {
        return {
          ok: false,
          needsNavigation: true,
          navigateTo: selected.url,
          season: activeSeason,
          showTitle: meta.showTitle,
          showUrl: pageUrl,
          posterUrl: meta.posterUrl,
          episodeCount: 0,
          episodes: [],
          notes: ["Season page URL resolved; navigate then rescan."]
        };
      }
    } else if (requestedSeason) {
      activeSeason = Number(requestedSeason) || currentSeason;
    }

    const rawEpisodes = collectEpisodeLinks(activeSeason);
    const episodeList = normalizeEpisodeNumbers(rawEpisodes, activeSeason);

    return {
      ok: episodeList.length > 0,
      isShowPage,
      showTitle: meta.showTitle,
      season: activeSeason,
      showUrl: pageUrl,
      posterUrl: meta.posterUrl,
      episodeCount: episodeList.length,
      episodes: episodeList,
      notes: [
        "Scanned season " + activeSeason + " only.",
        "Limited to *-watching.html links for " +
          (currentShow()?.baseSlug || "unknown") +
          "-season-" +
          activeSeason,
        "Found " + episodeList.length + " episode link(s)."
      ],
      pathname,
      title: document.title || ""
    };
  };
})();
`;
}

function setupTvShowScraper(contents) {
  setupAniwaveScraper(contents);
  if (!contents || contents.isDestroyed()) return;

  const inject = () => {
    contents.executeJavaScript(buildTvShowScraperScript()).catch(() => {});
  };

  contents.on("dom-ready", inject);
  contents.on("did-finish-load", inject);
}

async function scrapeTvShowFromPage(contents, options = {}) {
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  const pageUrl = contents.getURL() || "";
  if (isAniwaveHost(pageUrl) || isAniwaveUrl(pageUrl)) {
    return scrapeAniwaveTvShowFromPage(contents);
  }

  // Force reinject so scraper updates take effect without stale page state.
  await contents
    .executeJavaScript("window.__tornadoTvShowScraperInstalled = false;")
    .catch(() => {});
  await contents.executeJavaScript(buildTvShowScraperScript()).catch(() => {});

  const seasonArg =
    Number.isFinite(Number(options.season)) && Number(options.season) > 0
      ? Number(options.season)
      : null;
  const skipSelect = Boolean(options.skipSelect);

  try {
    const expression =
      seasonArg != null
        ? `window.__tornadoScanTvShow?.(${seasonArg}, ${JSON.stringify({ skipSelect })}) || { ok: false }`
        : `window.__tornadoScanTvShow?.(null, ${JSON.stringify({ skipSelect })}) || { ok: false }`;
    let result = await contents.executeJavaScript(expression);

    // Episode lists sometimes hydrate after first paint.
    if (!result?.ok && !result?.needsNavigation) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      result = await contents.executeJavaScript(expression);
    }

    return result;
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

async function discoverTvSeasonsFromPage(contents) {
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  const pageUrl = contents.getURL() || "";
  if (isAniwaveHost(pageUrl) || isAniwaveUrl(pageUrl)) {
    return { ok: true, seasons: [{ number: 1, label: "Season 1", url: pageUrl }], seasonCount: 1 };
  }

  await contents
    .executeJavaScript("window.__tornadoTvShowScraperInstalled = false;")
    .catch(() => {});
  await contents.executeJavaScript(buildTvShowScraperScript()).catch(() => {});

  try {
    return await contents.executeJavaScript(
      "(async () => window.__tornadoDiscoverTvSeasons?.() || { ok: false })()"
    );
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

module.exports = {
  buildTvShowScraperScript,
  setupTvShowScraper,
  scrapeTvShowFromPage,
  discoverTvSeasonsFromPage
};
