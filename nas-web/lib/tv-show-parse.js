"use strict";

const {
  BASE_URL,
  decodeHtml,
  normalizeHref,
  parseTornadoSeriesUrl,
  showBaseSlugFromUrl,
  seasonNumberFromUrl,
  episodeFileLabel,
  toSeasonHubUrl,
  extractEpisodeWatchId,
  isWatchingEpisodeUrl,
  slugMatchesCurrentShow
} = require("./content-url");

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function parseSeasonEpisode(text) {
  const source = String(text || "");
  const patterns = [
    /\bS(\d{1,2})\s*E(\d{1,3})\b/i,
    /\b(\d{1,2})x(\d{1,3})\b/,
    /season[-_\s]?(\d{1,2}).*?episode[-_\s]?(\d{1,3})/i,
    /season[-_\s]?(\d{1,2})/i,
    /\bS(\d{1,2})\b/i,
    /episode[-_\s]?(\d{1,3})/i
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    if (match.length < 3) {
      if (/episode/i.test(pattern.source) && !/season/i.test(pattern.source)) {
        return { season: 0, episode: Number.parseInt(match[1], 10) || 0 };
      }
      return { season: Number.parseInt(match[1], 10) || 0, episode: 0 };
    }
    return {
      season: Number.parseInt(match[1], 10) || 0,
      episode: Number.parseInt(match[2], 10) || 0
    };
  }

  return { season: 0, episode: 0 };
}

function seasonFromText(text) {
  const parsed = parseSeasonEpisode(text);
  if (parsed.season > 0) return parsed.season;
  const match = String(text || "").match(/\bseason\s*(\d{1,2})\b/i);
  return match ? Number.parseInt(match[1], 10) || null : null;
}

const SEASON_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10
};

function seasonFromOptionLabel(text) {
  const named = seasonFromText(text);
  if (named) return named;
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return null;
  const word = source.match(/\bseason\s+([a-z]+)\b/i) || source.match(/^([a-z]+)$/i);
  if (word) {
    const mapped = SEASON_WORDS[word[1].toLowerCase()];
    if (mapped) return mapped;
  }
  const nth = source.match(/\b(\d{1,2})(?:st|nd|rd|th)(?:\s+season)?\b/i);
  if (nth) {
    const num = Number.parseInt(nth[1], 10);
    if (num >= 1 && num <= 40) return num;
  }
  const bare = source.match(/^s?(\d{1,2})$/i);
  if (bare) {
    const num = Number.parseInt(bare[1], 10);
    if (num >= 1 && num <= 40) return num;
  }
  return null;
}

function isEpisodeLink(href) {
  const text = String(href || "");
  if (/\/[A-Za-z0-9_-]+-watching\.html?/i.test(text)) return true;
  if (/\/(?:episode|episodes)\//i.test(text)) return true;
  return false;
}

function metaContent(html, name) {
  const property = String(html || "").match(
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`,
      "i"
    )
  );
  if (property?.[1]) return decodeHtml(property[1]);
  const reversed = String(html || "").match(
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`,
      "i"
    )
  );
  return reversed?.[1] ? decodeHtml(reversed[1]) : "";
}

function readShowMeta(html, pageUrl, baseUrl = BASE_URL) {
  const h1 = stripTags(String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const ogTitle = metaContent(html, "og:title");
  const docTitle = stripTags(String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const baseTitle =
    h1 ||
    ogTitle.replace(/\s*[-|].*$/, "").trim() ||
    docTitle.replace(/\s*[-|].*$/, "").trim() ||
    "TV Show";
  const showTitle = baseTitle.replace(/\s*[-–]\s*season\s*\d+.*$/i, "").trim() || baseTitle;

  const posterCandidates = [
    metaContent(html, "og:image"),
    metaContent(html, "twitter:image"),
    String(html || "").match(/data-img=["']([^"']+)["']/i)?.[1],
    String(html || "").match(
      /<(?:div|a)[^>]+class=["'][^"']*poster[^"']*["'][^>]*data-img=["']([^"']+)["']/i
    )?.[1],
    String(html || "").match(
      /<img[^>]+class=["'][^"']*(?:poster|film-poster|movie-poster)[^"']*["'][^>]+src=["']([^"']+)["']/i
    )?.[1]
  ];

  let posterUrl = "";
  for (const raw of posterCandidates) {
    if (!raw || String(raw).startsWith("data:")) continue;
    try {
      posterUrl = new URL(decodeHtml(raw), baseUrl).href;
      if (posterUrl) break;
    } catch {
      // try next
    }
  }

  return {
    pageUrl: normalizeHref(pageUrl, baseUrl) || String(pageUrl || ""),
    showTitle,
    posterUrl: posterUrl || undefined
  };
}

function detectActiveSeason(html, pageUrl) {
  const identity = parseTornadoSeriesUrl(pageUrl);
  if (identity?.season) return identity.season;

  const sources = [pageUrl, metaContent(html, "og:title"), String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]];
  for (const source of sources) {
    const match = String(source || "").match(/season[-_\s]?(\d{1,2})/i);
    if (match) return Number.parseInt(match[1], 10) || 1;
  }
  return 1;
}

function collectAvailableSeasons(html, pageUrl, baseUrl = BASE_URL) {
  const seasons = new Map();
  const identity = parseTornadoSeriesUrl(pageUrl, baseUrl);
  const baseSlug = identity?.baseSlug || showBaseSlugFromUrl(pageUrl);

  const preferUrl = (existingUrl, nextUrl) => {
    const existing = existingUrl || "";
    const next = nextUrl || "";
    if (!existing) return next || null;
    if (!next) return existing;
    if (isEpisodeLink(existing) && !isEpisodeLink(next)) return next;
    return existing;
  };

  const addSeason = (num, label, url) => {
    const parsed = Number.parseInt(num, 10);
    if (!parsed || parsed < 1 || parsed > 99) return;
    const key = String(parsed);
    const normalizedUrl = url ? normalizeHref(url, baseUrl) : null;
    if (normalizedUrl) {
      const otherSlug = showBaseSlugFromUrl(normalizedUrl);
      if (baseSlug && otherSlug && !slugMatchesCurrentShow(normalizedUrl, baseSlug)) return;
    }

    const existing = seasons.get(key);
    if (!existing) {
      seasons.set(key, {
        number: parsed,
        label: String(label || `Season ${parsed}`).trim() || `Season ${parsed}`,
        url: normalizedUrl || null
      });
      return;
    }
    existing.url = preferUrl(existing.url, normalizedUrl);
    if ((!existing.label || existing.label === `Season ${parsed}`) && label) {
      existing.label = String(label).trim() || existing.label;
    }
  };

  const optionPattern = /<option([^>]*)>([\s\S]*?)<\/option>/gi;
  let optionMatch;
  while ((optionMatch = optionPattern.exec(String(html || "")))) {
    const attrs = optionMatch[1] || "";
    const value = decodeHtml(attrs.match(/\bvalue=["']([^"']+)["']/i)?.[1] || "");
    const label = stripTags(optionMatch[2]);
    const num = seasonFromOptionLabel(label) || seasonFromOptionLabel(value);
    if (!num) continue;
    const optionUrl = /(?:\/(?:tv-series|tv|serie|series|watch|episode)\/|https?:\/\/)/i.test(value)
      ? value
      : null;
    addSeason(num, label, optionUrl);
  }

  const dataSeasonPattern =
    /<(?:a|button|div|li|span)([^>]*\bdata-season=["'](\d{1,2})["'][^>]*)>/gi;
  let dataSeasonMatch;
  while ((dataSeasonMatch = dataSeasonPattern.exec(String(html || "")))) {
    const attrs = dataSeasonMatch[1] || "";
    const num = Number.parseInt(dataSeasonMatch[2], 10);
    const href =
      attrs.match(/\b(?:href|data-href|data-url)\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    const label = stripTags(attrs.match(/\b(?:title|aria-label)=["']([^"']+)["']/i)?.[1] || "") || `Season ${num}`;
    addSeason(num, label, href);
  }

  const hrefPattern = /href\s*=\s*["']([^"']+)["']/gi;
  let hrefMatch;
  const text = expandShowHtml(html);
  while ((hrefMatch = hrefPattern.exec(text))) {
    const href = hrefMatch[1];
    if (!/-season-/i.test(href) && !/\/(?:tv-series|tv|serie|series)\//i.test(href)) continue;
    const snippet = text.slice(Math.max(0, hrefMatch.index - 80), hrefMatch.index + href.length + 120);
    const label = stripTags(snippet.match(/>([^<]{0,80})</)?.[1] || "") || `Season ${seasonFromText(href) || ""}`;
    const num =
      seasonNumberFromUrl(href) ||
      seasonFromText(href) ||
      seasonFromText(label) ||
      (String(label).trim().length <= 12 ? seasonFromOptionLabel(label) : null);
    if (!num) continue;
    if (baseSlug && /\/(?:tv-series|tv|serie|series)\//i.test(href)) {
      const slug = showBaseSlugFromUrl(href);
      if (slug && !slugMatchesCurrentShow(href, baseSlug)) continue;
    }
    addSeason(num, /season/i.test(label) ? label : `Season ${num}`, href);
  }

  if (identity?.season) {
    const hub =
      identity.seasonId && !identity.isWatching
        ? `${identity.origin}/${identity.prefix || "series"}/${identity.slug}/${identity.seasonId}`
        : toSeasonHubUrl(identity.href) || identity.href;
    addSeason(identity.season, `Season ${identity.season}`, hub);
  }

  return [...seasons.values()].sort((a, b) => a.number - b.number);
}

function matchesActiveSeasonSlug(href, identity, season) {
  const slug = identity?.baseSlug;
  if (!slug) return isEpisodeLink(href);
  if (!slugMatchesCurrentShow(href, slug)) return false;
  const hrefSeason = seasonNumberFromUrl(href);
  if (hrefSeason && Number(hrefSeason) !== Number(season)) return false;
  return true;
}

function expandShowHtml(html) {
  return decodeHtml(String(html || "")).replace(/\\\//g, "/");
}

function episodeHrefCandidates(html) {
  const text = expandShowHtml(html);
  const found = [];
  const attr = /(?:href|data-href|data-url|data-link)\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = attr.exec(text))) found.push(match[1]);
  const loose =
    text.match(/https?:\/\/[^\s"'<>\\]+(?:watching\.html?|\/(?:episode|episodes)\/[^\s"'<>\\]+)/gi) || [];
  const relative =
    text.match(/\/(?:tv-series|tv|serie|series|episode|episodes)\/[^\s"'<>\\]+-watching\.html?/gi) || [];
  const episodePaths = text.match(/\/(?:episode|episodes)\/[^\s"'<>\\]+/gi) || [];
  const onclick =
    text.match(/(?:location(?:\.href)?|window\.location)\s*=\s*['"]([^'"]+)['"]/gi) || [];
  const onclickHrefs = onclick
    .map((entry) => String(entry).match(/['"]([^'"]+)['"]/)?.[1])
    .filter(Boolean);
  const jsonHrefs = [];
  const jsonPattern = /"(?:url|href|link|file)"\s*:\s*"((?:\\.|[^"\\])*)"/gi;
  let jsonMatch;
  while ((jsonMatch = jsonPattern.exec(text))) {
    const href = jsonMatch[1].replace(/\\\//g, "/");
    if (/watching\.html?|\/(?:episode|episodes)\//i.test(href)) jsonHrefs.push(href);
  }
  return [...found, ...loose, ...relative, ...episodePaths, ...onclickHrefs, ...jsonHrefs];
}

function linkTitleFromHtml(html, href) {
  const escaped = String(href || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return "Episode";

  const titles = [];
  const taggedPattern = new RegExp(
    `<(?:a|button)[^>]*(?:href|data-href|data-url)\\s*=\\s*["']${escaped}["']([^>]*)>([\\s\\S]*?)</`,
    "gi"
  );
  let tagged;
  while ((tagged = taggedPattern.exec(String(html || "")))) {
    const titleAttr = decodeHtml(tagged[1].match(/\btitle=["']([^"']+)["']/i)?.[1] || "");
    const inner = stripTags(tagged[2] || "");
    if (inner && !/^season\s*\d+$/i.test(inner)) titles.push(inner);
    if (titleAttr) {
      titles.push(titleAttr.replace(/^\s*S\d{1,2}E\d{1,3}\s+/i, "").trim() || titleAttr);
    }
  }

  const titleOnlyPattern = new RegExp(
    `(?:href|data-href|data-url)\\s*=\\s*["']${escaped}["'][^>]*\\btitle=["']([^"']+)["']`,
    "gi"
  );
  let titleOnly;
  while ((titleOnly = titleOnlyPattern.exec(String(html || "")))) {
    const titleAttr = decodeHtml(titleOnly[1] || "");
    if (titleAttr) {
      titles.push(titleAttr.replace(/^\s*S\d{1,2}E\d{1,3}\s+/i, "").trim() || titleAttr);
    }
  }

  let best = "";
  for (const title of titles) {
    if (episodeTitleScore(title) > episodeTitleScore(best)) best = title;
  }
  return best || "Episode";
}

function parseEpisodeHint(...parts) {
  const text = parts.filter(Boolean).join(" ");
  const labeled = parseSeasonEpisode(text);
  if (labeled.episode > 0) return labeled;
  const fromFile = String(text).match(/(?:^|[/_-])ep0*(\d{1,3})(?=[a-z0-9_-]*-watching\.html?|[/_-]|$)/i);
  if (fromFile) {
    return { season: labeled.season || 0, episode: Number.parseInt(fromFile[1], 10) || 0 };
  }
  return labeled;
}

function episodeTitleScore(title) {
  const text = String(title || "").trim();
  if (!text || /^episode$/i.test(text)) return 0;
  if (/^s\d{1,2}e\d{1,3}$/i.test(text)) return 1;
  if (/^episode\s*\d+$/i.test(text)) return 2;
  return 10 + Math.min(text.length, 40);
}

function episodeUrlScore(url) {
  const text = String(url || "");
  if (/\/[A-Za-z0-9_-]+-watching\.html?/i.test(text) || isWatchingEpisodeUrl(text)) return 3;
  if (/\/(?:episode|episodes)\//i.test(text)) return 1;
  return 0;
}

function episodeLinkIdentity(url) {
  const watchId = extractEpisodeWatchId(url);
  if (watchId) return watchId.toLowerCase();
  const episodeId = String(url || "").match(/\/(?:episode|episodes)\/[^/]+\/([^/?#]+)/i)?.[1];
  return episodeId ? episodeId.toLowerCase() : "";
}

function preferEpisode(existing, next) {
  if (!existing) return { ...next };
  if (!next) return existing;
  return {
    url: episodeUrlScore(next.url) > episodeUrlScore(existing.url) ? next.url : existing.url,
    title: episodeTitleScore(next.title) > episodeTitleScore(existing.title) ? next.title : existing.title,
    season: existing.season || next.season,
    episode: existing.episode > 0 ? existing.episode : next.episode
  };
}

function episodeIdentityKeys(item) {
  const keys = [];
  const url = String(item?.url || "");
  if (url) keys.push(`url:${url}`);
  const linkId = episodeLinkIdentity(url);
  if (linkId) keys.push(`id:${linkId}`);
  const episode = Number(item?.episode) || 0;
  if (episode > 0) keys.push(`n:s${Number(item.season) || 1}e${episode}`);
  return keys;
}

function dedupeEpisodes(episodes = []) {
  const groups = [];

  const findGroup = (keys) => {
    for (const group of groups) {
      for (const key of keys) {
        if (group.keys.has(key)) return group;
      }
    }
    return null;
  };

  for (const raw of Array.isArray(episodes) ? episodes : []) {
    if (!raw?.url) continue;
    const keys = episodeIdentityKeys(raw);
    const group = findGroup(keys);
    if (group) {
      group.item = preferEpisode(group.item, raw);
      for (const key of keys) group.keys.add(key);
      for (const key of episodeIdentityKeys(group.item)) group.keys.add(key);
    } else {
      groups.push({ item: { ...raw }, keys: new Set(keys) });
    }
  }

  const merged = groups.map((group) => group.item);
  const hasWatching = merged.some((item) => episodeUrlScore(item.url) >= 3);
  if (!hasWatching) return merged;

  return merged.filter((item) => episodeUrlScore(item.url) >= 3 || Number(item.episode) > 0);
}

function collectEpisodeLinks(html, pageUrl, season, baseUrl = BASE_URL) {
  const found = new Map();
  const identity = parseTornadoSeriesUrl(pageUrl, baseUrl);
  const activeSeason = Number.parseInt(season, 10) || identity?.season || 1;
  const seasonId = identity?.showId || identity?.seasonId || null;
  const text = expandShowHtml(html);

  const consider = (href, requireSeasonId) => {
    const normalized = normalizeHref(href, baseUrl);
    if (!normalized || !isEpisodeLink(normalized)) return;
    if (!matchesActiveSeasonSlug(normalized, identity, activeSeason)) return;
    if (requireSeasonId && seasonId && !normalized.includes(`/${seasonId}/`)) return;

    const title = linkTitleFromHtml(text, href) || linkTitleFromHtml(text, normalized);
    const numbers = parseEpisodeHint(title, href, normalized);
    if (numbers.season > 0 && numbers.season !== activeSeason) return;

    const candidate = {
      url: normalized,
      title: title || "Episode",
      season: activeSeason,
      episode: numbers.episode
    };
    const existing = found.get(normalized);
    found.set(normalized, existing ? preferEpisode(existing, candidate) : candidate);
  };

  const candidates = episodeHrefCandidates(text);
  for (const requireSeasonId of [true, false]) {
    for (const href of candidates) consider(href, requireSeasonId);
    if (found.size) break;
  }

  return dedupeEpisodes([...found.values()]);
}

function normalizeEpisodeNumbers(episodes, activeSeason) {
  const sorted = [...episodes].sort((a, b) => {
    const aEpisode = a.episode > 0 ? a.episode : Number.MAX_SAFE_INTEGER;
    const bEpisode = b.episode > 0 ? b.episode : Number.MAX_SAFE_INTEGER;
    if (aEpisode !== bEpisode) return aEpisode - bEpisode;
    const urlDelta = episodeUrlScore(b.url) - episodeUrlScore(a.url);
    if (urlDelta) return urlDelta;
    return String(a.title).localeCompare(String(b.title));
  });

  const used = new Set(sorted.map((item) => Number(item.episode) || 0).filter((num) => num > 0));
  let next = 1;
  const takeNext = () => {
    while (used.has(next)) next += 1;
    const assigned = next;
    used.add(assigned);
    next += 1;
    return assigned;
  };

  const numbered = sorted.map((item) => ({
    ...item,
    season: activeSeason,
    episode: item.episode > 0 ? item.episode : takeNext()
  }));

  return dedupeEpisodes(numbered);
}

function episodeCode(episode, season = 1) {
  return episodeFileLabel(episode?.season || season || 1, episode?.episode || 0);
}

function guessSeasonHubUrls(pageUrl, season, discoveredUrl, baseUrl = BASE_URL) {
  const urls = [];
  const push = (value) => {
    const normalized = normalizeHref(value, baseUrl);
    if (normalized && !urls.includes(normalized)) urls.push(normalized);
  };
  if (discoveredUrl) {
    push(discoveredUrl);
    const hub = toSeasonHubUrl(discoveredUrl, baseUrl);
    if (hub) push(hub);
  }
  const identity = parseTornadoSeriesUrl(pageUrl, baseUrl);
  const num = Number.parseInt(season, 10);
  if (identity?.baseSlug && num > 0) {
    const bases = [identity.baseSlug];
    const stripped = identity.baseSlug.replace(/-(?:sub|dub)(?:-?[a-z]{2,10})?$/i, "");
    if (stripped && stripped !== identity.baseSlug) bases.push(stripped);
    for (const base of bases) {
      const slug = `${base}-season-${num}`;
      push(`${identity.origin}/${identity.prefix}/${slug}`);
      if (identity.seasonId && (!identity.season || Number(identity.season) === num)) {
        push(`${identity.origin}/${identity.prefix}/${slug}/${identity.seasonId}`);
      }
    }
  }
  return urls;
}

function guessShowHubUrls(pageUrl, baseUrl = BASE_URL) {
  const identity = parseTornadoSeriesUrl(pageUrl, baseUrl);
  if (!identity?.baseSlug || !identity.season) return [];
  const urls = [];
  const push = (value) => {
    const normalized = normalizeHref(value, baseUrl);
    if (normalized && !urls.includes(normalized)) urls.push(normalized);
  };
  push(`${identity.origin}/${identity.prefix}/${identity.baseSlug}`);
  const stripped = identity.baseSlug.replace(/-(?:sub|dub)(?:-?[a-z]{2,10})?$/i, "");
  if (stripped && stripped !== identity.baseSlug) {
    push(`${identity.origin}/${identity.prefix}/${stripped}`);
  }
  return urls;
}

function mergeSeasonLists(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const entry of list || []) {
      const num = Number.parseInt(entry?.number, 10);
      if (!num) continue;
      const key = String(num);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          number: num,
          label: String(entry.label || `Season ${num}`).trim() || `Season ${num}`,
          url: entry.url || null
        });
        continue;
      }
      if ((!prev.url || isEpisodeLink(prev.url)) && entry.url && !isEpisodeLink(entry.url)) {
        prev.url = entry.url;
      }
      if (entry.label && (!prev.label || prev.label === `Season ${num}`)) {
        prev.label = String(entry.label).trim() || prev.label;
      }
    }
  }
  return [...map.values()].sort((a, b) => a.number - b.number);
}

function parseTvShowPage(html, pageUrl, options = {}) {
  const baseUrl = options.baseUrl || BASE_URL;
  const meta = readShowMeta(html, pageUrl, baseUrl);
  const seasons = collectAvailableSeasons(html, pageUrl, baseUrl);
  const requested = Number.parseInt(options.season, 10);
  const activeSeason =
    (requested > 0 ? requested : 0) || detectActiveSeason(html, pageUrl) || seasons[0]?.number || 1;
  const rawEpisodes = collectEpisodeLinks(html, pageUrl, activeSeason, baseUrl);
  const episodes = normalizeEpisodeNumbers(rawEpisodes, activeSeason);

  if (!seasons.length) {
    seasons.push({
      number: activeSeason,
      label: `Season ${activeSeason}`,
      url: meta.pageUrl
    });
  }

  return {
    ok: true,
    isShowPage: /\/(?:tv-series|tv|serie|series)\//i.test(String(pageUrl || "")),
    showTitle: meta.showTitle,
    season: activeSeason,
    showUrl: meta.pageUrl,
    posterUrl: meta.posterUrl,
    seasons,
    seasonCount: seasons.length,
    episodeCount: episodes.length,
    episodes,
    notes: [
      `Scanned season ${activeSeason} only.`,
      `Limited to *-watching.html links for ${showBaseSlugFromUrl(pageUrl) || "unknown"}-season-${activeSeason}`,
      `Found ${episodes.length} episode link(s).`
    ]
  };
}

function buildTvShowPlan(scan) {
  return {
    showTitle: scan.showTitle || "TV Show",
    season: scan.season || scan.episodes?.[0]?.season || 1,
    showUrl: scan.showUrl || "",
    posterUrl: scan.posterUrl || null,
    episodes: Array.isArray(scan.episodes) ? scan.episodes : [],
    scannedAt: Date.now(),
    notes: scan.notes || []
  };
}

function extractPosterUrl(html, pageUrl, baseUrl = BASE_URL) {
  return readShowMeta(html, pageUrl, baseUrl).posterUrl || "";
}

module.exports = {
  parseSeasonEpisode,
  seasonFromText,
  episodeCode,
  readShowMeta,
  extractPosterUrl,
  collectAvailableSeasons,
  collectEpisodeLinks,
  dedupeEpisodes,
  normalizeEpisodeNumbers,
  guessSeasonHubUrls,
  guessShowHubUrls,
  mergeSeasonLists,
  seasonFromOptionLabel,
  parseTvShowPage,
  buildTvShowPlan
};
