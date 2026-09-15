"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");

const { BASE_URL, decodeHtml, normalizeHref, classifyContentUrl, canonicalMoviePageUrl, canonicalContentUrl, normalizeMovieUrl, extractMovieIdFromUrl, extractEpisodeWatchId, extractDownloadIds, extractPageDownloadIds, mergeDownloadIds, titleFromUrl, titleFromMovieUrl, isCatalogTvItem, isTvShowPageUrl, isWatchingEpisodeUrl, episodeFileLabel, safeShowFolderName, showBaseSlugFromUrl, seasonNumberFromUrl, parseTornadoSeriesUrl, toSeasonHubUrl, slugMatchesCurrentShow, catalogCounts } = (() => {
const BASE_URL = process.env.TORNADO_BASE_URL || "https://www4.tornadomovies.co";

const TV_PAGE_PATTERN = /\/(?:tv-series|tv|serie|series)\//i;
const EPISODE_WATCHING_PATTERN = /\/[A-Za-z0-9_-]+-watching\.html?$/i;

function decodeHtml(text) {
  return String(text || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeHref(url, baseUrl = BASE_URL) {
  try {
    const parsed = new URL(decodeHtml(String(url || "").trim()), baseUrl);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function classifyContentUrl(url, baseUrl = BASE_URL) {
  try {
    const parsed = new URL(String(url || ""), baseUrl);
    const pathname = parsed.pathname || "";
    const movieMatch = pathname.match(/\/movie\/([^/]+)\/([^/]+)/i);
    if (movieMatch) {
      return {
        kind: "movie",
        canonical: `${parsed.origin}/movie/${movieMatch[1]}/${movieMatch[2]}`.replace(/\/$/, "")
      };
    }
    const tvMatch = pathname.match(/\/(?:tv-series|tv|serie|series)\/([^/]+)\/([^/]+)/i);
    if (tvMatch) {
      const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
      const keep = segments.slice(0, Math.min(segments.length, 4));
      return {
        kind: "tv",
        canonical: `${parsed.origin}/${keep.join("/")}`
      };
    }
    return null;
  } catch {
    return null;
  }
}

function canonicalMoviePageUrl(url, baseUrl = BASE_URL) {
  try {
    const parsed = new URL(String(url || ""), baseUrl);
    const match = parsed.pathname.match(/\/movie\/([^/]+)\/([^/]+)/i);
    if (!match) return null;
    return `${parsed.origin}/movie/${match[1]}/${match[2]}`.replace(/\/$/, "");
  } catch {
    const match = String(url || "").match(/\/movie\/([^/]+)\/([^/?#]+)/i);
    if (!match) return null;
    try {
      return new URL(`/movie/${match[1]}/${match[2]}`, baseUrl).toString().replace(/\/$/, "");
    } catch {
      return null;
    }
  }
}

function canonicalContentUrl(url, baseUrl = BASE_URL) {
  try {
    const parsed = new URL(String(url || ""), baseUrl);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    const movieMatch = pathname.match(/\/movie\/([^/]+)\/([^/]+)/i);
    if (movieMatch) {
      return `${parsed.origin}/movie/${movieMatch[1]}/${movieMatch[2]}`;
    }

    const tvMatch = pathname.match(/\/(?:tv-series|tv|serie|series)\/([^/]+)\/([^/]+)/i);
    if (tvMatch) {
      return `${parsed.origin}${pathname.split("/").slice(0, 5).join("/")}`.replace(/\/$/, "");
    }

    const episodeMatch = pathname.match(/\/(?:episode|episodes)\/([^/]+)\/([^/]+)/i);
    if (episodeMatch) {
      return `${parsed.origin}/episode/${episodeMatch[1]}/${episodeMatch[2]}`;
    }

    return `${parsed.origin}${pathname}`.replace(/\/$/, "");
  } catch {
    return String(url || "").trim();
  }
}

function normalizeMovieUrl(url, baseUrl = BASE_URL) {
  return canonicalMoviePageUrl(url, baseUrl) || String(url || "").trim();
}

function extractMovieIdFromUrl(url) {
  const canonical = canonicalMoviePageUrl(url) || String(url || "");
  const match = canonical.match(/\/movie\/[^/]+\/([^/?#]+)/i);
  return match ? match[1] : null;
}

function extractEpisodeWatchId(url) {
  const text = String(url || "");
  const watchMatch = text.match(/\/([A-Za-z0-9]+)-watching\.html?$/i);
  if (watchMatch?.[1]) return watchMatch[1];

  const segments = text.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || "";
  const stripped = last.replace(/-watching\.html?$/i, "");
  if (stripped && stripped !== last) return stripped;
  return null;
}

function extractGetbuttonId(url) {
  const canonical = canonicalContentUrl(url) || String(url || "");
  const watchId = extractEpisodeWatchId(canonical);
  if (watchId) return watchId;

  const patterns = [
    /\/movie\/[^/]+\/([^/?#]+)/i,
    /\/(?:tv-series|tv|serie|series)\/[^/]+\/[^/]+\/[^/]+\/([^/?#]+)/i,
    /\/(?:tv-series|tv|serie|series)\/[^/]+\/([^/?#]+)/i,
    /\/(?:episode|episodes)\/[^/]+\/([^/?#]+)/i
  ];

  for (const pattern of patterns) {
    const match = canonical.match(pattern);
    if (match?.[1] && !/^(season|episode|watch)/i.test(match[1])) {
      return match[1];
    }
  }

  const segments = canonical.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || "";
  if (last && !/\.html?$/i.test(last)) return last;
  return null;
}

function extractDownloadIds(url) {
  const canonical = canonicalContentUrl(url) || String(url || "");
  const ids = [];
  const seen = new Set();
  const add = (value) => {
    const id = String(value || "").trim();
    if (!id || seen.has(id) || /^(season|episode|watch)$/i.test(id)) return;
    seen.add(id);
    ids.push(id);
  };

  add(extractEpisodeWatchId(canonical));
  add(extractGetbuttonId(canonical));

  const movieMatch = canonical.match(/\/movie\/[^/]+\/([^/?#]+)/i);
  if (movieMatch?.[1]) add(movieMatch[1]);

  const seasonMatch = canonical.match(/\/(?:tv-series|tv|serie|series)\/[^/]+\/([^/?#]+)/i);
  if (seasonMatch?.[1]) add(seasonMatch[1]);

  return ids;
}

function isPlausibleDownloadId(value) {
  const id = String(value || "").trim();
  if (!id || id.length < 4 || id.length > 80) return false;
  if (/^(true|false|movie|html|json|http|https|season|episode|watch)$/i.test(id)) return false;
  return /^[A-Za-z0-9_-]+$/.test(id);
}

function extractPageDownloadIds(html) {
  const ids = [];
  const seen = new Set();
  const add = (value) => {
    if (!isPlausibleDownloadId(value) || seen.has(value)) return;
    seen.add(value);
    ids.push(value);
  };

  const text = String(html || "");
  const patterns = [
    /play_button[^>]*data-id=["']([^"']+)["']/gi,
    /data-id=["']([^"']+)["'][^>]*play_button/gi,
    /player_block_wrap[^>]*data-(?:id|mid)=["']([^"']+)["']/gi,
    /data-mid=["']([^"']+)["']/gi,
    /data-movie-id=["']([^"']+)["']/gi,
    /["']m_id["']\s*[:=]\s*["']([^"']+)["']/gi,
    /\/(?:getdownload|getbutton|getlink)\/([A-Za-z0-9_-]+)\//gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) add(match[1]);
  }
  return ids;
}

function mergeDownloadIds(...lists) {
  const ids = [];
  const seen = new Set();
  for (const list of lists) {
    for (const value of list || []) {
      if (!isPlausibleDownloadId(value) || seen.has(value)) continue;
      seen.add(value);
      ids.push(value);
    }
  }
  return ids;
}

function titleFromUrl(url, kind) {
  const movieMatch = String(url).match(/\/movie\/([^/]+)\//i);
  const tvMatch = String(url).match(/\/(?:tv-series|tv|serie|series)\/([^/]+)\//i);
  const slug = (movieMatch || tvMatch)?.[1];
  if (!slug) return kind === "tv" ? "TV Show" : "Movie";
  return slug
    .replace(/-season-\d{1,2}$/i, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function titleFromMovieUrl(url) {
  return titleFromUrl(url, "movie");
}

function isCatalogTvItem(item) {
  return item?.kind === "tv" || TV_PAGE_PATTERN.test(String(item?.movieUrl || ""));
}

function isTvShowPageUrl(url) {
  return TV_PAGE_PATTERN.test(String(url || ""));
}

function isWatchingEpisodeUrl(url) {
  return EPISODE_WATCHING_PATTERN.test(String(url || ""));
}

function isTvEpisodePageUrl(url) {
  const text = String(url || "");
  return /\/(?:episode|episodes)\//i.test(text) || isWatchingEpisodeUrl(text);
}

function episodeFileLabel(season, episode) {
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}

function safeShowFolderName(title) {
  return (
    String(title || "TV Show")
      .replace(/[<>:"/\\|?*]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "TV Show"
  );
}

function showBaseSlugFromUrl(url) {
  try {
    const pathname = new URL(String(url || "")).pathname;
    const match = pathname.match(/\/(?:tv-series|tv|serie|series|episode|episodes|watch)\/([^/]+)/i);
    if (!match) return null;
    return match[1].replace(/-season-\d{1,2}$/i, "") || null;
  } catch {
    const match = String(url || "").match(
      /\/(?:tv-series|tv|serie|series|episode|episodes|watch)\/([^/?#]+)/i
    );
    if (!match) return null;
    return match[1].replace(/-season-\d{1,2}$/i, "") || null;
  }
}

function seasonNumberFromUrl(url) {
  try {
    const pathname = new URL(String(url || "")).pathname;
    const match = pathname.match(/-season-(\d{1,2})(?:\/|$)/i);
    return match ? Number.parseInt(match[1], 10) || null : null;
  } catch {
    const match = String(url || "").match(/-season-(\d{1,2})(?:\/|$|\?|#)/i);
    return match ? Number.parseInt(match[1], 10) || null : null;
  }
}

function parseTornadoSeriesUrl(url, baseUrl = BASE_URL) {
  try {
    const parsed = new URL(String(url || ""), baseUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    if (!/^(?:tv-series|tv|serie|series|watch)$/i.test(parts[0])) return null;

    const slug = parts[1];
    const seasonMatch = slug.match(/^(.*)-season-(\d{1,2})$/i);
    const watchingPart = parts.find((part) => /-watching\.html?$/i.test(part)) || null;
    const seasonId = parts[2] && !/-watching\.html?$/i.test(parts[2]) ? parts[2] : null;

    return {
      origin: parsed.origin,
      prefix: parts[0],
      slug,
      baseSlug: seasonMatch ? seasonMatch[1] : slug,
      season: seasonMatch ? Number.parseInt(seasonMatch[2], 10) : null,
      seasonId,
      watchId: watchingPart ? watchingPart.replace(/-watching\.html?$/i, "") : null,
      isWatching: Boolean(watchingPart),
      href: parsed.toString().replace(/\/$/, "")
    };
  } catch {
    return null;
  }
}

function toSeasonHubUrl(url, baseUrl = BASE_URL) {
  try {
    const parsed = new URL(String(url || ""), baseUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    if (!/^(?:tv-series|tv|serie|series|watch)$/i.test(parts[0])) return null;
    if (/-watching\.html?$/i.test(parts[parts.length - 1])) parts.pop();
    if (parts.length >= 3) {
      return `${parsed.origin}/${parts.slice(0, 3).join("/")}`.replace(/\/$/, "");
    }
    if (parts.length === 2 && /-season-\d{1,2}$/i.test(parts[1])) {
      return `${parsed.origin}/${parts.join("/")}`.replace(/\/$/, "");
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeShowSlug(slug) {
  return String(slug || "")
    .toLowerCase()
    .replace(/-season-\d{1,2}$/i, "")
    .replace(/-(?:sub|dub)(?:-?[a-z]{2,10})?$/i, "")
    .trim();
}

function slugMatchesCurrentShow(hrefOrSlug, baseSlug) {
  const other = normalizeShowSlug(showBaseSlugFromUrl(hrefOrSlug) || hrefOrSlug);
  const base = normalizeShowSlug(baseSlug);
  if (!base || !other) return false;
  if (base === other) return true;
  const baseTokens = base.split("-").filter(Boolean);
  const canPrefix = baseTokens.length >= 2 || base.length >= 12;
  if (!canPrefix) return false;
  return other.startsWith(`${base}-`) || base.startsWith(`${other}-`);
}

function catalogCounts(movies = []) {
  const list = Array.isArray(movies) ? movies : [];
  return {
    total: list.length,
    movies: list.filter((item) => !isCatalogTvItem(item)).length,
    tv: list.filter((item) => isCatalogTvItem(item)).length
  };
}
  return { BASE_URL, decodeHtml, normalizeHref, classifyContentUrl, canonicalMoviePageUrl, canonicalContentUrl, normalizeMovieUrl, extractMovieIdFromUrl, extractEpisodeWatchId, extractDownloadIds, extractPageDownloadIds, mergeDownloadIds, titleFromUrl, titleFromMovieUrl, isCatalogTvItem, isTvShowPageUrl, isWatchingEpisodeUrl, episodeFileLabel, safeShowFolderName, showBaseSlugFromUrl, seasonNumberFromUrl, parseTornadoSeriesUrl, toSeasonHubUrl, slugMatchesCurrentShow, catalogCounts };
})();

const { fileNameFromLink, episodeFileName, movieOutputPath, episodeOutputPath } = (() => {
function fileNameFromLink(url, title) {
  try {
    const name = new URL(url).searchParams.get("name");
    if (name) {
      const base = path.basename(name, path.extname(name));
      return `${base.replace(/[<>:"/\\|?*]+/g, "_")}.mp4`;
    }
  } catch {
    // fall through
  }
  const slug = String(title || "movie")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${slug || "movie"}.mp4`;
}

function episodeFileName(season, episode, episodeTitle) {
  const label = episodeFileLabel(season, episode || 1);
  const title = String(episodeTitle || "Episode").replace(/[<>:"/\\|?*]+/g, "_");
  return `${label} - ${title}.mp4`;
}

function movieOutputPath(videoRoot, fileName) {
  return path.join(videoRoot, fileName);
}

function episodeOutputPath(videoRoot, item = {}) {
  const showTitle = safeShowFolderName(item.showTitle || "TV Show");
  const season = Number(item.season) || 1;
  const seasonLabel = `Season ${String(season).padStart(2, "0")}`;
  const fileName = episodeFileName(season, item.episode, item.episodeTitle || item.title);
  return path.join(videoRoot, "TV Shows", showTitle, seasonLabel, fileName);
}
  return { fileNameFromLink, episodeFileName, movieOutputPath, episodeOutputPath };
})();

const { parseSearchResults, parseSearchHtml } = (() => {
function cleanTitle(value) {
  return decodeHtml(value)
    .replace(/\s+/g, " ")
    .replace(/^watch\s+/i, "")
    .replace(/\s+online\b.*$/i, "")
    .replace(/\s+in\s+hd\b.*$/i, "")
    .replace(/\s+[|–]\s+.*$/i, "")
    .replace(/\s+-\s+.*$/i, "")
    .trim();
}

function yearFromText(text) {
  const match = String(text || "").match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

function resolveUrl(raw, baseUrl) {
  if (!raw || String(raw).startsWith("data:")) return "";
  try {
    return new URL(decodeHtml(raw), baseUrl).href;
  } catch {
    return "";
  }
}

function pickPosterFromSnippet(snippet, baseUrl) {
  const dataImg = snippet.match(/data-img=["']([^"']+)["']/i)?.[1] || "";
  if (dataImg) return resolveUrl(dataImg, baseUrl);
  const src =
    snippet.match(
      /(?:src|data-src|data-original|data-lazy-src)=["'](https?:[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
    )?.[1] ||
    snippet.match(/(?:src|data-src|data-original|data-lazy-src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i)?.[1] ||
    "";
  return resolveUrl(src, baseUrl);
}

function nextBoundary(html, from) {
  const needles = ["\nhref=", " href=", "data-href=", "data-name="];
  let closest = html.length;
  for (const needle of needles) {
    const at = html.indexOf(needle, from);
    if (at >= 0 && at < closest) closest = at;
  }
  return closest;
}

function considerCandidate(found, rawHref, html, matchIndex, baseUrl) {
  const classified = classifyContentUrl(rawHref, baseUrl);
  if (!classified?.canonical) return;

  const href = classified.canonical;
  const kind = classified.kind;
  if (kind === "movie" && !/\/movie\/[^/]+\/[^/?#]+/i.test(href)) return;
  if (kind === "tv" && !/\/(?:tv-series|tv|serie|series)\/[^/]+\/[^/?#]+/i.test(href)) return;

  const prevHref = Math.max(html.lastIndexOf("href=", matchIndex - 1), html.lastIndexOf("data-href=", matchIndex - 1));
  const afterStart = matchIndex + String(rawHref).length;
  const cardEnd = Math.min(html.length, nextBoundary(html, afterStart + 1), afterStart + 280);
  const after = html.slice(matchIndex, cardEnd);

  const dataNamePos = html.lastIndexOf("data-name=", matchIndex);
  const dataName =
    dataNamePos > prevHref
      ? cleanTitle(html.slice(dataNamePos, matchIndex).match(/data-name=["']([^"']+)["']/i)?.[1] || "")
      : "";
  const dataImgPos = html.lastIndexOf("data-img=", matchIndex);
  const dataImg =
    dataImgPos > prevHref
      ? html.slice(dataImgPos, matchIndex).match(/data-img=["']([^"']+)["']/i)?.[1] || ""
      : "";
  const titleAttr = cleanTitle(after.match(/\btitle=["']([^"']+)["']/i)?.[1] || "");
  const ariaLabel = cleanTitle(after.match(/aria-label=["']([^"']+)["']/i)?.[1] || "");
  const imgAlt = cleanTitle(after.match(/\balt=["']([^"']+)["']/i)?.[1] || "");
  const fallbackTitle = titleFromUrl(href, kind);
  const title =
    (dataName && dataName.length < 120 ? dataName : "") ||
    (titleAttr && titleAttr.length < 100 ? titleAttr : "") ||
    (ariaLabel && ariaLabel.length < 100 ? ariaLabel : "") ||
    (imgAlt && imgAlt.length < 100 ? imgAlt : "") ||
    fallbackTitle;
  const posterUrl = resolveUrl(dataImg, baseUrl) || pickPosterFromSnippet(after, baseUrl);
  const year =
    yearFromText(dataName) || yearFromText(titleAttr) || yearFromText(imgAlt) || yearFromText(after);

  const existing = found.get(href);
  if (!existing) {
    found.set(href, {
      kind,
      movieUrl: href,
      title,
      posterUrl: posterUrl || undefined,
      year: year || undefined
    });
    return;
  }

  if ((!existing.posterUrl || existing.posterUrl.length < 8) && posterUrl) {
    existing.posterUrl = posterUrl;
  }
  if ((!existing.title || existing.title === fallbackTitle) && title && title !== fallbackTitle) {
    existing.title = title;
  }
  if (!existing.year && year) existing.year = year;
  if (!existing.kind) existing.kind = kind;
}

function diagnoseSearchHtml(html) {
  const text = String(html || "");
  if (!text.trim()) return "Search returned an empty page from Tornado.";
  if (text.charCodeAt(0) === 0x1f || text.startsWith("\u001f\u008b")) {
    return "Search body was gzip-compressed. The NAS Chrome TLS client must send --compressed.";
  }
  if (/just a moment|cf-browser-verification|challenge-platform|attention required/i.test(text)) {
    return "Cloudflare challenged the search request. Confirm host networking and Chrome TLS, then try again.";
  }
  const hasTitles = /\/(?:movie|tv-series|tv|serie|series)\//i.test(text);
  if (!hasTitles && /premiummembership|user\/login|recaptcha/i.test(text)) {
    return "Tornado search needs a signed-in session. Paste _identity-frontend1 and advanced-frontend on CinaRip Search, then search again.";
  }
  return "";
}

function collectRawHrefs(html) {
  const text = String(html || "").replace(/\\\//g, "/");
  const hrefs = [];
  const patterns = [
    /(?:href|data-href|data-url)\s*=\s*["']([^"']+)["']/gi,
    /(?:href|data-href|data-url)\s*=\s*([^\s>]+)/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      hrefs.push({ raw: decodeHtml(match[1]).replace(/^["']|["']$/g, ""), index: match.index, source: text });
    }
  }
  return hrefs;
}

function parseSearchResults(html, baseUrl = BASE_URL) {
  const found = new Map();
  const hrefs = collectRawHrefs(html);
  for (const entry of hrefs) {
    if (!/\/(?:movie|tv-series|tv|serie|series)\//i.test(entry.raw)) continue;
    considerCandidate(found, entry.raw, entry.source, entry.index, baseUrl);
  }

  const movies = [...found.values()];
  return {
    ok: true,
    movies,
    counts: catalogCounts(movies),
    warning: movies.length ? "" : diagnoseSearchHtml(html)
  };
}

function parseSearchHtml(html, baseUrl = BASE_URL) {
  return parseSearchResults(html, baseUrl).movies;
}
  return { parseSearchResults, parseSearchHtml };
})();

const { parseTvShowPage, buildTvShowPlan, extractPosterUrl, readShowMeta, dedupeEpisodes, normalizeEpisodeNumbers, guessSeasonHubUrls, guessShowHubUrls, mergeSeasonLists } = (() => {
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
  return { parseTvShowPage, buildTvShowPlan, extractPosterUrl, readShowMeta, dedupeEpisodes, normalizeEpisodeNumbers, guessSeasonHubUrls, guessShowHubUrls, mergeSeasonLists };
})();

const { DownloadQueue } = (() => {
function normalizePageUrl(url) {
  return canonicalContentUrl(url) || normalizeMovieUrl(url) || String(url || "").trim();
}

const ACTIVE_EPISODE_STATUSES = new Set(["pending", "loading", "downloading"]);

function episodeQueueKey(showTitle, season, episode) {
  const show = String(showTitle || "")
    .trim()
    .toLowerCase();
  const episodeNumber = Number(episode) || 0;
  if (!show || episodeNumber < 1) return "";
  return `${show}::s${Number(season) || 1}e${episodeNumber}`;
}

function episodeAlreadyQueued(items, { pageUrl, showTitle, season, episode }) {
  const key = episodeQueueKey(showTitle, season, episode);
  return (Array.isArray(items) ? items : []).some((item) => {
    if (item.kind !== "episode" || !ACTIVE_EPISODE_STATUSES.has(item.status)) return false;
    if (pageUrl && item.movieUrl === pageUrl) return true;
    if (key && episodeQueueKey(item.showTitle, item.season, item.episode) === key) return true;
    return false;
  });
}

function sanitizeQueueItem(raw = {}) {
  const kind = raw.kind === "episode" ? "episode" : "movie";
  const movieUrl =
    kind === "episode" ? normalizePageUrl(raw.movieUrl || raw.url || "") : normalizeMovieUrl(raw.movieUrl || "");
  if (!movieUrl) return null;

  const status = ["pending", "loading", "downloading", "done", "failed"].includes(raw.status)
    ? raw.status
    : "pending";

  const item = {
    id: String(raw.id || `q-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
    kind,
    title: String(raw.title || (kind === "episode" ? "Episode" : titleFromMovieUrl(movieUrl))).trim() || "Queued item",
    movieUrl,
    destination: "nas",
    status,
    error: raw.error ? String(raw.error) : null,
    passRetries: Number(raw.passRetries) || 0,
    addedAt: Number(raw.addedAt) || Date.now(),
    progress: Number(raw.progress) || 0,
    qualityLabel: raw.qualityLabel ? String(raw.qualityLabel) : "",
    posterUrl: raw.posterUrl || null
  };

  if (kind === "episode") {
    item.showTitle = String(raw.showTitle || "TV Show").trim() || "TV Show";
    item.season = Number(raw.season) || 1;
    item.episode = Number(raw.episode) || 0;
    item.episodeTitle = String(raw.episodeTitle || "Episode").trim() || "Episode";
  }

  return item;
}

class DownloadQueue {
  constructor() {
    this.items = [];
    this.running = false;
    this.cancelRequested = false;
    this.currentId = null;
  }

  list() {
    return this.items.map((item) => ({ ...item }));
  }

  snapshot() {
    const pending = this.items.filter((item) => item.status === "pending").length;
    const done = this.items.filter((item) => item.status === "done").length;
    const failed = this.items.filter((item) => item.status === "failed").length;
    const movies = this.items.filter((item) => item.kind !== "episode").length;
    const episodes = this.items.filter((item) => item.kind === "episode").length;

    return {
      running: this.running,
      cancelRequested: this.cancelRequested,
      currentId: this.currentId,
      items: this.list(),
      counts: {
        total: this.items.length,
        pending,
        done,
        failed,
        movies,
        episodes
      }
    };
  }

  add(movieUrl, options = {}) {
    const normalizedUrl = normalizeMovieUrl(movieUrl);
    if (!/\/movie\/[^/]+\/[^/?#]+/i.test(normalizedUrl)) {
      return {
        ok: false,
        error: "Not a valid movie page URL. Use a full link like /movie/title/movieId."
      };
    }

    if (this.items.some((item) => item.kind !== "episode" && item.movieUrl === normalizedUrl && item.status === "pending")) {
      return { ok: false, error: "Movie is already in the queue." };
    }

    const item = {
      id: `q-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      kind: "movie",
      title: options.title || titleFromMovieUrl(normalizedUrl),
      movieUrl: normalizedUrl,
      destination: "nas",
      status: "pending",
      error: null,
      passRetries: 0,
      addedAt: Date.now(),
      progress: 0,
      qualityLabel: "",
      posterUrl: options.posterUrl || null
    };

    this.items.push(item);
    return { ok: true, item };
  }

  addEpisode(episode = {}, options = {}) {
    const pageUrl = normalizePageUrl(episode.url || episode.movieUrl || "");
    if (!pageUrl) {
      return { ok: false, error: "Episode is missing a URL." };
    }

    const season = Number(episode.season) || 1;
    const episodeNumber = Number(episode.episode) || 0;
    const showTitle = String(options.showTitle || episode.showTitle || "TV Show").trim() || "TV Show";
    const label = episodeFileLabel(season, episodeNumber || 1);
    const episodeTitle = String(episode.title || episode.episodeTitle || "Episode").trim() || "Episode";
    const title = `${showTitle} · ${label} · ${episodeTitle}`;

    if (episodeAlreadyQueued(this.items, { pageUrl, showTitle, season, episode: episodeNumber })) {
      return { ok: false, error: "Episode is already in the queue." };
    }

    const item = {
      id: `q-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      kind: "episode",
      title,
      movieUrl: pageUrl,
      showTitle,
      season,
      episode: episodeNumber,
      episodeTitle,
      posterUrl: options.posterUrl || episode.posterUrl || null,
      destination: "nas",
      status: "pending",
      error: null,
      passRetries: 0,
      addedAt: Date.now(),
      progress: 0,
      qualityLabel: ""
    };

    this.items.push(item);
    return { ok: true, item };
  }

  addEpisodes(episodes = [], options = {}) {
    const added = [];
    const skipped = [];

    for (const episode of episodes) {
      const result = this.addEpisode(episode, options);
      if (result.ok) added.push(result.item);
      else skipped.push({ url: episode?.url || episode?.movieUrl, error: result.error });
    }

    return { ok: true, added, skipped };
  }

  addMany(entries = []) {
    const added = [];
    const skipped = [];

    for (const entry of entries) {
      const movieUrl = typeof entry === "string" ? entry : entry?.movieUrl;
      const title = typeof entry === "object" ? entry?.title : null;
      const posterUrl = typeof entry === "object" ? entry?.posterUrl : null;
      const result = this.add(movieUrl, { title, posterUrl });
      if (result.ok) added.push(result.item);
      else skipped.push({ movieUrl, error: result.error });
    }

    return { ok: true, added, skipped };
  }

  remove(id) {
    if (this.running && this.currentId === id) {
      return { ok: false, error: "Cannot remove the item that is downloading." };
    }

    const before = this.items.length;
    this.items = this.items.filter((item) => item.id !== id);
    return { ok: true, removed: before - this.items.length };
  }

  clear() {
    if (this.running) {
      return { ok: false, error: "Stop the queue before clearing it." };
    }

    this.items = [];
    this.currentId = null;
    this.cancelRequested = false;
    return { ok: true };
  }

  hasWork() {
    return this.items.some((item) => item.status === "pending" || item.status === "failed");
  }

  reviveFailed() {
    let count = 0;
    for (const item of this.items) {
      if (item.status !== "failed") continue;
      item.status = "pending";
      item.error = null;
      item.passRetries = 0;
      item.progress = 0;
      count += 1;
    }
    return count;
  }

  requeueFailed() {
    let count = 0;
    for (const item of this.items) {
      if (item.status !== "failed") continue;
      if ((item.passRetries || 0) >= 1) continue;
      item.passRetries = (item.passRetries || 0) + 1;
      item.status = "pending";
      item.error = null;
      item.progress = 0;
      count += 1;
    }
    if (count) this.currentId = null;
    return count;
  }

  beginRun() {
    if (this.running) {
      return { ok: false, error: "Queue is already running." };
    }

    this.reviveFailed();

    const pending = this.items.filter((item) => item.status === "pending");
    if (!pending.length) {
      return { ok: false, error: "Queue is empty." };
    }

    this.running = true;
    this.cancelRequested = false;
    this.currentId = null;
    return { ok: true, pending: pending.length };
  }

  requestCancel() {
    this.cancelRequested = true;
    return { ok: true };
  }

  finishRun() {
    this.running = false;
    this.currentId = null;
    this.cancelRequested = false;
  }

  setCurrent(id) {
    this.currentId = id;
    const item = this.items.find((entry) => entry.id === id);
    if (item) item.status = "loading";
  }

  markDownloading(id) {
    const item = this.items.find((entry) => entry.id === id);
    if (item) item.status = "downloading";
  }

  patch(id, fields = {}) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) return null;
    Object.assign(item, fields);
    return item;
  }

  markDone(id) {
    const item = this.items.find((entry) => entry.id === id);
    if (item) {
      item.status = "done";
      item.error = null;
      item.progress = 100;
    }
    if (this.currentId === id) this.currentId = null;
  }

  markFailed(id, error) {
    const item = this.items.find((entry) => entry.id === id);
    if (item) {
      item.status = "failed";
      item.error = error || "Download failed";
    }
    if (this.currentId === id) this.currentId = null;
  }

  markSkipped(id, reason) {
    const item = this.items.find((entry) => entry.id === id);
    if (item) {
      item.status = "failed";
      item.error = reason || "Skipped";
    }
    if (this.currentId === id) this.currentId = null;
  }

  nextPending() {
    return this.items.find((item) => item.status === "pending") || null;
  }

  persistableItems() {
    return this.items.map((item) => ({ ...item }));
  }

  restore(rawItems = []) {
    this.running = false;
    this.cancelRequested = false;
    this.currentId = null;
    this.items = [];

    let interrupted = 0;
    const seen = new Set();

    for (const raw of Array.isArray(rawItems) ? rawItems : []) {
      const item = sanitizeQueueItem(raw);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);

      if (item.status === "loading" || item.status === "downloading") {
        item.status = "pending";
        item.error = null;
        item.progress = 0;
        interrupted += 1;
      }

      this.items.push(item);
    }

    return {
      ok: true,
      restored: this.items.length,
      interrupted
    };
  }
}
  return { DownloadQueue };
})();

const { loadQueueState, saveQueueState, defaultStorePath } = (() => {
const STORE_VERSION = 1;

function defaultStorePath() {
  return path.join(process.env.DATA_ROOT || "/data/app", "download-queue.json");
}

function atomicWriteJson(filePath, value) {
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;

  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(tempPath, payload, "utf8");
  try {
    fs.renameSync(tempPath, filePath);
  } catch {
    fs.copyFileSync(tempPath, filePath);
    fs.unlinkSync(tempPath);
  }
}

function loadQueueState(filePath = defaultStorePath()) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const items = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
    return {
      ok: true,
      version: Number(raw?.version) || STORE_VERSION,
      savedAt: Number(raw?.savedAt) || 0,
      items
    };
  } catch {
    return { ok: true, version: STORE_VERSION, savedAt: 0, items: [] };
  }
}

function saveQueueState(items = [], filePath = defaultStorePath()) {
  atomicWriteJson(filePath, {
    version: STORE_VERSION,
    savedAt: Date.now(),
    items: Array.isArray(items) ? items : []
  });
  return { ok: true, path: filePath, count: Array.isArray(items) ? items.length : 0 };
}
  return { loadQueueState, saveQueueState, defaultStorePath };
})();

const { downloadHttpFile } = (() => {
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function isLoadshareHostname(hostname) {
  return /(?:^|\.)loadshare\.(?:org|net)$/i.test(String(hostname || ""));
}

function downloadSocketOptions(urlOrParsed) {
  let hostname = "";
  try {
    hostname =
      typeof urlOrParsed === "string"
        ? new URL(urlOrParsed).hostname
        : String(urlOrParsed?.hostname || "");
  } catch {
    hostname = "";
  }
  if (/ip6/i.test(hostname)) {
    return { family: 6 };
  }
  if (isLoadshareHostname(hostname)) {
    return { autoSelectFamily: true };
  }
  return {};
}

function headersToNet(headers = []) {
  const result = {};
  for (const header of headers) {
    if (!header?.name || header?.value == null) continue;
    result[header.name] = header.value;
  }
  if (!result["User-Agent"] && !result["user-agent"]) {
    result["User-Agent"] = DEFAULT_USER_AGENT;
  }
  if (!result.Accept) {
    result.Accept = "*/*";
  }
  if (!result.Connection) {
    result.Connection = "keep-alive";
  }
  return result;
}

function existingBytes(outputPath) {
  try {
    return fs.statSync(outputPath).size;
  } catch {
    return 0;
  }
}

function parseContentLength(response) {
  const raw = response.headers["content-length"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(String(value || "0"), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseTotalFromContentRange(response) {
  const raw = response.headers["content-range"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = String(value || "").match(/\/(\d+)\s*$/);
  if (!match) return 0;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function friendlyDownloadError(error) {
  const message = String(error?.message || error || "Direct download failed");
  if (/ERR_BLOCKED_BY_CLIENT/i.test(message)) {
    return new Error(
      "Download was blocked by the ad blocker. Restart the download — this should now use a direct connection."
    );
  }
  if (/^aborted$/i.test(message.trim())) {
    return new Error(
      "Download connection was interrupted. Click Download on the movie page again to get a fresh link, then retry."
    );
  }
  if (/ECONNRESET|ETIMEDOUT|EPIPE/i.test(message)) {
    return new Error(
      "Download connection dropped too many times. Get a fresh link from the movie page and try again."
    );
  }
  return error instanceof Error ? error : new Error(message);
}

function requestOnce({
  currentUrl,
  outputPath,
  headers,
  logStream,
  onProgress,
  abortRef,
  redirectCount,
  maxRedirects,
  startByte = 0
}) {
  return new Promise((resolve, reject) => {
    if (redirectCount > maxRedirects) {
      reject(new Error("Direct download failed: too many redirects."));
      return;
    }

    let parsed;
    try {
      parsed = new URL(currentUrl);
    } catch {
      reject(new Error(`Invalid download URL: ${currentUrl}`));
      return;
    }

    const transport = parsed.protocol === "https:" ? https : http;
    const headerObj = headersToNet(headers);
    if (startByte > 0) {
      headerObj.Range = `bytes=${startByte}-`;
      if (logStream) {
        logStream.write(`Resume from byte ${startByte}\n`);
      }
      if (typeof onProgress === "function") {
        onProgress({ downloadedBytes: startByte, totalBytes: 0, resuming: true, resumeFrom: startByte });
      }
    }

    const request = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers: headerObj,
        timeout: 0,
        ...downloadSocketOptions(parsed)
      },
      (response) => {
        const status = response.statusCode || 0;
        if (logStream) {
          logStream.write(`HTTP ${status} ${currentUrl}\n`);
        }

        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = response.headers.location;
          if (!location) {
            reject(new Error(`Direct download failed (HTTP ${status} redirect without location).`));
            return;
          }

          const nextUrl = new URL(location, currentUrl).toString();
          response.resume();
          requestOnce({
            currentUrl: nextUrl,
            outputPath,
            headers,
            logStream,
            onProgress,
            abortRef,
            redirectCount: redirectCount + 1,
            maxRedirects,
            startByte
          })
            .then(resolve)
            .catch(reject);
          return;
        }

        if (status === 416) {
          const size = existingBytes(outputPath);
          if (size > 0) {
            resolve({ downloadedBytes: size, totalBytes: size, outputPath });
            return;
          }
          reject(new Error("Direct download failed (HTTP 416). The link may have expired."));
          return;
        }

        const isResume = startByte > 0 && status === 206;
        const isFresh = startByte === 0 && status === 200;

        if (startByte > 0 && status === 200) {
          try {
            fs.unlinkSync(outputPath);
          } catch {
            // Best effort reset when server ignores Range.
          }
          response.resume();
          requestOnce({
            currentUrl,
            outputPath,
            headers,
            logStream,
            onProgress,
            abortRef,
            redirectCount,
            maxRedirects,
            startByte: 0
          })
            .then(resolve)
            .catch(reject);
          return;
        }

        if (!isResume && !isFresh) {
          reject(
            new Error(
              `Direct download failed (HTTP ${status}). The link may have expired — open the movie and click Download on the site again.`
            )
          );
          return;
        }

        const totalBytes =
          parseTotalFromContentRange(response) ||
          (isFresh ? startByte + parseContentLength(response) : 0);
        let sessionBytes = 0;

        const fileStream = fs.createWriteStream(outputPath, {
          flags: startByte > 0 ? "a" : "w"
        });
        const progressStream = new Transform({
          transform(chunk, _encoding, callback) {
            sessionBytes += chunk.length;
            const downloadedBytes = startByte + sessionBytes;
            if (typeof onProgress === "function") {
              onProgress({ downloadedBytes, totalBytes, resuming: startByte > 0, resumeFrom: startByte });
            }
            callback(null, chunk);
          }
        });

        pipeline(response, progressStream, fileStream)
          .then(() => {
            const downloadedBytes = startByte + sessionBytes;
            if (logStream) {
              logStream.write(`Downloaded ${downloadedBytes} bytes\n`);
            }
            resolve({ downloadedBytes, totalBytes, outputPath });
          })
          .catch(reject);
      }
    );

    request.on("socket", (socket) => {
      socket.setKeepAlive(true, 30_000);
      socket.setTimeout(0);
    });

    if (abortRef) {
      abortRef.current = () => {
        try {
          request.destroy();
        } catch {
          // Best effort abort.
        }
      };
    }

    request.on("error", reject);
    request.end();
  });
}

async function downloadHttpFile({
  url,
  outputPath,
  headers = [],
  logPath = null,
  onProgress = null,
  abortRef = null,
  maxRedirects = 8,
  maxAttempts = 25
}) {
  const logStream = logPath ? fs.createWriteStream(logPath, { flags: "w" }) : null;
  if (logStream) {
    logStream.write(`GET ${url}\n`);
  }

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startByte = existingBytes(outputPath);

    if (logStream && attempt > 1) {
      logStream.write(`\n--- Resume attempt ${attempt}/${maxAttempts} from ${startByte} bytes ---\n`);
    }

    try {
      const result = await requestOnce({
        currentUrl: url,
        outputPath,
        headers,
        logStream,
        onProgress,
        abortRef,
        redirectCount: 0,
        maxRedirects,
        startByte
      });

      if (logStream) logStream.end();
      return result;
    } catch (error) {
      lastError = error;
      if (logStream) {
        logStream.write(`\n${error.message || error}\n`);
      }

      const message = String(error?.message || error);
      const retryable = /aborted|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up/i.test(message);
      const partialBytes = existingBytes(outputPath);

      if (!retryable || attempt >= maxAttempts || partialBytes === 0) {
        if (logStream) logStream.end();
        throw friendlyDownloadError(lastError);
      }

      if (typeof onProgress === "function") {
        onProgress({
          downloadedBytes: partialBytes,
          totalBytes: 0,
          resuming: true,
          resumeFrom: partialBytes
        });
      }

      await new Promise((resolve) => setTimeout(resolve, Math.min(5000, 1000 * attempt)));
    }
  }

  if (logStream) logStream.end();
  throw friendlyDownloadError(lastError || new Error("Direct download failed."));
}
  return { downloadHttpFile };
})();

const { findImpersonateBin, missingTlsMessage } = (() => {
const DEFAULT_DIRS = ["/opt/curl-impersonate-host", "/opt/curl-impersonate"];

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function listImpersonateFiles(dir, readDir, isFileFn) {
  try {
    return readDir(dir)
      .filter((name) => /^(curl-impersonate|curl_chrome)/i.test(name))
      .map((name) => path.join(dir, name))
      .filter((file) => isFileFn(file));
  } catch {
    return [];
  }
}

function pickPreferred(files) {
  return (
    files.find((file) => /curl-impersonate$/i.test(file)) ||
    files.find((file) => /chrome131/i.test(file)) ||
    files[0] ||
    ""
  );
}

function findImpersonateBin(options = {}) {
  const env = options.env || process.env;
  const isFileFn = options.isFile || isFile;
  const readDir = options.readDir || ((dir) => fs.readdirSync(dir));
  const dirs = options.dirs || DEFAULT_DIRS;

  const named = [
    env.CURL_IMPERSONATE_BIN,
    ...dirs.flatMap((dir) => [path.join(dir, "curl-impersonate"), path.join(dir, "curl_chrome131")]),
    "/usr/local/bin/curl_chrome131"
  ].filter(Boolean);

  const fromNamed = named.find((file) => isFileFn(file));
  if (fromNamed) return fromNamed;

  for (const dir of dirs) {
    const preferred = pickPreferred(listImpersonateFiles(dir, readDir, isFileFn));
    if (preferred) return preferred;
  }
  return "";
}

function missingTlsMessage() {
  return (
    "Chrome TLS (curl-impersonate) is missing. An empty curl-bin folder was covering the image binary. " +
    "Copy docker-compose.yml, then on the NAS run: sudo docker compose up -d --build"
  );
}
  return { findImpersonateBin, missingTlsMessage };
})();

const { requireRecaptcha, isVerificationError, parseCsrfFromHtml, isDownloadLoginWall, downloadLoginWallMessage, hasIdentityCookie, evaluateSessionStatus } = (() => {
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
  return { requireRecaptcha, isVerificationError, parseCsrfFromHtml, isDownloadLoginWall, downloadLoginWallMessage, hasIdentityCookie, evaluateSessionStatus };
})();

const { TornadoClient } = (() => {
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const API_PATHS = ["getdownload", "getbutton", "getlink"];
const API_TYPES = ["true", "movie", "1", "0"];
const EFFECTIVE_MARK = "__CINARIP_EFFECTIVE__:";
const ACCEPT_JSON = "application/json, text/javascript, */*;q=0.01";
const ACCEPT_HTML = "text/html, */*;q=0.01";
const LINK_PATTERN =
  /(?:https?:)?\/\/(?:[a-z0-9-]+\.)*loadshare\.(?:org|net)\/(?:download|d|file)\/[^\s"'<>\\]+/gi;
const ATTR_LINK_PATTERN =
  /(href|src|action|content|data-href|data-url|data-src|data-file|data-link|data-download)\s*=\s*(["'])([\s\S]*?)\2/gi;
const LOADSHARE_PATH = /loadshare\.(?:org|net)\/(?:download|d|file)\//i;
const LOADSHARE_HOST_RE = /(?:[a-z0-9-]+\.)*loadshare\.(?:org|net)/gi;
const JSON_LINK_KEYS = /^(?:src|file|link|url|download|location|href|source|path)$/i;

function cookiePath() {
  return path.join(process.env.DATA_ROOT || "/data/app", "tornado-cookies.json");
}

function cookieJarPath() {
  return "/tmp/tornado-cookiejar.txt";
}

function impersonateBin() {
  return findImpersonateBin();
}

function curlChildEnv() {
  const env = { ...process.env, HOME: "/tmp" };
  env.CURL_IMPERSONATE = "chrome131";
  return env;
}

function runCurlOnce(bin, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], env: curlChildEnv() });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, timeoutMs + 2000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, error: error.message, stdout: "", stderr: "" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        stdout: stdout.slice(0, 800),
        stderr: stderr.slice(0, 400)
      });
    });
  });
}

function pickHeader(headers, name) {
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === String(name || "").toLowerCase()) return value;
  }
  return "";
}

function chrome131Args(overrides = {}) {
  const accept =
    overrides.accept ||
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  return [
    "--ciphers",
    "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-RSA-AES128-SHA:ECDHE-RSA-AES256-SHA:AES128-GCM-SHA256:AES256-GCM-SHA384:AES128-SHA:AES256-SHA",
    "--curves",
    "X25519:P-256:P-384",
    "-H",
    'sec-ch-ua: "Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "-H",
    "sec-ch-ua-mobile: ?0",
    "-H",
    'sec-ch-ua-platform: "Windows"',
    "-H",
    "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "-H",
    `Accept: ${accept}`,
    "-H",
    "Accept-Language: en-US,en;q=0.9",
    "--http1.1",
    "--tlsv1.2",
    "--tls-grease",
    "--compressed"
  ];
}

function writeCurlJar(jar) {
  const lines = ["# Netscape HTTP Cookie File"];
  for (const [name, value] of Object.entries(jar || {})) {
    if (!name || value == null) continue;
    lines.push(`.tornadomovies.co\tTRUE\t/\tTRUE\t1999999999\t${name}\t${value}`);
  }
  fs.mkdirSync(path.dirname(cookieJarPath()), { recursive: true });
  fs.writeFileSync(cookieJarPath(), `${lines.join("\n")}\n`);
}

function readCurlJar() {
  const jar = {};
  try {
    const text = fs.readFileSync(cookieJarPath(), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const parts = line.split("\t");
      if (parts.length < 7) continue;
      const name = parts[5];
      const value = parts.slice(6).join("\t");
      if (name) jar[name] = value;
    }
  } catch {
    // jar not written yet
  }
  return jar;
}

function parseHeaderDump(raw) {
  const blocks = String(raw || "").trim().split(/\r?\n\r?\n/);
  const last = blocks[blocks.length - 1] || "";
  const lines = last.split(/\r?\n/);
  const statusLine = lines.find((line) => /^HTTP\//i.test(line)) || "";
  const status = Number((statusLine.match(/\s(\d{3})\s/) || [])[1] || 0);
  const headers = {};
  const setCookie = [];
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx < 1) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (name === "set-cookie") setCookie.push(value);
    else headers[name] = value;
  }
  return { status, headers, setCookie };
}

function collectLocationHeaders(raw) {
  const locations = [];
  const seen = new Set();
  const add = (value) => {
    const text = String(value || "").trim().replace(/^["']|["']$/g, "");
    if (!text || seen.has(text)) return;
    seen.add(text);
    locations.push(text);
  };
  for (const match of String(raw || "").matchAll(/^(?:Location|X-Redirect|X-Location|Content-Location):\s*(.+)$/gim)) {
    add(match[1]);
  }
  for (const match of String(raw || "").matchAll(/^Refresh:\s*(.+)$/gim)) {
    const value = String(match[1] || "").trim();
    const urlMatch = value.match(/url\s*=\s*([^\s;]+)/i);
    add(urlMatch ? urlMatch[1] : value);
  }
  return locations;
}

function splitHeadersAndBody(raw) {
  let text = String(raw || "").replace(/\r\n/g, "\n");
  let effectiveUrl = "";
  const markAt = text.lastIndexOf(EFFECTIVE_MARK);
  if (markAt >= 0) {
    const after = text.slice(markAt + EFFECTIVE_MARK.length);
    const nl = after.indexOf("\n");
    effectiveUrl = (nl >= 0 ? after.slice(0, nl) : after).trim();
    text = text.slice(0, markAt).replace(/\n+$/, "");
  }
  const locations = collectLocationHeaders(text);
  const matches = [...text.matchAll(/^HTTP\/\d/gm)];
  const start = matches.length ? matches[matches.length - 1].index : 0;
  const rest = text.slice(start);
  const blank = rest.indexOf("\n\n");
  if (blank < 0) return { headerDump: rest, body: "", effectiveUrl, locations };
  return {
    headerDump: rest.slice(0, blank),
    body: rest.slice(blank + 2),
    effectiveUrl,
    locations
  };
}

function runChromeCurl({
  url,
  method = "GET",
  headers = {},
  body = "",
  follow = true,
  cookieJar = "",
  ipv4
} = {}) {
  const bin = impersonateBin();
  if (!bin) {
    return Promise.reject(
      new Error(
        missingTlsMessage()
      )
    );
  }

  const callerAccept = pickHeader(headers, "Accept");
  const args = [...chrome131Args({ accept: callerAccept || undefined })];
  const forceIpv4 = ipv4 === true || (ipv4 !== false && shouldForceIpv4(url));
  const forceIpv6 = !forceIpv4 && prefersIpv6(url);
  if (forceIpv4) args.push("-4");
  else if (forceIpv6) args.push("-6");
  args.push("-sS", "--max-time", "45", "-i", "--max-redirs", "8");
  args.push("-w", `\n${EFFECTIVE_MARK}%{url_effective}`);
  if (cookieJar) {
    args.push("-b", cookieJar, "-c", cookieJar);
  }
  if (follow) args.push("-L");
  if (method && method !== "GET") args.push("-X", method);

  for (const [name, value] of Object.entries(headers)) {
    if (!name || value == null) continue;
    if (/^(user-agent|accept-encoding)$/i.test(name)) continue;
    if (/^accept$/i.test(name)) continue;
    args.push("-H", `${name}: ${value}`);
  }

  if (body) args.push("--data-binary", "@-");
  args.push(url);

  const stdin = body ? "pipe" : "ignore";
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: [stdin, "pipe", "pipe"],
      env: curlChildEnv()
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new Error(error.message || "Could not start Chrome TLS client"));
    });
    child.on("close", (code) => {
      const { headerDump, body: responseBody, effectiveUrl, locations } = splitHeadersAndBody(stdout);
      const parsed = parseHeaderDump(headerDump);
      const payload = {
        status: parsed.status || 0,
        body: responseBody,
        headers: parsed.headers,
        setCookie: parsed.setCookie,
        effectiveUrl: effectiveUrl || "",
        locations: locations || [],
        forcedIpv4: forceIpv4
      };
      if (code !== 0) {
        const recoverable =
          payload.status > 0 ||
          payload.locations.length > 0 ||
          /loadshare\.(?:org|net)/i.test(payload.body || "") ||
          /loadshare\.(?:org|net)/i.test(payload.effectiveUrl || "");
        if (recoverable) {
          resolve(payload);
          return;
        }
        const detail = (stderr || stdout).trim().slice(0, 300);
        reject(
          new Error(`Tornado request failed (exit ${code})${detail ? `: ${detail}` : ""}`)
        );
        return;
      }
      resolve(payload);
    });
    if (body) child.stdin.end(body);
  });
}

function curlToFile({ url, outputPath, headers = {}, cookieJar = "", ipv4 } = {}) {
  const bin = impersonateBin();
  if (!bin) {
    return Promise.reject(new Error(missingTlsMessage()));
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const callerAccept = pickHeader(headers, "Accept");
  const args = [...chrome131Args({ accept: callerAccept || "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" })];
  const forceIpv4 = ipv4 === true || (ipv4 !== false && shouldForceIpv4(url));
  const forceIpv6 = !forceIpv4 && prefersIpv6(url);
  if (forceIpv4) args.push("-4");
  else if (forceIpv6) args.push("-6");
  args.push("-sS", "--fail", "--max-time", "45", "--max-redirs", "8", "-L", "-o", outputPath);
  if (cookieJar) {
    args.push("-b", cookieJar, "-c", cookieJar);
  }
  for (const [name, value] of Object.entries(headers)) {
    if (!name || value == null) continue;
    if (/^(user-agent|accept-encoding)$/i.test(name)) continue;
    if (/^accept$/i.test(name)) continue;
    args.push("-H", `${name}: ${value}`);
  }
  args.push(url);

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "ignore", "pipe"],
      env: curlChildEnv()
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new Error(error.message || "Could not start Chrome TLS client"));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        try {
          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size < 32) fs.unlinkSync(outputPath);
        } catch {
          // ignore
        }
        const detail = stderr.trim().slice(0, 300);
        reject(new Error(`Artwork download failed (exit ${code})${detail ? `: ${detail}` : ""}`));
        return;
      }
      resolve({ ok: true, outputPath });
    });
  });
}

function credsPath() {
  return path.join(process.env.DATA_ROOT || "/data/app", "tornado-credentials.json");
}

function statusCachePath() {
  return path.join(process.env.DATA_ROOT || "/data/app", "tornado-session-status.json");
}

let memoryLastKnown = null;

function readLastKnown() {
  if (memoryLastKnown && typeof memoryLastKnown.loggedIn === "boolean") return memoryLastKnown;
  const saved = loadJson(statusCachePath(), null);
  if (saved && typeof saved.loggedIn === "boolean") {
    memoryLastKnown = saved;
    return saved;
  }
  return null;
}

function writeLastKnown(entry) {
  if (!entry || typeof entry.loggedIn !== "boolean") return;
  memoryLastKnown = entry;
  try {
    saveJson(statusCachePath(), entry);
  } catch {
    // tests or a missing DATA_ROOT should not break status checks
  }
}

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function absorbCookies(jar, response) {
  const raw = response.headers.getSetCookie?.() || [];
  const fallback = response.headers.get("set-cookie");
  const list = raw.length ? raw : fallback ? [fallback] : [];
  for (const line of list) {
    const part = String(line).split(";")[0];
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    jar[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
}

function decodeHtml(text) {
  return String(text || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function expandCapturedText(text) {
  return decodeHtml(String(text || ""))
    .replace(/\\u002f/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/\\u003a/gi, ":")
    .replace(/\\\//g, "/");
}

function hostnameOf(url) {
  try {
    const text = String(url || "").trim();
    if (!text) return "";
    return new URL(text.startsWith("//") ? `https:${text}` : text, BASE_URL).hostname || "";
  } catch {
    return "";
  }
}

function isLoadshareHostName(host) {
  return /(?:^|\.)loadshare\.(?:org|net)$/i.test(String(host || ""));
}

function isTornadoHostName(host) {
  return /tornado/i.test(String(host || ""));
}

function shouldForceIpv4(url) {
  const host = hostnameOf(url);
  if (!host) return true;
  if (isLoadshareHostName(host) || /ip6/i.test(host)) return false;
  return true;
}

function prefersIpv6(url) {
  return /ip6/i.test(hostnameOf(url));
}

function collectLoadshareHosts(text, bucket) {
  const target = bucket || new Set();
  const matches = expandCapturedText(text).match(LOADSHARE_HOST_RE) || [];
  for (const host of matches) target.add(String(host).toLowerCase());
  return target;
}

function sanitizeUrl(url) {
  try {
    let text = expandCapturedText(url).trim();
    if (!text) return "";
    if (text.startsWith("//")) text = `https:${text}`;
    else if (/^(?:[a-z0-9-]+\.)*loadshare\.(?:org|net)\//i.test(text)) text = `https://${text}`;
    const parsed = new URL(text, BASE_URL);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function parseQuality(url) {
  const text = String(url || "");
  const pathMatch = text.match(/\/(2160|1440|1080|720|480|360)(?:\?|&|$|\/)/i);
  if (pathMatch) return Number(pathMatch[1]);
  const nameMatch = text.match(/[?&]name=[^&]*_(\d{3,4})/i);
  if (nameMatch) return Number(nameMatch[1]);
  const labelMatch = text.match(/(?:^|[?&/_-])(4k|uhd|2160p|1440p|1080p|720p)(?:[?&/_-]|$)/i);
  if (labelMatch) {
    const label = labelMatch[1].toLowerCase();
    if (label === "4k" || label === "uhd" || label === "2160p") return 2160;
    if (label === "1440p") return 1440;
    if (label === "1080p") return 1080;
    if (label === "720p") return 720;
  }
  return 0;
}

function qualityLabel(height) {
  if (height >= 2160) return "4K";
  if (height >= 1440) return "1440p";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  if (height) return `${height}p`;
  return "direct";
}

function isLoadshareDownloadUrl(url) {
  return Boolean(url && LOADSHARE_PATH.test(url));
}

function addLoadshareLink(url, bucket) {
  const clean = sanitizeUrl(url);
  if (clean && isLoadshareDownloadUrl(clean)) bucket.add(clean);
  return clean;
}

function attrCandidate(name, value) {
  const text = String(value || "").trim();
  if (/^content$/i.test(name) || /^\d+\s*;/i.test(text) || /url\s*=/i.test(text)) {
    const urlMatch = text.match(/url\s*=\s*([^\s;]+)/i);
    if (urlMatch) return urlMatch[1].replace(/^["']|["']$/g, "");
  }
  return text;
}

function collectLinks(text, bucket) {
  const target = bucket || new Set();
  const expanded = expandCapturedText(text);
  const matches = expanded.match(LINK_PATTERN) || [];
  for (const url of matches) addLoadshareLink(url, target);
  ATTR_LINK_PATTERN.lastIndex = 0;
  let attr;
  while ((attr = ATTR_LINK_PATTERN.exec(expanded)) !== null) {
    addLoadshareLink(attrCandidate(attr[1], attr[3]), target);
  }
  return target;
}

function collectLinksFromJson(data, bucket, key = "") {
  if (data == null) return;
  if (typeof data === "string") {
    collectLinks(data, bucket);
    if (JSON_LINK_KEYS.test(key)) addLoadshareLink(data, bucket);
    return;
  }
  if (Array.isArray(data)) {
    for (const entry of data) collectLinksFromJson(entry, bucket, key);
    return;
  }
  if (typeof data === "object") {
    for (const [nextKey, value] of Object.entries(data)) {
      collectLinksFromJson(value, bucket, nextKey);
    }
  }
}

function collectMetaRefreshUrls(html) {
  const urls = [];
  const decoded = expandCapturedText(html);
  const re =
    /<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["']([^"']+)["'][^>]*>|<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*http-equiv\s*=\s*["']?refresh["'][^>]*>/gi;
  let match;
  while ((match = re.exec(decoded))) {
    const content = match[1] || match[2] || "";
    const urlMatch = content.match(/url\s*=\s*([^\s;]+)/i);
    if (urlMatch) urls.push(urlMatch[1].replace(/^["']|["']$/g, ""));
  }
  return urls;
}

function parseDownloadForms(html) {
  const forms = [];
  const decoded = expandCapturedText(html);
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let match;
  while ((match = formRe.exec(decoded))) {
    const attrs = match[1] || "";
    const inner = match[2] || "";
    const action = (attrs.match(/\baction\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    if (!action || !/loadshare\.(?:org|net)/i.test(action)) continue;
    const method = ((attrs.match(/\bmethod\s*=\s*["']([^"']+)["']/i) || [])[1] || "get").toLowerCase();
    const fields = {};
    const inputRe = /<input\b[^>]*>/gi;
    let input;
    while ((input = inputRe.exec(inner))) {
      const tag = input[0];
      const type = ((tag.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || "text").toLowerCase();
      if (/^(?:submit|button|image|file)$/i.test(type)) continue;
      const name = (tag.match(/\bname\s*=\s*["']([^"']+)["']/i) || [])[1];
      const value = (tag.match(/\bvalue\s*=\s*["']([^"']*)["']/i) || [])[1] || "";
      if (name) fields[name] = decodeHtml(value);
    }
    forms.push({
      action: action.trim(),
      method: method === "post" ? "post" : "get",
      fields
    });
  }
  return forms;
}

function formToDownloadUrl(form) {
  if (!form?.action) return "";
  const action = sanitizeUrl(form.action);
  if (!action) return "";
  if (form.method === "get" && form.fields && Object.keys(form.fields).length) {
    let url = action;
    let known;
    try {
      known = new URL(action);
    } catch {
      known = null;
    }
    for (const [name, value] of Object.entries(form.fields)) {
      if (!name || (known && known.searchParams.has(name))) continue;
      const sep = url.includes("?") ? "&" : "?";
      url += `${sep}${encodeURIComponent(name)}=${String(value)}`;
    }
    return url;
  }
  return action;
}

function ingestCapturedText(text, bucket, hostBucket) {
  collectLinks(text, bucket);
  for (const url of collectMetaRefreshUrls(text)) addLoadshareLink(url, bucket);
  for (const form of parseDownloadForms(text)) addLoadshareLink(formToDownloadUrl(form), bucket);
  if (hostBucket) collectLoadshareHosts(text, hostBucket);
  try {
    collectLinksFromJson(JSON.parse(String(text || "")), bucket);
  } catch {
    // HTML or non-JSON text is expected.
  }
}

function nestedApiPaths(html) {
  const matches =
    String(html || "").match(/\/(?:getdownload|getbutton|getlink|getplayer|getlinks)\/[^\s"'<>?]+/gi) || [];
  return [...new Set(matches.map((entry) => entry.replace(/&amp;/gi, "&")))];
}

function parseAjaxUrlsFromHtml(html) {
  const urls = new Set();
  const patterns = [
    /url\s*:\s*['"]([^'"]+)['"]/gi,
    /\.get\(\s*['"]([^'"]+)['"]/gi,
    /\.post\(\s*['"]([^'"]+)['"]/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(String(html || ""))) !== null) {
      const value = String(match[1] || "").replace(/&amp;/gi, "&").trim();
      if (value && /getdownload|getbutton|getlink|download|loadshare/i.test(value)) {
        urls.add(value);
      }
    }
  }
  return [...urls];
}

function nestedDownloadUrls(html) {
  return [...new Set([...nestedApiPaths(html), ...parseAjaxUrlsFromHtml(html)])];
}

function acceptForApiPath(apiPath) {
  return /getdownload/i.test(String(apiPath || "")) ? ACCEPT_JSON : ACCEPT_HTML;
}

function shortPreview(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function appendQueryParam(urlPath, name, value) {
  if (!name || value == null || value === "") return urlPath;
  try {
    const parsed = new URL(String(urlPath), BASE_URL);
    if (parsed.searchParams.has(name)) return urlPath;
    parsed.searchParams.set(name, String(value));
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    const sep = String(urlPath).includes("?") ? "&" : "?";
    return `${urlPath}${sep}${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  }
}

function withCsrfQuery(urlPath, csrf) {
  if (!csrf?.token || !/getdownload|getbutton|getlink/i.test(String(urlPath))) {
    return urlPath;
  }
  return appendQueryParam(urlPath, csrf.param || "_csrf", csrf.token);
}

function extractMovieId(url) {
  return extractMovieIdFromUrl(url);
}

function canonicalMovieUrl(url) {
  return canonicalMoviePageUrl(url);
}

class TornadoClient {
  constructor() {
    this.jar = loadJson(cookiePath(), {});
  }

  persist() {
    saveJson(cookiePath(), this.jar);
  }

  hasSession() {
    return Object.keys(this.jar).length > 0;
  }

  credentials() {
    const saved = loadJson(credsPath(), {});
    return {
      username: saved.username || "",
      hasPassword: Boolean(saved.password)
    };
  }

  saveCredentials({ username, password }) {
    const existing = loadJson(credsPath(), {});
    saveJson(credsPath(), {
      username: String(username || existing.username || "").trim(),
      password: password ? String(password) : existing.password || ""
    });
  }

  setCookieHeader(raw) {
    for (const part of String(raw || "").split(";")) {
      const eq = part.indexOf("=");
      if (eq < 1) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (name) this.jar[name] = value;
    }
    this.persist();
  }

  async request(urlPath, options = {}) {
    const url = new URL(urlPath, BASE_URL);
    const headers = { ...(options.headers || {}) };
    writeCurlJar(this.jar);
    const result = await runChromeCurl({
      url: url.toString(),
      method: options.method || "GET",
      headers,
      body: options.body || "",
      follow: options.follow !== false,
      cookieJar: cookieJarPath(),
      ipv4: options.ipv4
    });
    Object.assign(this.jar, readCurlJar());
    for (const line of result.setCookie || []) {
      const part = String(line).split(";")[0];
      const eq = part.indexOf("=");
      if (eq < 1) continue;
      this.jar[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
    this.persist();
    return result;
  }

  async probe() {
    const bin = impersonateBin();
    if (!bin) return { ok: false, error: "Chrome TLS binary missing", bin: "" };
    const google = await runCurlOnce(
      bin,
      ["-4", "-sS", "-I", "--max-time", "10", "https://www.google.com"],
      10000
    );
    const tornado = await runCurlOnce(
      bin,
      [...chrome131Args(), "-4", "-sS", "-I", "--max-time", "20", `${BASE_URL}/tornado-1`],
      20000
    );
    return { ok: tornado.ok, bin, google, tornado };
  }

  async sessionStatus() {
    const creds = this.credentials();
    const lastKnown = readLastKnown();
    const hasCookies = this.hasSession();
    const hasIdentity = hasIdentityCookie(this.jar);
    const base = {
      username: creds.username,
      hasPassword: creds.hasPassword,
      hasCookies,
      hasIdentity,
      lastKnownLoggedIn: typeof lastKnown?.loggedIn === "boolean" ? lastKnown.loggedIn : null,
      chromeTls: Boolean(impersonateBin()),
      loginUrl: this.loginUrl()
    };

    const finish = (evaluated, ok, error) => {
      if (evaluated.confirmed && typeof evaluated.loggedIn === "boolean") {
        writeLastKnown({
          loggedIn: evaluated.loggedIn,
          username: creds.username || "",
          at: Date.now()
        });
      }
      return {
        ok,
        loggedIn: evaluated.loggedIn,
        confirmed: Boolean(evaluated.confirmed),
        evidence: evaluated.evidence || "",
        username: creds.username,
        hasPassword: creds.hasPassword,
        hasCookies,
        hasIdentity: evaluated.hasIdentity || hasIdentity,
        lastKnownLoggedIn: base.lastKnownLoggedIn,
        chromeTls: base.chromeTls,
        loginUrl: base.loginUrl,
        error
      };
    };

    const evaluateBody = (html, status, error) =>
      evaluateSessionStatus({
        html,
        status,
        jar: this.jar,
        lastKnown: lastKnown?.loggedIn,
        error
      });

    try {
      const home = await this.text("/tornado-1");
      let evaluated = evaluateBody(home.body, home.status);
      if (!evaluated.confirmed) {
        try {
          const profile = await this.text("/user/profile");
          const profileEval = evaluateBody(profile.body, profile.status);
          if (profileEval.confirmed) evaluated = profileEval;
        } catch (profileError) {
          const retry = evaluateBody("", 0, profileError.message || "profile probe failed");
          if (retry.loggedIn != null && evaluated.loggedIn == null) evaluated = retry;
        }
      }
      return finish(
        evaluated,
        evaluated.confirmed,
        evaluated.confirmed ? undefined : "Could not confirm Tornado session."
      );
    } catch (error) {
      const message = error.message || "Could not reach Tornado.";
      const evaluated = evaluateBody("", 0, message);
      return finish(
        evaluated,
        false,
        !impersonateBin()
          ? missingTlsMessage()
          : /fetch failed|ECONNRESET/i.test(message)
            ? "Tornado reset the connection. Confirm docker-compose.yml uses network_mode: host, then: sudo docker compose up -d"
            : message
      );
    }
  }

  async downloadToFile(urlPath, outputPath, options = {}) {
    const url = /^https?:\/\//i.test(String(urlPath || ""))
      ? String(urlPath)
      : new URL(urlPath, BASE_URL).toString();
    writeCurlJar(this.jar);
    const result = await curlToFile({
      url,
      outputPath,
      headers: options.headers || {},
      cookieJar: cookieJarPath(),
      ipv4: options.ipv4
    });
    Object.assign(this.jar, readCurlJar());
    this.persist();
    return result;
  }

  async text(urlPath, options) {
    const response = await this.request(urlPath, options);
    const abs = (() => {
      try {
        return new URL(urlPath, BASE_URL).toString();
      } catch {
        return String(urlPath || "");
      }
    })();
    return {
      status: response.status,
      body: response.body || "",
      effectiveUrl: response.effectiveUrl || "",
      locations: response.locations || [],
      headers: response.headers || {},
      forcedIpv4:
        typeof response.forcedIpv4 === "boolean"
          ? response.forcedIpv4
          : shouldForceIpv4(response.effectiveUrl || abs)
    };
  }

  loginUrl() {
    return `${BASE_URL}/`;
  }

  async login(username, password, recaptcha = "") {
    const blocked = requireRecaptcha(recaptcha);
    if (blocked) return blocked;

    const saved = this.credentials();
    const email = String(username || saved.username || "").trim();
    const pass = password || loadJson(credsPath(), {}).password || "";
    if (!email || !pass) {
      return {
        ok: false,
        error:
          "NAS has no saved Tornado password. Paste _identity-frontend1 and advanced-frontend from Chrome DevTools instead."
      };
    }
    this.saveCredentials({ username: email, password: pass });

    await this.request("/user/login", {
      method: "GET",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${BASE_URL}/`
      }
    }).catch(() => ({}));

    const home = await this.text("/tornado-1");
    const homeCsrf = parseCsrfFromHtml(home.body);

    const loginPage = await this.text("/user/premiummembership");
    const pageCsrf = parseCsrfFromHtml(loginPage.body);
    const pageToken = pageCsrf.token || homeCsrf.token;
    const pageParam = pageCsrf.token ? pageCsrf.param : homeCsrf.param;

    const params = new URLSearchParams();
    params.set("SignupForm[email]", email);
    params.set("SignupForm[password]", pass);
    params.set("SignupForm[reCaptcha]", String(recaptcha || ""));
    params.set("SignupForm[rememberMe]", "1");
    params.set("notification", "false");
    if (pageParam && pageToken) params.set(pageParam, pageToken);

    const response = await this.request("/user/login", {
      method: "POST",
      follow: false,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRF-Token": pageToken,
        Referer: `${BASE_URL}/user/premiummembership`,
        Origin: BASE_URL
      },
      body: params.toString()
    });
    const body = response.body || "";
    let data = null;
    try {
      data = JSON.parse(body);
    } catch {
      data = null;
    }

    if (data?.response === false) {
      const message = data.msg || data.error || "Tornado login failed.";
      const verification = isVerificationError(message);
      return {
        ok: false,
        needsCaptcha: verification || true,
        error: verification
          ? "Verification code incorrect. Paste _identity-frontend1 and advanced-frontend from Chrome DevTools → Application → Cookies instead of using Tornado's Login."
          : message,
        loginUrl: this.loginUrl()
      };
    }
    if (data?.response === true) {
      writeLastKnown({ loggedIn: true, username: email, at: Date.now() });
      return { ok: true, loggedIn: true };
    }
    const check = await this.sessionStatus();
    if (check.loggedIn) return { ok: true, loggedIn: true };
    return {
      ok: false,
      needsCaptcha: true,
      error: recaptcha
        ? data?.msg || "Login did not stick. Solve the captcha again, then send it back."
        : "Tornado needs the captcha completed in your browser.",
      loginUrl: this.loginUrl()
    };
  }

  async search(query) {
    const q = String(query || "").trim();
    if (!q) return { ok: false, error: "Enter a search." };
    if (!this.hasSession()) {
      await this.text("/tornado-1").catch(() => {});
    }
    const encoded = encodeURIComponent(q);
    const result = await this.text(`/search_all/~${encoded}~`, {
      headers: { Referer: `${BASE_URL}/tornado-1` }
    });
    if (result.status >= 400) {
      return { ok: false, error: `Search failed (HTTP ${result.status}).` };
    }
    const parsed = parseSearchResults(result.body);
    const movies = parsed.movies.slice(0, 40);
    if (!movies.length && parsed.warning) {
      return { ok: false, error: parsed.warning, query: q };
    }
    return {
      ok: true,
      movies,
      counts: {
        total: movies.length,
        movies: movies.filter((item) => item.kind !== "tv").length,
        tv: movies.filter((item) => item.kind === "tv").length
      },
      query: q
    };
  }

  async fetchShow(showUrl, season = null) {
    const canonical = canonicalContentUrl(showUrl) || String(showUrl || "").trim();
    if (!canonical || !isTvShowPageUrl(canonical)) {
      return { ok: false, error: "Not a TV show page URL." };
    }

    const first = await this.text(canonical, {
      headers: { Referer: `${BASE_URL}/tornado-1` }
    });
    let scan = parseTvShowPage(first.body, canonical, { season });
    const targetSeason = Number.parseInt(season, 10) || scan.season || 1;

    for (const hubUrl of guessShowHubUrls(canonical).filter((url) => url && url !== canonical)) {
      let hubPage;
      try {
        hubPage = await this.text(hubUrl, { headers: { Referer: canonical } });
      } catch {
        continue;
      }
      if (Number(hubPage?.status) >= 400 || !hubPage?.body || String(hubPage.body).length < 80) continue;
      const hubScan = parseTvShowPage(hubPage.body, hubUrl, { season: targetSeason });
      scan = {
        ...scan,
        showTitle: scan.showTitle || hubScan.showTitle,
        posterUrl: scan.posterUrl || hubScan.posterUrl,
        seasons: mergeSeasonLists(scan.seasons, hubScan.seasons)
      };
      if ((hubScan.seasons || []).length > 1) break;
    }

    const seasonInfo = (scan.seasons || []).find((entry) => Number(entry.number) === Number(targetSeason));
    const candidates = guessSeasonHubUrls(canonical, targetSeason, seasonInfo?.url || "").filter(
      (url) => url && url !== canonical
    );

    for (const seasonUrl of candidates) {
      let second;
      try {
        second = await this.text(seasonUrl, { headers: { Referer: canonical } });
      } catch {
        continue;
      }
      if (Number(second?.status) >= 400) continue;
      if (!second?.body || String(second.body).length < 80) continue;
      const seasonScan = parseTvShowPage(second.body, seasonUrl, { season: targetSeason });
      const episodes = normalizeEpisodeNumbers(
        dedupeEpisodes([...(scan.episodes || []), ...(seasonScan.episodes || [])]),
        targetSeason
      );
      scan = {
        ...seasonScan,
        showTitle: seasonScan.showTitle || scan.showTitle,
        posterUrl: seasonScan.posterUrl || scan.posterUrl,
        seasons: mergeSeasonLists(scan.seasons, seasonScan.seasons),
        episodes,
        episodeCount: episodes.length
      };
      if (episodes.length) break;
    }

    const episodes = normalizeEpisodeNumbers(dedupeEpisodes(scan.episodes || []), scan.season || targetSeason);
    scan = { ...scan, episodes, episodeCount: episodes.length };

    if (!scan.episodes?.length) {
      scan.error =
        scan.error ||
        "No episodes found for this season. Open the show again after signing in, or pick another season.";
    }

    const plan = buildTvShowPlan(scan);
    return {
      ok: true,
      ...scan,
      plan,
      seasonCount: (scan.seasons || []).length
    };
  }

  async findDirectLink(movieUrl) {
    const canonical =
      canonicalMovieUrl(movieUrl) || canonicalContentUrl(movieUrl) || String(movieUrl || "").trim();
    if (!canonical) {
      return { ok: false, error: "Invalid movie or episode URL." };
    }

    const page = await this.text(canonical, {
      headers: { Referer: `${BASE_URL}/tornado-1` }
    });
    const csrf = parseCsrfFromHtml(page.body);
    const downloadIds = mergeDownloadIds(extractPageDownloadIds(page.body), extractDownloadIds(canonical));
    if (!canonical || !downloadIds.length) {
      return { ok: false, error: "Invalid movie or episode URL." };
    }

    const links = new Set();
    const loadshareHosts = new Set();
    ingestCapturedText(page.body, links, loadshareHosts);
    const pageIsLoginWall = isDownloadLoginWall(page.body);

    const apiHeaders = {
      Referer: canonical,
      Origin: BASE_URL,
      "X-Requested-With": "XMLHttpRequest"
    };
    if (csrf.token) apiHeaders["X-CSRF-Token"] = csrf.token;

    let lastPath = canonical;
    let lastStatus = page.status || 0;
    let lastPreview = shortPreview(page.body);
    let lastForcedIpv4 = shouldForceIpv4(canonical);
    let lastEffectiveHost = hostnameOf(page.effectiveUrl || canonical);
    const fetched = new Set();

    const noteResult = (urlPath, result) => {
      lastPath = urlPath;
      lastStatus = result.status || 0;
      lastPreview = shortPreview(result.body);
      lastForcedIpv4 =
        typeof result.forcedIpv4 === "boolean" ? result.forcedIpv4 : shouldForceIpv4(result.effectiveUrl || urlPath);
      lastEffectiveHost = hostnameOf(result.effectiveUrl || urlPath) || lastEffectiveHost;
      collectLoadshareHosts(result.body, loadshareHosts);
      collectLoadshareHosts(result.effectiveUrl, loadshareHosts);
      for (const location of result.locations || []) collectLoadshareHosts(location, loadshareHosts);
      for (const value of Object.values(result.headers || {})) collectLoadshareHosts(value, loadshareHosts);
    };

    const ingestHeaders = (headers, extraLocations) => {
      for (const location of extraLocations || []) {
        collectLinks(location, links);
        addLoadshareLink(location, links);
        collectLoadshareHosts(location, loadshareHosts);
      }
      const headerMap = headers || {};
      for (const [name, value] of Object.entries(headerMap)) {
        if (!value) continue;
        if (/^(?:location|x-redirect|x-location|content-location)$/i.test(name)) {
          collectLinks(value, links);
          addLoadshareLink(value, links);
        } else if (/^refresh$/i.test(name)) {
          const urlMatch = String(value).match(/url\s*=\s*([^\s;]+)/i);
          addLoadshareLink(urlMatch ? urlMatch[1] : value, links);
        }
        collectLoadshareHosts(value, loadshareHosts);
      }
    };

    const ingest = async (urlPath, accept, extra = {}) => {
      collectLinks(urlPath, links);
      const requested = withCsrfQuery(urlPath, csrf);
      if (fetched.has(`${extra.method || "GET"} ${requested}`)) return "";
      fetched.add(`${extra.method || "GET"} ${requested}`);
      try {
        const abs = new URL(requested, BASE_URL);
        const loadshare = isLoadshareHostName(abs.hostname);
        const headers = {
          ...(loadshare ? { Referer: canonical } : apiHeaders),
          Accept: accept || acceptForApiPath(urlPath)
        };
        if (String(extra.method || "").toUpperCase() === "POST") {
          headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
        }
        const result = await this.text(requested, {
          headers,
          follow: extra.follow === true,
          ipv4: extra.ipv4,
          method: extra.method,
          body: extra.body
        });
        noteResult(urlPath, result);
        ingestCapturedText(result.body, links, loadshareHosts);
        collectLinks(result.effectiveUrl, links);
        addLoadshareLink(result.effectiveUrl, links);
        ingestHeaders(result.headers, result.locations);
        const forms = parseDownloadForms(result.body);
        for (const form of forms) {
          const built = formToDownloadUrl(form);
          const merged = formToDownloadUrl({ ...form, method: "get" });
          addLoadshareLink(built, links);
          addLoadshareLink(merged, links);
          collectLoadshareHosts(form.action, loadshareHosts);
          if (
            form.method === "post" &&
            !isLoadshareDownloadUrl(built) &&
            !isLoadshareDownloadUrl(merged)
          ) {
            await ingest(form.action, ACCEPT_HTML, {
              follow: false,
              ipv4: false,
              method: "POST",
              body: new URLSearchParams(form.fields).toString()
            });
          }
        }
        if (extra.follow !== true) {
          for (const location of result.locations || []) {
            const locClean = sanitizeUrl(location);
            const host = hostnameOf(locClean || location);
            if (!locClean || isLoadshareDownloadUrl(locClean) || isLoadshareHostName(host)) continue;
            if (!isTornadoHostName(host)) continue;
            let nextPath = locClean;
            try {
              const loc = new URL(locClean);
              nextPath = `${loc.pathname}${loc.search}`;
            } catch {
              nextPath = locClean;
            }
            await ingest(nextPath, acceptForApiPath(nextPath));
          }
        }
        return result.body;
      } catch (error) {
        lastPath = urlPath;
        lastPreview = shortPreview(error.message);
        return "";
      }
    };

    for (const nested of nestedDownloadUrls(page.body)) {
      collectLinks(nested, links);
      const nestedClean = sanitizeUrl(nested);
      if (nestedClean && isLoadshareDownloadUrl(nestedClean)) continue;
      await ingest(nested, acceptForApiPath(nested));
    }

    outer: for (const downloadId of downloadIds) {
      for (const type of API_TYPES) {
        for (const apiPath of API_PATHS) {
          const apiPathUrl = `/${apiPath}/${downloadId}/${type}`;
          const body = await ingest(apiPathUrl, acceptForApiPath(apiPath));
          for (const nested of nestedDownloadUrls(body)) {
            collectLinks(nested, links);
            const nestedClean = sanitizeUrl(nested);
            if (nestedClean && isLoadshareDownloadUrl(nestedClean)) continue;
            await ingest(nested, acceptForApiPath(nested));
          }
          if ([...links].some((url) => parseQuality(url) >= 1080)) break outer;
        }
      }
    }

    const ranked = [...links]
      .map((url) => {
        const height = parseQuality(url);
        return { url, height, qualityLabel: qualityLabel(height) };
      })
      .sort((a, b) => b.height - a.height);

    if (!ranked.length) {
      let loggedIn = null;
      try {
        const session = await this.sessionStatus();
        loggedIn = session.loggedIn;
      } catch {
        loggedIn = hasIdentityCookie(this.jar) ? null : false;
      }
      if (pageIsLoginWall || loggedIn === false) {
        return { ok: false, error: downloadLoginWallMessage() };
      }
      const hostNote = loadshareHosts.size
        ? [...loadshareHosts].slice(0, 3).join(",")
        : "no";
      return {
        ok: false,
        error: `No LoadShare download link found. ids=${downloadIds.join(",")} last=${lastPath} HTTP ${lastStatus} preview=${lastPreview} loggedIn=${loggedIn} loadshareHost=${hostNote} ipv4=${lastForcedIpv4 ? "yes" : "no"} effectiveHost=${lastEffectiveHost || "n/a"}`
      };
    }

    const best = ranked[0];
    return {
      ok: true,
      movieUrl: canonical,
      movieId: downloadIds[0],
      best,
      links: ranked.slice(0, 8)
    };
  }
}
  return { TornadoClient };
})();

const { posterPathForVideo, mediaServerPosterPath, pickArtworkUrlFromHtml, showFolderFromEpisodePath, saveArtworkFromUrl, saveShowPoster } = (() => {
const VIDEO_EXT_PATTERN = /\.(mp4|mkv|mov|m4v|webm|ts)$/i;
const JUNK_ARTWORK = /avatar|favicon|logo|icon|sprite|banner-ad|1x1|pixel/i;

function videoBasename(videoPath) {
  return path.basename(videoPath, path.extname(videoPath));
}

function posterPathForVideo(videoPath, extension = ".jpg") {
  return String(videoPath || "").replace(VIDEO_EXT_PATTERN, `-poster${extension}`);
}

function mediaServerPosterPath(videoPath, extension = ".jpg") {
  return path.join(path.dirname(videoPath), `${videoBasename(videoPath)}${extension}`);
}

function isUsableArtworkUrl(url) {
  const text = String(url || "").trim();
  if (!text || text.startsWith("data:")) return false;
  if (JUNK_ARTWORK.test(text)) return false;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function pickArtworkUrlFromHtml(html, pageUrl) {
  const fromMeta = readShowMeta(html, pageUrl).posterUrl || "";
  return isUsableArtworkUrl(fromMeta) ? fromMeta : "";
}

function showFolderFromEpisodePath(videoPath, videoRoot) {
  const rel = path.relative(videoRoot, videoPath);
  const parts = rel.split(/[/\\]/).filter(Boolean);
  const tvIdx = parts.findIndex((part) => /^(tv shows|anime|series)$/i.test(part));
  if (tvIdx >= 0 && parts[tvIdx + 1]) {
    return path.join(videoRoot, parts[tvIdx], parts[tvIdx + 1]);
  }
  const seasonIdx = parts.findIndex((part) => /^season\s*\d{1,2}$/i.test(part));
  if (seasonIdx > 0) {
    return path.join(videoRoot, ...parts.slice(0, seasonIdx));
  }
  return path.dirname(path.dirname(videoPath));
}

async function writeImageFile(downloadToFile, imageUrl, outputPath, headers) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await downloadToFile({ url: imageUrl, outputPath, headers });
  const size = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
  if (size < 256) {
    try {
      fs.unlinkSync(outputPath);
    } catch {
      // ignore
    }
    throw new Error("Artwork file was empty.");
  }
  return outputPath;
}

async function saveArtworkFromUrl(imageUrl, videoOutputPath, options = {}) {
  if (!isUsableArtworkUrl(imageUrl) || !videoOutputPath) return null;
  const downloadToFile = options.downloadToFile;
  if (typeof downloadToFile !== "function") return null;

  const headers = options.headers || [
    { name: "Referer", value: options.referer || imageUrl },
    { name: "Accept", value: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" }
  ];

  const primary = posterPathForVideo(videoOutputPath, ".jpg");
  await writeImageFile(downloadToFile, imageUrl, primary, headers);

  const sibling = mediaServerPosterPath(videoOutputPath, ".jpg");
  if (sibling !== primary) {
    try {
      fs.copyFileSync(primary, sibling);
    } catch {
      // sidecar copy is optional
    }
  }
  return primary;
}

async function saveShowPoster(posterUrl, showFolder, options = {}) {
  if (!isUsableArtworkUrl(posterUrl) || !showFolder) return null;
  const downloadToFile = options.downloadToFile;
  if (typeof downloadToFile !== "function") return null;

  fs.mkdirSync(showFolder, { recursive: true });
  const outputPath = path.join(showFolder, "poster.jpg");
  if (!options.force) {
    try {
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 8 * 1024) {
        return outputPath;
      }
    } catch {
      // rewrite
    }
  }

  const headers = options.headers || [
    { name: "Referer", value: options.referer || posterUrl },
    { name: "Accept", value: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" }
  ];
  await writeImageFile(downloadToFile, posterUrl, outputPath, headers);
  return outputPath;
}
  return { posterPathForVideo, mediaServerPosterPath, pickArtworkUrlFromHtml, showFolderFromEpisodePath, saveArtworkFromUrl, saveShowPoster };
})();

globalThis.CINARIP_FREEZER_WORKER_FILES = [{"name":"cinarip-freezer-worker/Dockerfile","encoding":"utf8","data":"# Encode worker for CinaRip Freezer. Runs on a PC (or any machine with RAM).\r\n# Do not run this on the 1GB NAS.\r\nFROM node:18-bookworm\r\n\r\nRUN apt-get update \\\r\n  && apt-get install -y --no-install-recommends ffmpeg cifs-utils keyutils \\\r\n  && rm -rf /var/lib/apt/lists/*\r\n\r\nWORKDIR /app\r\n\r\nCOPY worker.js ./\r\nCOPY lib ./lib\r\nCOPY public ./public\r\nCOPY docker-entrypoint.sh /docker-entrypoint.sh\r\nRUN sed -i 's/\\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh\r\n\r\nENV NODE_ENV=production\r\nENV PORT=8791\r\nENV VIDEO_ROOT=/videos\r\nENV CONFIG_ROOT=/config\r\nENV NAS_MOUNT_POINT=/mnt/nas\r\nENV FFMPEG_THREADS=2\r\nENV FFMPEG_CRF=24\r\nENV NAS_ORIGIN=https://cinarip.matthewsuess.com\r\n\r\nEXPOSE 8791\r\nENTRYPOINT [\"/docker-entrypoint.sh\"]\r\n"},{"name":"cinarip-freezer-worker/docker-compose.yml","encoding":"utf8","data":"# CinaRip Freezer encode worker — run on a PC, not the NAS.\r\n# Freezer/ is created inside the container at startup. CIFS needs SYS_ADMIN.\r\n#\r\n# Windows PowerShell:\r\n#   $env:CINARIP_VIDEOS=\"T:\\Videos\"\r\n#   docker compose up --build\r\n#\r\n# NAS CinaRip HTTP default: https://cinarip.matthewsuess.com\r\n# NAS share default: //100.95.66.124/Public  + Videos (LAN / owner Tailscale)\r\nservices:\r\n  freezer-worker:\r\n    build: .\r\n    image: cinarip-freezer-worker\r\n    container_name: cinarip-freezer-worker\r\n    restart: unless-stopped\r\n    privileged: true\r\n    cap_add:\r\n      - SYS_ADMIN\r\n      - DAC_READ_SEARCH\r\n    security_opt:\r\n      - apparmor:unconfined\r\n    ports:\r\n      - \"8791:8791\"\r\n    extra_hosts:\r\n      - \"host.docker.internal:host-gateway\"\r\n    environment:\r\n      PORT: \"8791\"\r\n      VIDEO_ROOT: /videos\r\n      CONFIG_ROOT: /config\r\n      NAS_MOUNT_POINT: /mnt/nas\r\n      FFMPEG_THREADS: \"2\"\r\n      FFMPEG_CRF: \"24\"\r\n      SCAN_MS: \"4000\"\r\n      NAS_ORIGIN: ${NAS_ORIGIN:-https://cinarip.matthewsuess.com}\r\n      NAS_STATUS_URL: ${NAS_STATUS_URL:-https://cinarip.matthewsuess.com/api/freezer/status}\r\n    volumes:\r\n      - ${CINARIP_VIDEOS:-./videos}:/videos:rw\r\n      - freezer-worker-config:/config:rw\r\n\r\nvolumes:\r\n  freezer-worker-config:\r\n"},{"name":"cinarip-freezer-worker/docker-entrypoint.sh","encoding":"utf8","data":"#!/bin/sh\r\nROOT=\"${VIDEO_ROOT:-/videos}\"\r\nCONFIG=\"${CONFIG_ROOT:-/config}\"\r\nNAS_MNT=\"${NAS_MOUNT_POINT:-/mnt/nas}\"\r\nmkdir -p \"$ROOT\" \"$CONFIG\" \"$NAS_MNT\"\r\n# Freezer/ mkdir + write probe happen in node so errors show in the UI.\r\nexec node /app/worker.js\r\n"},{"name":"cinarip-freezer-worker/README.md","encoding":"utf8","data":"# CinaRip Freezer encode worker\r\n\r\nCompress titles that are already in `Freezer/` on a **PC or other machine with RAM**. Do **not** run this on the ASUSTOR NAS (1 GB). The NAS CinaRip image does not include ffmpeg and should not be rebuilt with it.\r\n\r\n## What this does\r\n\r\nThe NAS app only **moves** movies/shows into `Videos/Freezer/` (TV keeps `Season NN`). This worker:\r\n\r\n1. Scans `Freezer/` for videos that are not compressed yet (sidecar `.cinarip-compress.json`).\r\n2. Keeps a copy of the original under `Freezer/.originals/` (same relative path).\r\n3. Encodes to a temp file next to the source (H.264 + AAC, 720p cap, CRF ~24).\r\n4. Checks duration and streams with ffprobe, then replaces the playback file only if the check passes.\r\n5. Leaves the original untouched if encode/verify fails.\r\n\r\nOpen **http://localhost:8791** after `docker compose up`. Encoding does **not** start until you click a button.\r\n\r\n- **Start Freezer** — begin the pending queue (“Needs to be frozen”).\r\n- **Cool Down** — run the encode pass (those titles move into “Cooling down”).\r\n\r\nThe worker page always shows mount/NAS connection and live download/upload speeds (idle shows —). Cooling-down items use a real progress bar for download (copy original aside), encode (ffmpeg `-progress`), and upload (write the compressed file back).\r\n\r\n## Install Docker\r\n\r\n- Windows / Mac: [Docker Desktop](https://docs.docker.com/get-docker/)\r\n- Linux: Docker Engine + Compose plugin\r\n\r\n## Mount your Videos folder\r\n\r\nThe container path `/videos` must be your library root — the same folder CinaRip calls Videos. `Freezer/` is created **inside the container at startup** and probed for write access. Docker needs write access to that folder (NAS share credentials or Docker Desktop file sharing).\r\n\r\nThe worker talks to NAS CinaRip at **https://cinarip.matthewsuess.com** by default (no Tailscale needed for the web app). On the worker page, **Save / Connect** stores:\r\n\r\n- CinaRip URL\r\n- SMB host (`100.95.66.124` on LAN/Tailscale for the owner PC), share (`Public`), Videos path (`Videos`)\r\n- Username and password (masked; saved in the container `/config` volume, never logged)\r\n\r\nWith credentials saved, the worker mounts `//host/share` onto `/mnt/nas` and uses `/mnt/nas/Videos`. That wins over a local `CINARIP_VIDEOS` bind when the mount succeeds.\r\n\r\nExamples:\r\n\r\n| Host | `CINARIP_VIDEOS` |\r\n| --- | --- |\r\n| NAS share mapped as `T:\\Videos` | `T:\\Videos` |\r\n| SMB/Tailscale mount | `/mnt/nas/Videos` |\r\n| Local copy of the library | `D:\\CinaRip\\Videos` |\r\n\r\nThe worker will look for `/videos/Freezer`.\r\n\r\n## Run\r\n\r\nUnzip this folder, then from this directory:\r\n\r\n**Windows PowerShell**\r\n\r\n```powershell\r\n$env:CINARIP_VIDEOS=\"T:\\Videos\"\r\ndocker compose up --build\r\n```\r\n\r\n**Linux / macOS**\r\n\r\n```bash\r\nexport CINARIP_VIDEOS=/mnt/nas/Videos\r\ndocker compose up --build\r\n```\r\n\r\nNAS HTTP is already set to https://cinarip.matthewsuess.com. Override only if CinaRip is somewhere else:\r\n\r\n```powershell\r\n$env:NAS_ORIGIN=\"https://cinarip.matthewsuess.com\"\r\n```\r\n\r\nThen open http://localhost:8791 — **Start Freezer**, then **Cool Down** if you want the encode pass explicit. Both buttons start work; Cool Down is the encode-in-progress action.\r\n\r\nStop with Ctrl+C or `docker compose down`.\r\n\r\n## Markers\r\n\r\n- Sidecar: `Movie.mp4.cinarip-compress.json` (`pending` / `encoding` / `done` / `failed`)\r\n- Original: `Freezer/.originals/...` mirroring the path under `Freezer/`\r\n- Already-`done` files are not re-encoded\r\n- Restore/discard original is done in the NAS CinaRip **Freezer** page, not here\r\n"},{"name":"cinarip-freezer-worker/package.json","encoding":"utf8","data":"{\r\n  \"name\": \"cinarip-freezer-worker\",\r\n  \"private\": true,\r\n  \"scripts\": {\r\n    \"start\": \"node worker.js\",\r\n    \"test\": \"node --test test/*.test.js\"\r\n  }\r\n}\r\n"},{"name":"cinarip-freezer-worker/worker.js","encoding":"utf8","data":"\"use strict\";\r\n\r\nconst http = require(\"http\");\r\nconst https = require(\"https\");\r\nconst fs = require(\"fs\");\r\nconst path = require(\"path\");\r\nconst { compressPlaybackFile, shouldEncode, readSidecar } = require(\"./lib/encode\");\r\nconst { scanFreezer, queueBuckets } = require(\"./lib/scan\");\r\nconst { RateWindow, formatBps } = require(\"./lib/progress\");\r\nconst {\r\n  DEFAULT_NAS_ORIGIN,\r\n  nasStatusUrl,\r\n  resolveNasOrigin,\r\n  readConfig,\r\n  writeConfig,\r\n  publicConfig,\r\n  ensureFreezer\r\n} = require(\"./lib/nas-config\");\r\nconst { mountCifs, videosRootFromMount } = require(\"./lib/nas-mount\");\r\n\r\nconst PORT = Number(process.env.PORT) || 8791;\r\nconst FALLBACK_VIDEO_ROOT = path.resolve(process.env.VIDEO_ROOT || \"/videos\");\r\nconst CONFIG_ROOT = path.resolve(process.env.CONFIG_ROOT || \"/config\");\r\nconst NAS_MOUNT_POINT = path.resolve(process.env.NAS_MOUNT_POINT || \"/mnt/nas\");\r\nlet VIDEO_ROOT = FALLBACK_VIDEO_ROOT;\r\nconst SCAN_MS = Number(process.env.SCAN_MS) || 4000;\r\nconst PUBLIC_DIR = path.join(__dirname, \"public\");\r\n\r\nconst MIME = {\r\n  \".html\": \"text/html; charset=utf-8\",\r\n  \".css\": \"text/css; charset=utf-8\",\r\n  \".js\": \"application/javascript; charset=utf-8\",\r\n  \".json\": \"application/json; charset=utf-8\",\r\n  \".jpg\": \"image/jpeg\",\r\n  \".jpeg\": \"image/jpeg\",\r\n  \".png\": \"image/png\",\r\n  \".webp\": \"image/webp\"\r\n};\r\n\r\nlet running = false;\r\nlet cooling = false;\r\nlet loopBusy = false;\r\nlet current = null;\r\nlet lastDownloadBytes = 0;\r\nlet lastUploadBytes = 0;\r\nconst downloadRate = new RateWindow();\r\nconst uploadRate = new RateWindow();\r\nlet nasOrigin = DEFAULT_NAS_ORIGIN;\r\nlet nasConnection = {\r\n  state: \"disconnected\",\r\n  origin: DEFAULT_NAS_ORIGIN,\r\n  url: nasStatusUrl(DEFAULT_NAS_ORIGIN),\r\n  error: null\r\n};\r\n\r\nfunction applyNasOrigin(origin) {\r\n  nasOrigin = origin;\r\n  nasConnection = {\r\n    ...nasConnection,\r\n    origin,\r\n    url: nasStatusUrl(origin)\r\n  };\r\n}\r\n\r\nlet smbConnection = {\r\n  state: \"unconfigured\",\r\n  mounted: false,\r\n  error: null\r\n};\r\n\r\nfunction loadNasOrigin() {\r\n  applyNasOrigin(resolveNasOrigin(VIDEO_ROOT, process.env, CONFIG_ROOT));\r\n}\r\n\r\nfunction applyShareMount() {\r\n  const cfg = readConfig(CONFIG_ROOT, VIDEO_ROOT);\r\n  if (!cfg.smbUsername || !cfg.smbPassword) {\r\n    smbConnection = { state: \"unconfigured\", mounted: false, error: \"Save NAS share username and password to mount the library.\" };\r\n    VIDEO_ROOT = FALLBACK_VIDEO_ROOT;\r\n    return smbConnection;\r\n  }\r\n  const mounted = mountCifs({\r\n    host: cfg.smbHost,\r\n    share: cfg.smbShare,\r\n    username: cfg.smbUsername,\r\n    password: cfg.smbPassword,\r\n    target: NAS_MOUNT_POINT,\r\n    configRoot: CONFIG_ROOT\r\n  });\r\n  if (!mounted.ok) {\r\n    smbConnection = { state: \"error\", mounted: false, error: mounted.error };\r\n    VIDEO_ROOT = FALLBACK_VIDEO_ROOT;\r\n    return smbConnection;\r\n  }\r\n  VIDEO_ROOT = videosRootFromMount(NAS_MOUNT_POINT, cfg.smbVideos);\r\n  smbConnection = { state: \"connected\", mounted: true, error: null };\r\n  return smbConnection;\r\n}\r\n\r\nfunction sendJson(res, status, body) {\r\n  const payload = JSON.stringify(body);\r\n  res.writeHead(status, {\r\n    \"Content-Type\": \"application/json; charset=utf-8\",\r\n    \"Cache-Control\": \"no-store\",\r\n    \"Content-Length\": Buffer.byteLength(payload)\r\n  });\r\n  res.end(payload);\r\n}\r\n\r\nfunction sendText(res, status, text) {\r\n  res.writeHead(status, { \"Content-Type\": \"text/plain; charset=utf-8\" });\r\n  res.end(text);\r\n}\r\n\r\nfunction isInside(root, target) {\r\n  const rel = path.relative(root, target);\r\n  return Boolean(rel) && !rel.startsWith(\"..\") && !path.isAbsolute(rel);\r\n}\r\n\r\nfunction readBody(req, limit = 200_000) {\r\n  return new Promise((resolve, reject) => {\r\n    const chunks = [];\r\n    let size = 0;\r\n    req.on(\"data\", (chunk) => {\r\n      size += chunk.length;\r\n      if (size > limit) {\r\n        reject(new Error(\"Request body too large\"));\r\n        req.destroy();\r\n        return;\r\n      }\r\n      chunks.push(chunk);\r\n    });\r\n    req.on(\"end\", () => resolve(Buffer.concat(chunks).toString(\"utf8\")));\r\n    req.on(\"error\", reject);\r\n  });\r\n}\r\n\r\nfunction mountStatus(videoRoot = VIDEO_ROOT, io = fs) {\r\n  return ensureFreezer(videoRoot, io);\r\n}\r\n\r\nfunction ratesPayload() {\r\n  const downloadBps = downloadRate.bps();\r\n  const uploadBps = uploadRate.bps();\r\n  return {\r\n    downloadBps,\r\n    uploadBps,\r\n    downloadLabel: formatBps(downloadBps),\r\n    uploadLabel: formatBps(uploadBps)\r\n  };\r\n}\r\n\r\nfunction statusPayload() {\r\n  const scan = scanFreezer(VIDEO_ROOT);\r\n  const queues = queueBuckets(scan, current?.rel);\r\n  const mount = mountStatus();\r\n  return {\r\n    ok: true,\r\n    running,\r\n    cooling: Boolean(cooling || current),\r\n    videoRoot: VIDEO_ROOT,\r\n    freezerExists: mount.freezerExists,\r\n    connection: {\r\n      mount,\r\n      nas: nasConnection,\r\n      smb: smbConnection,\r\n      settings: publicConfig(readConfig(CONFIG_ROOT, VIDEO_ROOT))\r\n    },\r\n    rates: ratesPayload(),\r\n    current,\r\n    catalog: {\r\n      movies: scan.movies,\r\n      shows: scan.shows\r\n    },\r\n    pending: queues.pending,\r\n    encoding: queues.encoding,\r\n    failed: queues.failed\r\n  };\r\n}\r\n\r\nfunction nextPendingFile(scan) {\r\n  for (const file of scan.files) {\r\n    const decision = shouldEncode(file.abs, {\r\n      videoRoot: VIDEO_ROOT,\r\n      meta: readSidecar(file.abs)\r\n    });\r\n    if (!decision.skip) return file;\r\n  }\r\n  return null;\r\n}\r\n\r\nfunction applyJobProgress(job, info) {\r\n  if (info.stage === \"download\") {\r\n    const done = Number(info.bytesDone) || 0;\r\n    const delta = done - lastDownloadBytes;\r\n    if (delta > 0) downloadRate.add(delta);\r\n    lastDownloadBytes = done;\r\n    lastUploadBytes = 0;\r\n  } else if (info.stage === \"upload\") {\r\n    const done = Number(info.bytesDone) || 0;\r\n    const delta = done - lastUploadBytes;\r\n    if (delta > 0) uploadRate.add(delta);\r\n    lastUploadBytes = done;\r\n    lastDownloadBytes = 0;\r\n  } else {\r\n    lastDownloadBytes = 0;\r\n    lastUploadBytes = 0;\r\n  }\r\n  current = {\r\n    id: job.id,\r\n    title: job.title,\r\n    rel: job.rel,\r\n    kind: job.kind || \"movie\",\r\n    episodeCount: job.episodeCount,\r\n    posterRel: job.posterRel,\r\n    stage: info.stage,\r\n    percent: Number(info.percent) || 0,\r\n    bytesDone: Number(info.bytesDone) || 0,\r\n    bytesTotal: Number(info.bytesTotal) || 0,\r\n    outTimeSec: Number(info.outTimeSec) || 0,\r\n    durationSec: Number(info.durationSec) || 0,\r\n    fps: Number(info.fps) || 0,\r\n    speed: info.speed || \"\"\r\n  };\r\n}\r\n\r\nasync function pingNas() {\r\n  const origin = nasOrigin || resolveNasOrigin(VIDEO_ROOT);\r\n  applyNasOrigin(origin);\r\n  try {\r\n    const health = new URL(\"/api/health\", origin);\r\n    const client = health.protocol === \"https:\" ? https : http;\r\n    await new Promise((resolve) => {\r\n      const req = client.request(health, { method: \"GET\" }, (res) => {\r\n        const chunks = [];\r\n        res.on(\"data\", (chunk) => chunks.push(chunk));\r\n        res.on(\"end\", () => {\r\n          if (res.statusCode >= 200 && res.statusCode < 300) {\r\n            nasConnection = { state: \"connected\", origin, url: nasStatusUrl(origin), error: null };\r\n          } else {\r\n            nasConnection = {\r\n              state: \"error\",\r\n              origin,\r\n              url: nasStatusUrl(origin),\r\n              error: `NAS responded ${res.statusCode}`\r\n            };\r\n          }\r\n          resolve();\r\n        });\r\n      });\r\n      req.on(\"error\", (error) => {\r\n        nasConnection = {\r\n          state: \"disconnected\",\r\n          origin,\r\n          url: nasStatusUrl(origin),\r\n          error: error.message || \"NAS unreachable\"\r\n        };\r\n        resolve();\r\n      });\r\n      req.setTimeout(4000, () => {\r\n        req.destroy();\r\n        nasConnection = { state: \"disconnected\", origin, url: nasStatusUrl(origin), error: \"NAS timed out\" };\r\n        resolve();\r\n      });\r\n      req.end();\r\n    });\r\n  } catch (error) {\r\n    nasConnection = {\r\n      state: \"error\",\r\n      origin,\r\n      url: nasStatusUrl(origin),\r\n      error: error.message || \"NAS URL invalid\"\r\n    };\r\n  }\r\n}\r\n\r\nasync function notifyNas() {\r\n  const origin = nasOrigin || resolveNasOrigin(VIDEO_ROOT);\r\n  try {\r\n    const url = new URL(nasStatusUrl(origin));\r\n    const body = JSON.stringify({ ok: true, source: \"freezer-worker\", current, running, cooling });\r\n    const client = url.protocol === \"https:\" ? https : http;\r\n    await new Promise((resolve) => {\r\n      const req = client.request(\r\n        url,\r\n        {\r\n          method: \"POST\",\r\n          headers: { \"Content-Type\": \"application/json\", \"Content-Length\": Buffer.byteLength(body) }\r\n        },\r\n        (res) => {\r\n          res.resume();\r\n          res.on(\"end\", resolve);\r\n        }\r\n      );\r\n      req.on(\"error\", () => resolve());\r\n      req.setTimeout(4000, () => {\r\n        req.destroy();\r\n        resolve();\r\n      });\r\n      req.end(body);\r\n    });\r\n  } catch {\r\n    // optional\r\n  }\r\n}\r\n\r\nasync function encodeLoop() {\r\n  if (loopBusy) return;\r\n  loopBusy = true;\r\n  try {\r\n    while (running) {\r\n      const scan = scanFreezer(VIDEO_ROOT);\r\n      const job = nextPendingFile(scan);\r\n      if (!job) {\r\n        cooling = false;\r\n        current = null;\r\n        lastDownloadBytes = 0;\r\n        lastUploadBytes = 0;\r\n        await new Promise((resolve) => setTimeout(resolve, SCAN_MS));\r\n        continue;\r\n      }\r\n      cooling = true;\r\n      lastDownloadBytes = 0;\r\n      lastUploadBytes = 0;\r\n      current = { id: job.id, title: job.title, rel: job.rel, kind: job.kind || \"movie\", stage: \"download\", percent: 0 };\r\n      await compressPlaybackFile(job.abs, {\r\n        videoRoot: VIDEO_ROOT,\r\n        onProgress: (info) => applyJobProgress(job, info)\r\n      });\r\n      current = null;\r\n      lastDownloadBytes = 0;\r\n      lastUploadBytes = 0;\r\n      await notifyNas();\r\n    }\r\n  } finally {\r\n    cooling = false;\r\n    current = null;\r\n    loopBusy = false;\r\n  }\r\n}\r\n\r\nfunction startFreezer() {\r\n  running = true;\r\n  encodeLoop().catch(() => {\r\n    running = false;\r\n  });\r\n  return { ok: true, running: true, action: \"start\" };\r\n}\r\n\r\nfunction coolDown() {\r\n  running = true;\r\n  cooling = true;\r\n  encodeLoop().catch(() => {\r\n    running = false;\r\n    cooling = false;\r\n  });\r\n  return { ok: true, running: true, cooling: true, action: \"cool-down\" };\r\n}\r\n\r\nfunction serveStatic(res, urlPath) {\r\n  const rel = urlPath === \"/\" ? \"index.html\" : urlPath.replace(/^\\/+/, \"\");\r\n  const abs = path.resolve(PUBLIC_DIR, rel);\r\n  if (!isInside(PUBLIC_DIR, abs) && abs !== path.join(PUBLIC_DIR, \"index.html\")) {\r\n    sendText(res, 403, \"Forbidden\");\r\n    return;\r\n  }\r\n  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {\r\n    sendText(res, 404, \"Not found\");\r\n    return;\r\n  }\r\n  const ext = path.extname(abs).toLowerCase();\r\n  res.writeHead(200, {\r\n    \"Content-Type\": MIME[ext] || \"application/octet-stream\",\r\n    \"Cache-Control\": \"no-store\"\r\n  });\r\n  fs.createReadStream(abs).pipe(res);\r\n}\r\n\r\nfunction servePoster(res, rel) {\r\n  const abs = path.resolve(VIDEO_ROOT, ...toPosixSafe(rel));\r\n  if (!isInside(VIDEO_ROOT, abs) && abs !== VIDEO_ROOT) {\r\n    sendText(res, 403, \"Forbidden\");\r\n    return;\r\n  }\r\n  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {\r\n    sendText(res, 404, \"Not found\");\r\n    return;\r\n  }\r\n  const ext = path.extname(abs).toLowerCase();\r\n  if (![\".jpg\", \".jpeg\", \".png\", \".webp\"].includes(ext)) {\r\n    sendText(res, 404, \"Not found\");\r\n    return;\r\n  }\r\n  res.writeHead(200, {\r\n    \"Content-Type\": MIME[ext] || \"image/jpeg\",\r\n    \"Cache-Control\": \"no-store\"\r\n  });\r\n  fs.createReadStream(abs).pipe(res);\r\n}\r\n\r\nfunction toPosixSafe(rel) {\r\n  return String(rel || \"\")\r\n    .split(/[/\\\\]/)\r\n    .filter((part) => part && part !== \".\" && part !== \"..\");\r\n}\r\n\r\nasync function handle(req, res) {\r\n  const url = new URL(req.url || \"/\", `http://${req.headers.host || \"localhost\"}`);\r\n  const pathname = url.pathname;\r\n\r\n  if (pathname === \"/api/status\" && req.method === \"GET\") {\r\n    sendJson(res, 200, statusPayload());\r\n    return;\r\n  }\r\n  if (pathname === \"/api/health\" && req.method === \"GET\") {\r\n    const mount = mountStatus();\r\n    sendJson(res, 200, {\r\n      ok: true,\r\n      app: \"CinaRip Freezer Worker\",\r\n      running,\r\n      cooling,\r\n      freezerExists: mount.freezerExists,\r\n      connection: { mount, nas: nasConnection, smb: smbConnection }\r\n    });\r\n    return;\r\n  }\r\n  if (pathname === \"/api/start\" && req.method === \"POST\") {\r\n    await readBody(req).catch(() => \"\");\r\n    sendJson(res, 200, { ...startFreezer(), ...statusPayload() });\r\n    return;\r\n  }\r\n  if (pathname === \"/api/cool-down\" && req.method === \"POST\") {\r\n    await readBody(req).catch(() => \"\");\r\n    sendJson(res, 200, { ...coolDown(), ...statusPayload() });\r\n    return;\r\n  }\r\n  if (pathname === \"/api/poster\" && req.method === \"GET\") {\r\n    servePoster(res, url.searchParams.get(\"rel\") || \"\");\r\n    return;\r\n  }\r\n  if (pathname === \"/api/nas\" && req.method === \"POST\") {\r\n    const raw = await readBody(req).catch(() => \"\");\r\n    let body = {};\r\n    try {\r\n      body = raw ? JSON.parse(raw) : {};\r\n    } catch {\r\n      sendJson(res, 400, { ok: false, error: \"NAS URL JSON was invalid\" });\r\n      return;\r\n    }\r\n    try {\r\n      const patch = {\r\n        nasOrigin: body.origin || body.url || body.nasOrigin,\r\n        smbHost: body.host || body.smbHost,\r\n        smbShare: body.share || body.smbShare,\r\n        smbVideos: body.videosPath != null ? body.videosPath : body.smbVideos,\r\n        smbUsername: body.username != null ? body.username : body.smbUsername\r\n      };\r\n      if (body.password || body.smbPassword) patch.smbPassword = body.password || body.smbPassword;\r\n      const cfg = writeConfig(CONFIG_ROOT, VIDEO_ROOT, patch);\r\n      applyNasOrigin(cfg.nasOrigin);\r\n      applyShareMount();\r\n      mountStatus();\r\n      await pingNas();\r\n      sendJson(res, 200, { ok: true, origin: cfg.nasOrigin, ...statusPayload() });\r\n    } catch (error) {\r\n      sendJson(res, 400, { ok: false, error: error.message || \"Could not save NAS settings\" });\r\n    }\r\n    return;\r\n  }\r\n  if (pathname.startsWith(\"/api/\")) {\r\n    sendJson(res, 404, { ok: false, error: \"Unknown API route\", path: pathname });\r\n    return;\r\n  }\r\n  serveStatic(res, pathname);\r\n}\r\n\r\nfunction start() {\r\n  applyShareMount();\r\n  const mount = mountStatus();\r\n  loadNasOrigin();\r\n  pingNas().catch(() => {});\r\n  setInterval(() => {\r\n    pingNas().catch(() => {});\r\n  }, 5000);\r\n  const server = http.createServer((req, res) => {\r\n    handle(req, res).catch((error) => {\r\n      sendJson(res, 500, { ok: false, error: error.message || \"Server error\" });\r\n    });\r\n  });\r\n  server.listen(PORT, \"0.0.0.0\", () => {\r\n    const cfg = readConfig(CONFIG_ROOT, VIDEO_ROOT);\r\n    console.log(`CinaRip Freezer Worker listening on ${PORT}`);\r\n    console.log(`Videos: ${VIDEO_ROOT} freezer=${mount.freezerExists} created=${mount.created} writable=${mount.writable} state=${mount.state}`);\r\n    console.log(`NAS HTTP: ${nasOrigin}`);\r\n    console.log(`NAS share: ${cfg.smbHost}/${cfg.smbShare}/${cfg.smbVideos} user=${cfg.smbUsername || \"(none)\"}`);\r\n    console.log(\"Open the worker page, then click Start Freezer or Cool Down. Encoding does not start by itself.\");\r\n  });\r\n}\r\n\r\nif (require.main === module) start();\r\n\r\nmodule.exports = { startFreezer, coolDown, statusPayload, VIDEO_ROOT, mountStatus, loadNasOrigin };\r\n"},{"name":"cinarip-freezer-worker/lib/encode.js","encoding":"utf8","data":"\"use strict\";\r\n\r\nconst fs = require(\"fs\");\r\nconst path = require(\"path\");\r\nconst { spawn } = require(\"child_process\");\r\nconst { parseFfmpegProgress, encodePercent, copyFileWithProgress } = require(\"./progress\");\r\n\r\nconst FREEZER_DIR = \"Freezer\";\r\nconst ORIGINALS_DIR = \".originals\";\r\nconst COMPRESS_SIDECAR_SUFFIX = \".cinarip-compress.json\";\r\nconst VIDEO_EXT_PATTERN = /\\.(mp4|mkv|mov|m4v|webm|ts)$/i;\r\nconst MAX_RETRIES = 3;\r\nconst STALE_ENCODING_MS = 3 * 60 * 60 * 1000;\r\n\r\nfunction fileSize(filePath) {\r\n  try {\r\n    const stat = fs.statSync(filePath);\r\n    return stat.isFile() ? stat.size : 0;\r\n  } catch {\r\n    return 0;\r\n  }\r\n}\r\n\r\nfunction toPosixRel(rel) {\r\n  return String(rel || \"\")\r\n    .split(/[/\\\\]/)\r\n    .filter((part) => part && part !== \".\" && part !== \"..\")\r\n    .join(\"/\");\r\n}\r\n\r\nfunction isOriginalVideoName(name) {\r\n  return /\\.original\\.(mp4|mkv|mov|m4v|webm|ts)$/i.test(String(name || \"\"));\r\n}\r\n\r\nfunction isTempEncodeName(name) {\r\n  return /\\.cinarip-(?:freeze|compress|restore)\\.tmp\\./i.test(String(name || \"\"));\r\n}\r\n\r\nfunction sidecarPathForVideo(videoPath) {\r\n  return `${videoPath}${COMPRESS_SIDECAR_SUFFIX}`;\r\n}\r\n\r\nfunction readSidecar(videoPath) {\r\n  const filePath = sidecarPathForVideo(videoPath);\r\n  try {\r\n    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;\r\n    const parsed = JSON.parse(fs.readFileSync(filePath, \"utf8\"));\r\n    return parsed && typeof parsed === \"object\" ? parsed : null;\r\n  } catch {\r\n    return null;\r\n  }\r\n}\r\n\r\nfunction writeSidecar(videoPath, meta) {\r\n  const filePath = sidecarPathForVideo(videoPath);\r\n  const payload = {\r\n    version: 1,\r\n    ...meta,\r\n    updatedAt: meta?.updatedAt || new Date().toISOString()\r\n  };\r\n  fs.mkdirSync(path.dirname(filePath), { recursive: true });\r\n  const tmp = `${filePath}.tmp`;\r\n  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\\n`);\r\n  fs.renameSync(tmp, filePath);\r\n  return payload;\r\n}\r\n\r\nfunction durationClose(sourceSec, encodedSec, toleranceSec = 2, toleranceRatio = 0.02) {\r\n  const a = Number(sourceSec);\r\n  const b = Number(encodedSec);\r\n  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false;\r\n  const allowed = Math.max(Number(toleranceSec) || 2, Math.abs(a) * (Number(toleranceRatio) || 0.02));\r\n  return Math.abs(a - b) <= allowed;\r\n}\r\n\r\nfunction verifyEncoded(sourceProbe, destProbe, destSize, options = {}) {\r\n  if (!destSize || destSize <= 0) {\r\n    return { ok: false, reason: \"encoded file is empty\" };\r\n  }\r\n  if (!destProbe?.hasVideo) {\r\n    return { ok: false, reason: \"encoded file has no video stream\" };\r\n  }\r\n  if (sourceProbe?.hasAudio && !destProbe.hasAudio) {\r\n    return { ok: false, reason: \"encoded file is missing audio\" };\r\n  }\r\n  if (!sourceProbe?.hasAudio && !destProbe.hasAudio && !destProbe.hasVideo) {\r\n    return { ok: false, reason: \"encoded file has no audio or video\" };\r\n  }\r\n  if (!durationClose(sourceProbe?.duration, destProbe?.duration, options.toleranceSec, options.toleranceRatio)) {\r\n    return {\r\n      ok: false,\r\n      reason: `duration mismatch (source ${sourceProbe?.duration}s vs encoded ${destProbe?.duration}s)`\r\n    };\r\n  }\r\n  return { ok: true };\r\n}\r\n\r\nfunction isStaleEncoding(meta, now = Date.now()) {\r\n  if (meta?.status !== \"encoding\") return false;\r\n  const updated = Date.parse(meta.updatedAt || \"\") || 0;\r\n  if (!updated) return true;\r\n  return now - updated > STALE_ENCODING_MS;\r\n}\r\n\r\nfunction originalVaultPath(videoRoot, playbackPath) {\r\n  const freezerRoot = path.join(videoRoot, FREEZER_DIR);\r\n  const rel = path.relative(freezerRoot, playbackPath);\r\n  if (!rel || rel.startsWith(\"..\") || path.isAbsolute(rel)) {\r\n    const parsed = path.parse(playbackPath);\r\n    return path.join(parsed.dir, `${parsed.name}.original${parsed.ext}`);\r\n  }\r\n  return path.join(freezerRoot, ORIGINALS_DIR, rel);\r\n}\r\n\r\nfunction findOriginal(videoRoot, playbackPath, meta) {\r\n  if (meta?.originalRel) {\r\n    const fromMeta = path.join(videoRoot, ...toPosixRel(meta.originalRel).split(\"/\"));\r\n    if (fs.existsSync(fromMeta) && fileSize(fromMeta) > 0) return fromMeta;\r\n  }\r\n  const vault = originalVaultPath(videoRoot, playbackPath);\r\n  if (fs.existsSync(vault) && fileSize(vault) > 0) return vault;\r\n  const parsed = path.parse(playbackPath);\r\n  const exts = [\".mp4\", \".mkv\", \".mov\", \".m4v\", \".webm\", \".ts\"];\r\n  for (const ext of exts) {\r\n    const sibling = path.join(parsed.dir, `${parsed.name}.original${ext}`);\r\n    if (fs.existsSync(sibling) && fileSize(sibling) > 0) return sibling;\r\n  }\r\n  const vaultDir = path.dirname(vault);\r\n  const base = path.basename(vault, path.extname(vault));\r\n  if (fs.existsSync(vaultDir)) {\r\n    for (const name of fs.readdirSync(vaultDir)) {\r\n      if (!VIDEO_EXT_PATTERN.test(name) || isTempEncodeName(name)) continue;\r\n      if (name.replace(VIDEO_EXT_PATTERN, \"\").toLowerCase() !== base.toLowerCase()) continue;\r\n      const abs = path.join(vaultDir, name);\r\n      if (fileSize(abs) > 0) return abs;\r\n    }\r\n  }\r\n  return null;\r\n}\r\n\r\nfunction shouldEncode(playbackPath, options = {}) {\r\n  const name = path.basename(playbackPath);\r\n  if (isOriginalVideoName(name) || isTempEncodeName(name)) {\r\n    return { skip: true, reason: \"not a playback file\" };\r\n  }\r\n  const meta = options.meta !== undefined ? options.meta : readSidecar(playbackPath);\r\n  if (meta?.status === \"done\") return { skip: true, reason: \"already compressed\" };\r\n  if (meta?.status === \"restored\") return { skip: true, reason: \"original restored\" };\r\n  if (meta?.status === \"encoding\" && !isStaleEncoding(meta, options.now)) {\r\n    return { skip: true, reason: \"encoding in progress\" };\r\n  }\r\n  if (meta?.status === \"failed\" && Number(meta.retries || 0) >= MAX_RETRIES) {\r\n    return { skip: true, reason: \"failed too many times\" };\r\n  }\r\n  const originalAbs =\r\n    options.originalAbs ||\r\n    (options.videoRoot ? findOriginal(options.videoRoot, playbackPath, meta) : null);\r\n  if (originalAbs && fs.existsSync(originalAbs) && !meta) {\r\n    return { skip: true, reason: \"already compressed\" };\r\n  }\r\n  return { skip: false };\r\n}\r\n\r\nasync function ensureOriginalCopy(videoRoot, playbackPath, onBytes) {\r\n  const existing = findOriginal(videoRoot, playbackPath, readSidecar(playbackPath));\r\n  if (existing && fileSize(existing) > 0) return { path: existing, copied: false };\r\n  const dest = originalVaultPath(videoRoot, playbackPath);\r\n  if (onBytes) {\r\n    await copyFileWithProgress(playbackPath, dest, onBytes);\r\n  } else {\r\n    fs.mkdirSync(path.dirname(dest), { recursive: true });\r\n    fs.copyFileSync(playbackPath, dest);\r\n  }\r\n  if (fileSize(dest) <= 0) {\r\n    try {\r\n      fs.unlinkSync(dest);\r\n    } catch {\r\n      // ignore\r\n    }\r\n    throw new Error(\"Original backup is empty\");\r\n  }\r\n  return { path: dest, copied: true };\r\n}\r\n\r\nfunction parseProbeJson(raw) {\r\n  let parsed;\r\n  try {\r\n    parsed = JSON.parse(String(raw || \"{}\"));\r\n  } catch {\r\n    return { duration: 0, hasVideo: false, hasAudio: false };\r\n  }\r\n  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];\r\n  const duration = Number(parsed.format?.duration || streams.find((stream) => stream.duration)?.duration || 0);\r\n  return {\r\n    duration,\r\n    hasVideo: streams.some((stream) => stream.codec_type === \"video\"),\r\n    hasAudio: streams.some((stream) => stream.codec_type === \"audio\")\r\n  };\r\n}\r\n\r\nfunction runCommand(bin, args, options = {}) {\r\n  const spawnFn = options.spawn || spawn;\r\n  return new Promise((resolve) => {\r\n    let child;\r\n    try {\r\n      child = spawnFn(bin, args, { windowsHide: true });\r\n    } catch (error) {\r\n      resolve({ ok: false, reason: error.message || \"spawn failed\", stdout: \"\", code: -1 });\r\n      return;\r\n    }\r\n    let stdout = \"\";\r\n    let stderr = \"\";\r\n    if (child.stdout) child.stdout.on(\"data\", (chunk) => { stdout += chunk; });\r\n    if (child.stderr) child.stderr.on(\"data\", (chunk) => { stderr += chunk; });\r\n    child.on(\"error\", (error) => {\r\n      resolve({ ok: false, reason: error.message || \"command failed\", stdout, stderr, code: -1 });\r\n    });\r\n    child.on(\"close\", (code) => {\r\n      resolve({\r\n        ok: code === 0,\r\n        code,\r\n        stdout,\r\n        stderr,\r\n        reason: code === 0 ? undefined : `exited ${code}`\r\n      });\r\n    });\r\n  });\r\n}\r\n\r\nasync function probeMedia(filePath, options = {}) {\r\n  if (options.probeFn) return options.probeFn(filePath);\r\n  const bin = options.ffprobeBin || \"ffprobe\";\r\n  const result = await runCommand(\r\n    bin,\r\n    [\"-v\", \"error\", \"-print_format\", \"json\", \"-show_format\", \"-show_streams\", filePath],\r\n    options\r\n  );\r\n  if (!result.ok) {\r\n    return { duration: 0, hasVideo: false, hasAudio: false, error: result.reason || result.stderr };\r\n  }\r\n  return parseProbeJson(result.stdout);\r\n}\r\n\r\nasync function encodeWithFfmpeg(srcPath, destTmpPath, options = {}) {\r\n  if (options.encodeFn) return options.encodeFn(srcPath, destTmpPath);\r\n  const bin = options.ffmpegBin || \"ffmpeg\";\r\n  const threads = String(options.threads || process.env.FFMPEG_THREADS || \"2\");\r\n  const crf = String(options.crf || process.env.FFMPEG_CRF || \"24\");\r\n  const durationSec = Number(options.durationSec) || 0;\r\n  const args = [\r\n    \"-y\",\r\n    \"-hide_banner\",\r\n    \"-loglevel\",\r\n    \"error\",\r\n    \"-progress\",\r\n    \"pipe:1\",\r\n    \"-nostats\",\r\n    \"-i\",\r\n    srcPath,\r\n    \"-threads\",\r\n    threads,\r\n    \"-map\",\r\n    \"0:v:0\",\r\n    \"-map\",\r\n    \"0:a:0?\",\r\n    \"-vf\",\r\n    \"scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2\",\r\n    \"-c:v\",\r\n    \"libx264\",\r\n    \"-preset\",\r\n    options.preset || process.env.FFMPEG_PRESET || \"medium\",\r\n    \"-crf\",\r\n    crf,\r\n    \"-c:a\",\r\n    \"aac\",\r\n    \"-b:a\",\r\n    \"128k\",\r\n    \"-ac\",\r\n    \"2\",\r\n    \"-movflags\",\r\n    \"+faststart\",\r\n    destTmpPath\r\n  ];\r\n  const spawnFn = options.spawn || spawn;\r\n  const result = await new Promise((resolve) => {\r\n    let child;\r\n    try {\r\n      child = spawnFn(bin, args, { windowsHide: true });\r\n    } catch (error) {\r\n      resolve({ ok: false, reason: error.message || \"ffmpeg spawn failed\", code: -1 });\r\n      return;\r\n    }\r\n    let parsed = {};\r\n    let stderr = \"\";\r\n    if (child.stdout) {\r\n      child.stdout.on(\"data\", (chunk) => {\r\n        parsed = parseFfmpegProgress(chunk, parsed);\r\n        if (options.onEncodeProgress) {\r\n          options.onEncodeProgress({\r\n            ...parsed,\r\n            percent: encodePercent(parsed, durationSec),\r\n            durationSec\r\n          });\r\n        }\r\n      });\r\n    }\r\n    if (child.stderr) {\r\n      child.stderr.on(\"data\", (chunk) => {\r\n        stderr += chunk;\r\n      });\r\n    }\r\n    child.on(\"error\", (error) => {\r\n      resolve({ ok: false, reason: error.message || \"ffmpeg failed\", stderr, code: -1 });\r\n    });\r\n    child.on(\"close\", (code) => {\r\n      resolve({\r\n        ok: code === 0,\r\n        code,\r\n        stderr,\r\n        progress: parsed,\r\n        reason: code === 0 ? undefined : `ffmpeg exited ${code}`\r\n      });\r\n    });\r\n  });\r\n  if (!result.ok || fileSize(destTmpPath) <= 0) {\r\n    try {\r\n      fs.unlinkSync(destTmpPath);\r\n    } catch {\r\n      // ignore\r\n    }\r\n    return { ok: false, reason: result.reason || \"ffmpeg output empty\" };\r\n  }\r\n  return { ok: true, progress: result.progress };\r\n}\r\n\r\nasync function replacePlaybackWithTemp(srcPath, tmpPath, options = {}) {\r\n  const dir = path.dirname(srcPath);\r\n  const base = path.basename(srcPath, path.extname(srcPath));\r\n  const finalPath = path.join(dir, `${base}.mp4`);\r\n  let staged = tmpPath;\r\n  if (options.onUploadBytes) {\r\n    const uploadTmp = `${finalPath}.cinarip-upload.tmp.mp4`;\r\n    await copyFileWithProgress(tmpPath, uploadTmp, options.onUploadBytes);\r\n    try {\r\n      fs.unlinkSync(tmpPath);\r\n    } catch {\r\n      // ignore\r\n    }\r\n    staged = uploadTmp;\r\n  }\r\n  if (path.resolve(finalPath) === path.resolve(srcPath)) {\r\n    const bak = `${srcPath}.cinarip-compress.bak`;\r\n    fs.renameSync(srcPath, bak);\r\n    try {\r\n      fs.renameSync(staged, srcPath);\r\n      if (fileSize(srcPath) <= 0) throw new Error(\"encoded file is empty\");\r\n      fs.unlinkSync(bak);\r\n      return srcPath;\r\n    } catch (error) {\r\n      try {\r\n        if (fs.existsSync(staged)) fs.unlinkSync(staged);\r\n      } catch {\r\n        // ignore\r\n      }\r\n      if (!fs.existsSync(srcPath) && fs.existsSync(bak)) fs.renameSync(bak, srcPath);\r\n      throw error;\r\n    }\r\n  }\r\n  if (fs.existsSync(finalPath)) throw new Error(\"Encoded destination already exists\");\r\n  fs.renameSync(staged, finalPath);\r\n  try {\r\n    fs.unlinkSync(srcPath);\r\n  } catch {\r\n    // ignore\r\n  }\r\n  const oldSidecar = sidecarPathForVideo(srcPath);\r\n  if (fs.existsSync(oldSidecar) && path.resolve(oldSidecar) !== path.resolve(sidecarPathForVideo(finalPath))) {\r\n    try {\r\n      fs.unlinkSync(oldSidecar);\r\n    } catch {\r\n      // ignore\r\n    }\r\n  }\r\n  return finalPath;\r\n}\r\n\r\nasync function compressPlaybackFile(playbackPath, options = {}) {\r\n  const videoRoot = options.videoRoot;\r\n  const notify = options.onProgress || (() => {});\r\n  if (!videoRoot) return { ok: false, skipped: false, reason: \"videoRoot required\" };\r\n  const meta = readSidecar(playbackPath);\r\n  const decision = shouldEncode(playbackPath, { ...options, meta, videoRoot });\r\n  if (decision.skip) {\r\n    return { ok: true, skipped: true, reason: decision.reason, status: meta?.status || \"done\" };\r\n  }\r\n\r\n  const retries = Number(meta?.retries || 0);\r\n  let originalAbs = null;\r\n  const tmp = `${playbackPath}.cinarip-compress.tmp.mp4`;\r\n  try {\r\n    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);\r\n  } catch {\r\n    // ignore\r\n  }\r\n\r\n  try {\r\n    const backup = await ensureOriginalCopy(videoRoot, playbackPath, (xfer) => {\r\n      notify({\r\n        stage: \"download\",\r\n        percent: xfer.percent,\r\n        bytesDone: xfer.copied,\r\n        bytesTotal: xfer.total\r\n      });\r\n    });\r\n    originalAbs = backup.path;\r\n    writeSidecar(playbackPath, {\r\n      status: \"encoding\",\r\n      originalKept: true,\r\n      originalRel: toPosixRel(path.relative(videoRoot, originalAbs)),\r\n      retries,\r\n      error: null,\r\n      sourceSize: fileSize(playbackPath)\r\n    });\r\n\r\n    const sourceProbe = await probeMedia(playbackPath, options);\r\n    if (!sourceProbe.hasVideo) {\r\n      throw new Error(\"source has no video stream\");\r\n    }\r\n\r\n    notify({\r\n      stage: \"encode\",\r\n      percent: 0,\r\n      outTimeSec: 0,\r\n      durationSec: sourceProbe.duration,\r\n      fps: 0\r\n    });\r\n    const encoded = await encodeWithFfmpeg(playbackPath, tmp, {\r\n      ...options,\r\n      durationSec: sourceProbe.duration,\r\n      onEncodeProgress: (progress) => {\r\n        notify({\r\n          stage: \"encode\",\r\n          percent: progress.percent,\r\n          outTimeSec: progress.outTimeSec,\r\n          durationSec: progress.durationSec,\r\n          fps: progress.fps,\r\n          speed: progress.speed\r\n        });\r\n      }\r\n    });\r\n    if (!encoded.ok) throw new Error(encoded.reason || \"ffmpeg encode failed\");\r\n\r\n    const destProbe = await probeMedia(tmp, options);\r\n    const verified = verifyEncoded(sourceProbe, destProbe, fileSize(tmp), options);\r\n    if (!verified.ok) throw new Error(verified.reason);\r\n\r\n    notify({ stage: \"upload\", percent: 0, bytesDone: 0, bytesTotal: fileSize(tmp) });\r\n    const finalPath = await replacePlaybackWithTemp(playbackPath, tmp, {\r\n      onUploadBytes: (xfer) => {\r\n        notify({\r\n          stage: \"upload\",\r\n          percent: xfer.percent,\r\n          bytesDone: xfer.copied,\r\n          bytesTotal: xfer.total\r\n        });\r\n      }\r\n    });\r\n    writeSidecar(finalPath, {\r\n      status: \"done\",\r\n      originalKept: true,\r\n      originalRel: toPosixRel(path.relative(videoRoot, originalAbs)),\r\n      retries: 0,\r\n      error: null,\r\n      sourceSize: sourceProbe.size || fileSize(originalAbs),\r\n      encodedSize: fileSize(finalPath),\r\n      sourceDurationSec: sourceProbe.duration,\r\n      encodedDurationSec: destProbe.duration\r\n    });\r\n    notify({ stage: \"done\", percent: 100 });\r\n    return {\r\n      ok: true,\r\n      skipped: false,\r\n      status: \"done\",\r\n      path: finalPath,\r\n      originalKept: true\r\n    };\r\n  } catch (error) {\r\n    try {\r\n      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);\r\n    } catch {\r\n      // ignore\r\n    }\r\n    try {\r\n      const uploadTmp = `${path.join(path.dirname(playbackPath), `${path.basename(playbackPath, path.extname(playbackPath))}.mp4`)}.cinarip-upload.tmp.mp4`;\r\n      if (fs.existsSync(uploadTmp)) fs.unlinkSync(uploadTmp);\r\n    } catch {\r\n      // ignore\r\n    }\r\n    const reason = error.message || \"encode failed\";\r\n    writeSidecar(playbackPath, {\r\n      status: \"failed\",\r\n      originalKept: Boolean(originalAbs && fs.existsSync(originalAbs)),\r\n      originalRel: originalAbs ? toPosixRel(path.relative(videoRoot, originalAbs)) : meta?.originalRel || null,\r\n      retries: retries + 1,\r\n      error: reason\r\n    });\r\n    return { ok: false, skipped: false, status: \"failed\", reason };\r\n  }\r\n}\r\n\r\nmodule.exports = {\r\n  FREEZER_DIR,\r\n  ORIGINALS_DIR,\r\n  COMPRESS_SIDECAR_SUFFIX,\r\n  MAX_RETRIES,\r\n  fileSize,\r\n  toPosixRel,\r\n  isOriginalVideoName,\r\n  isTempEncodeName,\r\n  sidecarPathForVideo,\r\n  readSidecar,\r\n  writeSidecar,\r\n  durationClose,\r\n  verifyEncoded,\r\n  shouldEncode,\r\n  originalVaultPath,\r\n  findOriginal,\r\n  ensureOriginalCopy,\r\n  parseProbeJson,\r\n  probeMedia,\r\n  encodeWithFfmpeg,\r\n  replacePlaybackWithTemp,\r\n  compressPlaybackFile,\r\n  parseFfmpegProgress,\r\n  encodePercent\r\n};\r\n"},{"name":"cinarip-freezer-worker/lib/scan.js","encoding":"utf8","data":"\"use strict\";\r\n\r\nconst fs = require(\"fs\");\r\nconst path = require(\"path\");\r\nconst crypto = require(\"crypto\");\r\nconst {\r\n  FREEZER_DIR,\r\n  isOriginalVideoName,\r\n  isTempEncodeName,\r\n  readSidecar,\r\n  findOriginal,\r\n  toPosixRel\r\n} = require(\"./encode\");\r\n\r\nconst VIDEO_EXT_PATTERN = /\\.(mp4|mkv|mov|m4v|webm|ts)$/i;\r\nconst TV_ROOT_PATTERN = /^(tv shows|anime|series)$/i;\r\nconst SEASON_FOLDER_PATTERN = /^season\\s*\\d{1,2}$/i;\r\nconst POSTER_EXTS = [\".jpg\", \".jpeg\", \".png\", \".webp\"];\r\n\r\nfunction relParts(rel) {\r\n  return toPosixRel(rel).split(\"/\").filter(Boolean);\r\n}\r\n\r\nfunction idFor(relPath) {\r\n  return crypto.createHash(\"sha1\").update(relPath).digest(\"hex\").slice(0, 16);\r\n}\r\n\r\nfunction isPlaybackVideoName(name) {\r\n  return VIDEO_EXT_PATTERN.test(name) && !isOriginalVideoName(name) && !isTempEncodeName(name);\r\n}\r\n\r\nfunction showTitleFromRel(rel) {\r\n  const parts = relParts(rel);\r\n  const tvIdx = parts.findIndex((part) => TV_ROOT_PATTERN.test(part));\r\n  if (tvIdx >= 0 && parts[tvIdx + 1]) return parts[tvIdx + 1];\r\n  const seasonIdx = parts.findIndex((part) => SEASON_FOLDER_PATTERN.test(part));\r\n  if (seasonIdx > 0) return parts[seasonIdx - 1];\r\n  return null;\r\n}\r\n\r\nfunction titleFromFilename(filename) {\r\n  const base = path.basename(filename, path.extname(filename));\r\n  const cleaned = base.replace(/[-_]+/g, \" \").replace(/\\s+\\d{3,}$/, \"\").trim();\r\n  if (!cleaned) return base;\r\n  return cleaned.replace(/\\b\\w/g, (char) => char.toUpperCase());\r\n}\r\n\r\nfunction findPosterRel(videoRoot, videoPath) {\r\n  const base = videoPath.replace(VIDEO_EXT_PATTERN, \"\");\r\n  const dir = path.dirname(videoPath);\r\n  const candidates = [];\r\n  for (const ext of POSTER_EXTS) {\r\n    candidates.push(`${base}-poster${ext}`, `${base}${ext}`);\r\n  }\r\n  for (const name of [\"poster.jpg\", \"poster.jpeg\", \"poster.png\", \"poster.webp\", \"folder.jpg\", \"cover.jpg\"]) {\r\n    candidates.push(path.join(dir, name));\r\n  }\r\n  for (const candidate of candidates) {\r\n    try {\r\n      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {\r\n        return toPosixRel(path.relative(videoRoot, candidate));\r\n      }\r\n    } catch {\r\n      // try next\r\n    }\r\n  }\r\n  return null;\r\n}\r\n\r\nfunction walkPlayback(dir, videoRoot, acc) {\r\n  let names;\r\n  try {\r\n    names = fs.readdirSync(dir);\r\n  } catch {\r\n    return acc;\r\n  }\r\n  for (const name of names) {\r\n    if (name.startsWith(\".\")) continue;\r\n    const filePath = path.join(dir, name);\r\n    let stat;\r\n    try {\r\n      stat = fs.statSync(filePath);\r\n    } catch {\r\n      continue;\r\n    }\r\n    if (stat.isDirectory()) {\r\n      walkPlayback(filePath, videoRoot, acc);\r\n      continue;\r\n    }\r\n    if (!stat.isFile() || !isPlaybackVideoName(name) || stat.size <= 0) continue;\r\n    const rel = toPosixRel(path.relative(videoRoot, filePath));\r\n    const meta = readSidecar(filePath);\r\n    const originalAbs = findOriginal(videoRoot, filePath, meta);\r\n    let compressStatus = meta?.status || \"pending\";\r\n    if (!meta && originalAbs) compressStatus = \"done\";\r\n    acc.push({\r\n      id: idFor(rel),\r\n      rel,\r\n      fileName: name,\r\n      title: titleFromFilename(name),\r\n      abs: filePath,\r\n      size: stat.size,\r\n      posterRel: findPosterRel(videoRoot, filePath),\r\n      compressStatus,\r\n      originalKept: Boolean(originalAbs),\r\n      compressError: meta?.error || null\r\n    });\r\n  }\r\n  return acc;\r\n}\r\n\r\nfunction scanFreezer(videoRoot) {\r\n  const freezerRoot = path.join(videoRoot, FREEZER_DIR);\r\n  const files = [];\r\n  if (fs.existsSync(freezerRoot)) walkPlayback(freezerRoot, videoRoot, files);\r\n\r\n  const movies = [];\r\n  const shows = new Map();\r\n  for (const file of files) {\r\n    const showTitle = showTitleFromRel(file.rel);\r\n    if (!showTitle) {\r\n      movies.push({ kind: \"movie\", ...file });\r\n      continue;\r\n    }\r\n    const key = showTitle.toLowerCase();\r\n    let show = shows.get(key);\r\n    if (!show) {\r\n      show = {\r\n        kind: \"tv-show\",\r\n        id: `show-${key.replace(/[^a-z0-9]+/g, \"-\")}`,\r\n        title: showTitle,\r\n        rels: [],\r\n        files: [],\r\n        posterRel: file.posterRel,\r\n        size: 0\r\n      };\r\n      shows.set(key, show);\r\n    }\r\n    show.files.push(file);\r\n    show.rels.push(file.rel);\r\n    show.size += file.size;\r\n    if (!show.posterRel && file.posterRel) show.posterRel = file.posterRel;\r\n  }\r\n\r\n  const showList = [...shows.values()].map((show) => {\r\n    const statuses = show.files.map((file) => file.compressStatus);\r\n    let compressStatus = \"pending\";\r\n    if (statuses.includes(\"encoding\")) compressStatus = \"encoding\";\r\n    else if (statuses.includes(\"failed\")) compressStatus = \"failed\";\r\n    else if (statuses.length && statuses.every((status) => status === \"done\")) compressStatus = \"done\";\r\n    else if (statuses.length && statuses.every((status) => status === \"restored\")) compressStatus = \"restored\";\r\n    else if (statuses.includes(\"pending\")) compressStatus = \"pending\";\r\n    return {\r\n      ...show,\r\n      episodeCount: show.files.length,\r\n      compressStatus,\r\n      originalKept: show.files.some((file) => file.originalKept),\r\n      compressError: show.files.find((file) => file.compressError)?.compressError || null\r\n    };\r\n  });\r\n\r\n  return { movies, shows: showList, files };\r\n}\r\n\r\nfunction queueBuckets(scan, currentRel) {\r\n  const pending = [];\r\n  const encoding = [];\r\n  const failed = [];\r\n  const pushItem = (item) => {\r\n    if (item.compressStatus === \"encoding\" || item.rel === currentRel) encoding.push(item);\r\n    else if (item.compressStatus === \"failed\") failed.push(item);\r\n    else if (item.compressStatus === \"pending\") pending.push(item);\r\n  };\r\n  for (const movie of scan.movies) pushItem(movie);\r\n  for (const show of scan.shows) {\r\n    const queueItem = {\r\n      kind: \"tv-show\",\r\n      id: show.id,\r\n      title: show.title,\r\n      rel: show.rels[0],\r\n      compressStatus: show.compressStatus,\r\n      episodeCount: show.episodeCount,\r\n      posterRel: show.posterRel,\r\n      compressError: show.compressError\r\n    };\r\n    if (show.compressStatus === \"encoding\" || show.files.some((file) => file.rel === currentRel)) {\r\n      encoding.push({ ...queueItem, compressStatus: \"encoding\" });\r\n    } else if (show.compressStatus === \"failed\") failed.push(queueItem);\r\n    else if (show.files.some((file) => file.compressStatus === \"pending\")) {\r\n      pending.push({ ...queueItem, compressStatus: \"pending\" });\r\n    }\r\n  }\r\n  return { pending, encoding, failed };\r\n}\r\n\r\nmodule.exports = {\r\n  idFor,\r\n  showTitleFromRel,\r\n  scanFreezer,\r\n  queueBuckets\r\n};\r\n"},{"name":"cinarip-freezer-worker/lib/progress.js","encoding":"utf8","data":"\"use strict\";\r\n\r\nconst fs = require(\"fs\");\r\nconst path = require(\"path\");\r\n\r\nfunction fileSize(filePath) {\r\n  try {\r\n    const stat = fs.statSync(filePath);\r\n    return stat.isFile() ? stat.size : 0;\r\n  } catch {\r\n    return 0;\r\n  }\r\n}\r\n\r\nfunction formatBps(bps) {\r\n  const n = Number(bps);\r\n  if (!Number.isFinite(n) || n <= 0) return \"—\";\r\n  if (n < 1024) return `${n.toFixed(0)} B/s`;\r\n  const units = [\"KB/s\", \"MB/s\", \"GB/s\"];\r\n  let value = n / 1024;\r\n  let unit = 0;\r\n  while (value >= 1024 && unit < units.length - 1) {\r\n    value /= 1024;\r\n    unit += 1;\r\n  }\r\n  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;\r\n}\r\n\r\nfunction parseFfmpegProgress(chunk, acc = {}) {\r\n  const out = { ...acc };\r\n  const text = `${acc._buf || \"\"}${String(chunk || \"\")}`;\r\n  const lines = text.split(/\\r?\\n/);\r\n  out._buf = lines.pop() || \"\";\r\n  for (const line of lines) {\r\n    const eq = line.indexOf(\"=\");\r\n    if (eq < 0) continue;\r\n    const key = line.slice(0, eq).trim();\r\n    const value = line.slice(eq + 1).trim();\r\n    if (key === \"out_time_us\") out.outTimeUs = Number(value);\r\n    else if (key === \"out_time_ms\") out.outTimeMs = Number(value);\r\n    else if (key === \"fps\") out.fps = Number(value);\r\n    else if (key === \"speed\") out.speed = value;\r\n    else if (key === \"total_size\") out.totalSize = Number(value);\r\n    else if (key === \"bitrate\") out.bitrate = value;\r\n    else if (key === \"frame\") out.frame = Number(value);\r\n    else if (key === \"progress\") out.progress = value;\r\n  }\r\n  const timeSec =\r\n    Number(out.outTimeUs) > 0\r\n      ? out.outTimeUs / 1e6\r\n      : Number(out.outTimeMs) > 0\r\n        ? out.outTimeMs / 1000\r\n        : 0;\r\n  out.outTimeSec = timeSec;\r\n  return out;\r\n}\r\n\r\nfunction encodePercent(progress, durationSec) {\r\n  const timeSec = Number(progress?.outTimeSec) || 0;\r\n  const duration = Number(durationSec) || 0;\r\n  if (duration <= 0) return timeSec > 0 ? 1 : 0;\r\n  return Math.max(0, Math.min(100, (timeSec / duration) * 100));\r\n}\r\n\r\nclass RateWindow {\r\n  constructor(idleMs = 1500, windowMs = 2000) {\r\n    this.idleMs = idleMs;\r\n    this.windowMs = windowMs;\r\n    this.events = [];\r\n  }\r\n\r\n  add(bytes, at = Date.now()) {\r\n    const n = Number(bytes);\r\n    if (!Number.isFinite(n) || n <= 0) return;\r\n    this.events.push({ at, bytes: n });\r\n    this.prune(at);\r\n  }\r\n\r\n  prune(at = Date.now()) {\r\n    this.events = this.events.filter((event) => at - event.at <= this.windowMs);\r\n  }\r\n\r\n  bps(at = Date.now()) {\r\n    this.prune(at);\r\n    if (!this.events.length) return 0;\r\n    const last = this.events[this.events.length - 1];\r\n    if (at - last.at > this.idleMs) return 0;\r\n    const first = this.events[0];\r\n    const elapsed = Math.max(1, last.at - first.at);\r\n    const total = this.events.reduce((sum, event) => sum + event.bytes, 0);\r\n    if (elapsed < 80) return total * (1000 / Math.max(elapsed, 1));\r\n    return (total * 1000) / elapsed;\r\n  }\r\n\r\n  reset() {\r\n    this.events = [];\r\n  }\r\n}\r\n\r\nfunction copyFileWithProgress(src, dest, onBytes) {\r\n  return new Promise((resolve, reject) => {\r\n    const total = fileSize(src);\r\n    if (total <= 0) {\r\n      reject(new Error(\"Source file is empty\"));\r\n      return;\r\n    }\r\n    fs.mkdirSync(path.dirname(dest), { recursive: true });\r\n    const rs = fs.createReadStream(src);\r\n    const ws = fs.createWriteStream(dest);\r\n    let copied = 0;\r\n    let settled = false;\r\n    const finish = (error) => {\r\n      if (settled) return;\r\n      settled = true;\r\n      if (error) {\r\n        try {\r\n          ws.destroy();\r\n        } catch {\r\n          // ignore\r\n        }\r\n        try {\r\n          fs.unlinkSync(dest);\r\n        } catch {\r\n          // ignore\r\n        }\r\n        reject(error);\r\n        return;\r\n      }\r\n      resolve({ copied, total });\r\n    };\r\n    rs.on(\"data\", (chunk) => {\r\n      copied += chunk.length;\r\n      if (onBytes) onBytes({ copied, total, percent: (copied / total) * 100 });\r\n    });\r\n    rs.on(\"error\", finish);\r\n    ws.on(\"error\", finish);\r\n    ws.on(\"finish\", () => finish());\r\n    rs.pipe(ws);\r\n  });\r\n}\r\n\r\nmodule.exports = {\r\n  fileSize,\r\n  formatBps,\r\n  parseFfmpegProgress,\r\n  encodePercent,\r\n  RateWindow,\r\n  copyFileWithProgress\r\n};\r\n"},{"name":"cinarip-freezer-worker/lib/nas-config.js","encoding":"utf8","data":"\"use strict\";\r\n\r\nconst fs = require(\"fs\");\r\nconst path = require(\"path\");\r\n\r\nconst DEFAULT_NAS_ORIGIN = \"https://cinarip.matthewsuess.com\";\r\nconst DEFAULT_SMB_HOST = \"100.95.66.124\";\r\nconst DEFAULT_SMB_SHARE = \"Public\";\r\nconst DEFAULT_SMB_VIDEOS = \"Videos\";\r\nconst WRITE_PROBE_NAME = \".cinarip-write-test\";\r\nconst WRITE_HELP =\r\n  \"The Docker volume must be read-write. Allow the folder in Docker Desktop file sharing. A NAS SMB share must be mapped with a user who can write (not guest/read-only).\";\r\n\r\nfunction configFilePath(root) {\r\n  return path.join(root, \".cinarip-worker.json\");\r\n}\r\n\r\nfunction freezerConfigPath(videoRoot) {\r\n  return path.join(videoRoot, \"Freezer\", \".cinarip-worker.json\");\r\n}\r\n\r\nfunction normalizeNasOrigin(raw, fallback = DEFAULT_NAS_ORIGIN) {\r\n  const text = String(raw || \"\").trim();\r\n  if (!text) {\r\n    if (!fallback) throw new Error(\"NAS URL is required\");\r\n    return normalizeNasOrigin(fallback, \"\");\r\n  }\r\n  const href = /^[a-zA-Z][a-zA-Z0-9+.-]*:\\/\\//.test(text)\r\n    ? text\r\n    : /matthewsuess\\.com/i.test(text)\r\n      ? `https://${text}`\r\n      : `http://${text}`;\r\n  let url;\r\n  try {\r\n    url = new URL(href);\r\n  } catch {\r\n    throw new Error(\"NAS URL is invalid\");\r\n  }\r\n  if (url.protocol !== \"http:\" && url.protocol !== \"https:\") {\r\n    throw new Error(\"NAS URL must be http or https\");\r\n  }\r\n  return url.origin;\r\n}\r\n\r\nfunction nasStatusUrl(origin) {\r\n  return `${normalizeNasOrigin(origin)}/api/freezer/status`;\r\n}\r\n\r\nfunction emptyConfig() {\r\n  return {\r\n    nasOrigin: DEFAULT_NAS_ORIGIN,\r\n    smbHost: DEFAULT_SMB_HOST,\r\n    smbShare: DEFAULT_SMB_SHARE,\r\n    smbVideos: DEFAULT_SMB_VIDEOS,\r\n    smbUsername: \"\",\r\n    smbPassword: \"\"\r\n  };\r\n}\r\n\r\nfunction parseConfigFile(abs) {\r\n  if (!abs || !fs.existsSync(abs)) return null;\r\n  try {\r\n    const parsed = JSON.parse(fs.readFileSync(abs, \"utf8\"));\r\n    if (!parsed || typeof parsed !== \"object\") return null;\r\n    return parsed;\r\n  } catch {\r\n    return null;\r\n  }\r\n}\r\n\r\nfunction mergeConfig(base, parsed) {\r\n  const next = { ...base };\r\n  if (!parsed) return next;\r\n  const origin = String(parsed.nasOrigin || parsed.origin || \"\").trim();\r\n  if (origin) {\r\n    try {\r\n      next.nasOrigin = normalizeNasOrigin(origin);\r\n    } catch {\r\n      // keep previous\r\n    }\r\n  }\r\n  if (parsed.smbHost != null) next.smbHost = String(parsed.smbHost).trim() || next.smbHost;\r\n  if (parsed.smbShare != null) next.smbShare = String(parsed.smbShare).trim() || next.smbShare;\r\n  if (parsed.smbVideos != null) next.smbVideos = String(parsed.smbVideos).trim();\r\n  if (parsed.smbUsername != null) next.smbUsername = String(parsed.smbUsername).trim();\r\n  if (parsed.smbPassword != null && String(parsed.smbPassword).length > 0) {\r\n    next.smbPassword = String(parsed.smbPassword);\r\n  }\r\n  return next;\r\n}\r\n\r\nfunction readConfig(configRoot, videoRoot) {\r\n  let cfg = emptyConfig();\r\n  cfg = mergeConfig(cfg, parseConfigFile(configFilePath(configRoot)));\r\n  if (videoRoot) cfg = mergeConfig(cfg, parseConfigFile(freezerConfigPath(videoRoot)));\r\n  return cfg;\r\n}\r\n\r\nfunction publicConfig(cfg) {\r\n  const full = { ...emptyConfig(), ...cfg };\r\n  return {\r\n    nasOrigin: full.nasOrigin,\r\n    smbHost: full.smbHost,\r\n    smbShare: full.smbShare,\r\n    smbVideos: full.smbVideos,\r\n    smbUsername: full.smbUsername,\r\n    hasPassword: Boolean(full.smbPassword)\r\n  };\r\n}\r\n\r\nfunction writeJson(abs, cfg) {\r\n  fs.mkdirSync(path.dirname(abs), { recursive: true });\r\n  fs.writeFileSync(abs, `${JSON.stringify(cfg, null, 2)}\\n`, { mode: 0o600 });\r\n}\r\n\r\nfunction writeConfig(configRoot, videoRoot, patch) {\r\n  const prev = readConfig(configRoot, videoRoot);\r\n  const next = mergeConfig(prev, patch);\r\n  if (patch && Object.prototype.hasOwnProperty.call(patch, \"smbPassword\")) {\r\n    const incoming = String(patch.smbPassword || \"\");\r\n    if (incoming) next.smbPassword = incoming;\r\n    else next.smbPassword = prev.smbPassword || \"\";\r\n  }\r\n  if (patch && patch.nasOrigin) next.nasOrigin = normalizeNasOrigin(patch.nasOrigin);\r\n  writeJson(configFilePath(configRoot), next);\r\n  if (videoRoot) {\r\n    try {\r\n      fs.mkdirSync(path.join(videoRoot, \"Freezer\"), { recursive: true });\r\n      writeJson(freezerConfigPath(videoRoot), next);\r\n    } catch {\r\n      // share may not be writable yet\r\n    }\r\n  }\r\n  return next;\r\n}\r\n\r\nfunction resolveNasOrigin(videoRoot, env = process.env, configRoot) {\r\n  const cfgRoot = configRoot || env.CONFIG_ROOT || (videoRoot ? path.join(videoRoot, \"Freezer\") : \"\");\r\n  const saved = readConfig(cfgRoot, videoRoot);\r\n  const fromFile =\r\n    parseConfigFile(cfgRoot ? configFilePath(cfgRoot) : \"\") ||\r\n    parseConfigFile(videoRoot ? freezerConfigPath(videoRoot) : \"\");\r\n  if (fromFile && (fromFile.nasOrigin || fromFile.origin)) return saved.nasOrigin;\r\n  const fromStatus = String(env.NAS_STATUS_URL || \"\").trim();\r\n  if (fromStatus) {\r\n    try {\r\n      return new URL(fromStatus).origin;\r\n    } catch {\r\n      // fall through\r\n    }\r\n  }\r\n  const fromEnv = String(env.NAS_ORIGIN || \"\").trim();\r\n  if (fromEnv) return normalizeNasOrigin(fromEnv);\r\n  return saved.nasOrigin || DEFAULT_NAS_ORIGIN;\r\n}\r\n\r\nfunction classifyIoError(error) {\r\n  const code = error && error.code;\r\n  if (code === \"ENOENT\") return `Videos path is not mounted. ${WRITE_HELP}`;\r\n  if (code === \"EACCES\" || code === \"EPERM\" || code === \"EROFS\") {\r\n    return `Videos folder is not writable. ${WRITE_HELP}`;\r\n  }\r\n  return (error && error.message) || `Could not use the Videos folder. ${WRITE_HELP}`;\r\n}\r\n\r\nfunction freezerIsEmpty(freezer, io = fs) {\r\n  try {\r\n    return io.readdirSync(freezer).every((name) => String(name).startsWith(\".\"));\r\n  } catch {\r\n    return true;\r\n  }\r\n}\r\n\r\nfunction ensureFreezer(videoRoot, io = fs) {\r\n  const result = {\r\n    state: \"disconnected\",\r\n    path: videoRoot,\r\n    freezerExists: false,\r\n    created: false,\r\n    empty: false,\r\n    writable: false,\r\n    error: null\r\n  };\r\n  try {\r\n    if (!io.existsSync(videoRoot)) {\r\n      result.error = `Videos path is not mounted. ${WRITE_HELP}`;\r\n      return result;\r\n    }\r\n    io.readdirSync(videoRoot);\r\n    const freezer = path.join(videoRoot, \"Freezer\");\r\n    if (!io.existsSync(freezer)) {\r\n      io.mkdirSync(freezer, { recursive: true });\r\n      result.created = true;\r\n    } else if (!io.statSync(freezer).isDirectory()) {\r\n      result.state = \"error\";\r\n      result.error = \"Freezer exists but is not a folder\";\r\n      return result;\r\n    }\r\n    result.freezerExists = true;\r\n    const probe = path.join(freezer, WRITE_PROBE_NAME);\r\n    io.writeFileSync(probe, \"ok\");\r\n    io.unlinkSync(probe);\r\n    result.writable = true;\r\n    result.empty = freezerIsEmpty(freezer, io);\r\n    if (result.created) {\r\n      result.state = \"warning\";\r\n      result.error = \"Created missing Freezer/. Freeze titles from CinaRip to populate it.\";\r\n    } else if (result.empty) {\r\n      result.state = \"warning\";\r\n      result.error = \"Freezer/ is empty. Freeze titles from CinaRip into this Videos path.\";\r\n    } else {\r\n      result.state = \"connected\";\r\n      result.error = null;\r\n    }\r\n    return result;\r\n  } catch (error) {\r\n    result.state = \"error\";\r\n    result.error = classifyIoError(error);\r\n    result.writable = false;\r\n    return result;\r\n  }\r\n}\r\n\r\nmodule.exports = {\r\n  DEFAULT_NAS_ORIGIN,\r\n  DEFAULT_SMB_HOST,\r\n  DEFAULT_SMB_SHARE,\r\n  DEFAULT_SMB_VIDEOS,\r\n  WRITE_PROBE_NAME,\r\n  WRITE_HELP,\r\n  configFilePath,\r\n  freezerConfigPath,\r\n  normalizeNasOrigin,\r\n  nasStatusUrl,\r\n  emptyConfig,\r\n  readConfig,\r\n  writeConfig,\r\n  writeSavedNasOrigin,\r\n  publicConfig,\r\n  resolveNasOrigin,\r\n  classifyIoError,\r\n  ensureFreezer\r\n};\r\n\r\nfunction writeSavedNasOrigin(videoRoot, origin, configRoot) {\r\n  const root = configRoot || process.env.CONFIG_ROOT || path.join(videoRoot, \"Freezer\");\r\n  return writeConfig(root, videoRoot, { nasOrigin: origin }).nasOrigin;\r\n}\r\n"},{"name":"cinarip-freezer-worker/lib/nas-mount.js","encoding":"utf8","data":"\"use strict\";\r\n\r\nconst fs = require(\"fs\");\r\nconst path = require(\"path\");\r\nconst { spawnSync } = require(\"child_process\");\r\n\r\nfunction smbUnc(host, share) {\r\n  const h = String(host || \"\").trim();\r\n  const s = String(share || \"\")\r\n    .replace(/\\\\/g, \"/\")\r\n    .replace(/^\\/+|\\/+$/g, \"\");\r\n  if (!h || !s) throw new Error(\"NAS host and share are required\");\r\n  return `//${h}/${s}`;\r\n}\r\n\r\nfunction videosRootFromMount(mountPoint, videosPath) {\r\n  const sub = String(videosPath || \"\")\r\n    .replace(/\\\\/g, \"/\")\r\n    .replace(/^\\/+|\\/+$/g, \"\");\r\n  if (!sub) return mountPoint;\r\n  return path.join(mountPoint, ...sub.split(\"/\").filter(Boolean));\r\n}\r\n\r\nfunction classifySmbError(stderr, status) {\r\n  const text = `${stderr || \"\"} ${status == null ? \"\" : status}`;\r\n  if (/error\\(13\\)|permission denied|logon unsuccessful|access denied|nt_status_logon_failure|nt_status_access_denied/i.test(text)) {\r\n    return \"Wrong NAS username or password\";\r\n  }\r\n  if (/error\\(2\\)|error\\(6\\)|no such file|host is down|not found|nt_status_bad_network_name/i.test(text)) {\r\n    return \"NAS share was not found\";\r\n  }\r\n  if (/error\\(115\\)|timed out|could not resolve/i.test(text)) {\r\n    return \"NAS host timed out or is unreachable\";\r\n  }\r\n  const trimmed = String(stderr || \"\").trim();\r\n  return trimmed ? trimmed.slice(0, 240) : \"Could not mount the NAS share\";\r\n}\r\n\r\nfunction writeCredentialFile(configRoot, username, password, io = fs) {\r\n  const abs = path.join(configRoot, \".smbcredentials\");\r\n  io.mkdirSync(configRoot, { recursive: true });\r\n  io.writeFileSync(abs, `username=${username}\\npassword=${password}\\n`, { mode: 0o600 });\r\n  return abs;\r\n}\r\n\r\nfunction mountCifs(options, spawn = spawnSync, io = fs) {\r\n  const host = String(options.host || \"\").trim();\r\n  const share = String(options.share || \"\").trim();\r\n  const username = String(options.username || \"\").trim();\r\n  const password = String(options.password || \"\");\r\n  const target = options.target;\r\n  const configRoot = options.configRoot;\r\n  if (!username || !password) {\r\n    return { ok: false, mounted: false, error: \"Enter NAS username and password\" };\r\n  }\r\n  io.mkdirSync(target, { recursive: true });\r\n  spawn(\"umount\", [\"-l\", target], { encoding: \"utf8\" });\r\n  const credFile = writeCredentialFile(configRoot, username, password, io);\r\n  const unc = smbUnc(host, share);\r\n  const result = spawn(\r\n    \"mount\",\r\n    [\r\n      \"-t\",\r\n      \"cifs\",\r\n      unc,\r\n      target,\r\n      \"-o\",\r\n      `credentials=${credFile},vers=3.0,uid=0,gid=0,file_mode=0777,dir_mode=0777,iocharset=utf8,nounix,noserverino`\r\n    ],\r\n    { encoding: \"utf8\" }\r\n  );\r\n  if (result.error && result.error.code === \"ENOENT\") {\r\n    return { ok: false, mounted: false, error: \"cifs-utils is not installed in this image\" };\r\n  }\r\n  if (result.status !== 0) {\r\n    return {\r\n      ok: false,\r\n      mounted: false,\r\n      error: classifySmbError(`${result.stderr || \"\"} ${result.stdout || \"\"}`, result.status)\r\n    };\r\n  }\r\n  return { ok: true, mounted: true, unc, target, error: null };\r\n}\r\n\r\nmodule.exports = {\r\n  smbUnc,\r\n  videosRootFromMount,\r\n  classifySmbError,\r\n  writeCredentialFile,\r\n  mountCifs\r\n};\r\n"},{"name":"cinarip-freezer-worker/public/index.html","encoding":"utf8","data":"<!doctype html>\r\n<html lang=\"en\">\r\n  <head>\r\n    <meta charset=\"UTF-8\" />\r\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\r\n    <title>CinaRip Freezer Worker</title>\r\n    <link rel=\"stylesheet\" href=\"/styles.css\" />\r\n  </head>\r\n  <body>\r\n    <header class=\"top\">\r\n      <div>\r\n        <strong>Freezer Worker</strong>\r\n        <p id=\"status\">Idle — encoding does not start until you press a button.</p>\r\n      </div>\r\n    </header>\r\n\r\n    <section class=\"status-strip\" aria-live=\"polite\">\r\n      <div class=\"status-cell\">\r\n        <span class=\"status-label\">Videos / Freezer</span>\r\n        <strong id=\"mount-state\" class=\"pill disconnected\">Disconnected</strong>\r\n        <span id=\"mount-detail\" class=\"muted\">Checking mount…</span>\r\n      </div>\r\n      <div class=\"status-cell\">\r\n        <span class=\"status-label\">NAS</span>\r\n        <strong id=\"nas-state\" class=\"pill disconnected\">Disconnected</strong>\r\n        <span id=\"nas-detail\" class=\"muted\">Connecting to CinaRip…</span>\r\n      </div>\r\n      <div class=\"status-cell rates\">\r\n        <span class=\"status-label\">Download</span>\r\n        <strong id=\"download-speed\">—</strong>\r\n      </div>\r\n      <div class=\"status-cell rates\">\r\n        <span class=\"status-label\">Upload</span>\r\n        <strong id=\"upload-speed\">—</strong>\r\n      </div>\r\n    </section>\r\n\r\n    <div class=\"ops\">\r\n      <button id=\"start-freezer\" type=\"button\" class=\"ghost primary\">Start Freezer</button>\r\n      <button id=\"cool-down\" type=\"button\" class=\"ghost\">Cool Down</button>\r\n    </div>\r\n    <p class=\"muted hint\">\r\n      Start Freezer begins the pending queue. Cool Down runs the encode pass.\r\n      <code>Freezer/</code> is created at container start. Docker needs write access to Videos\r\n      (NAS share credentials or Docker Desktop file sharing).\r\n    </p>\r\n\r\n    <form id=\"nas-form\" class=\"nas-card\">\r\n      <h2>NAS login</h2>\r\n      <p class=\"muted\">CinaRip HTTP and the Videos SMB share. Password is saved in the container, not logged.</p>\r\n      <label for=\"nas-origin\">CinaRip URL</label>\r\n      <input id=\"nas-origin\" type=\"text\" spellcheck=\"false\" autocomplete=\"off\" placeholder=\"https://cinarip.matthewsuess.com\" />\r\n      <label for=\"nas-host\">Host</label>\r\n      <input id=\"nas-host\" type=\"text\" spellcheck=\"false\" autocomplete=\"off\" placeholder=\"100.95.66.124\" />\r\n      <label for=\"nas-share\">Share</label>\r\n      <input id=\"nas-share\" type=\"text\" spellcheck=\"false\" autocomplete=\"off\" placeholder=\"Public\" />\r\n      <label for=\"nas-videos\">Videos path</label>\r\n      <input id=\"nas-videos\" type=\"text\" spellcheck=\"false\" autocomplete=\"off\" placeholder=\"Videos\" />\r\n      <label for=\"nas-username\">Username</label>\r\n      <input id=\"nas-username\" type=\"text\" spellcheck=\"false\" autocomplete=\"username\" placeholder=\"Matthew\" />\r\n      <label for=\"nas-password\">Password</label>\r\n      <input id=\"nas-password\" type=\"password\" autocomplete=\"current-password\" placeholder=\"NAS password\" />\r\n      <button type=\"submit\" class=\"ghost primary\">Save / Connect</button>\r\n    </form>\r\n\r\n    <section class=\"queue-card\">\r\n      <h2>Needs to be frozen</h2>\r\n      <ul id=\"pending-queue\" class=\"queue-list\">\r\n        <li class=\"empty\">Nothing waiting.</li>\r\n      </ul>\r\n    </section>\r\n\r\n    <section class=\"queue-card\">\r\n      <h2>Cooling down</h2>\r\n      <ul id=\"cooling-queue\" class=\"queue-list\">\r\n        <li class=\"empty\">Nothing encoding.</li>\r\n      </ul>\r\n    </section>\r\n\r\n    <p id=\"failed-note\" class=\"failed-note\" hidden></p>\r\n\r\n    <section>\r\n      <h2>In Freezer</h2>\r\n      <div id=\"catalog\" class=\"library\"></div>\r\n    </section>\r\n\r\n    <script src=\"/app.js\"></script>\r\n  </body>\r\n</html>\r\n"},{"name":"cinarip-freezer-worker/public/app.js","encoding":"utf8","data":"const statusEl = document.getElementById(\"status\");\r\nconst startButton = document.getElementById(\"start-freezer\");\r\nconst coolButton = document.getElementById(\"cool-down\");\r\nconst pendingList = document.getElementById(\"pending-queue\");\r\nconst coolingList = document.getElementById(\"cooling-queue\");\r\nconst failedNote = document.getElementById(\"failed-note\");\r\nconst catalogEl = document.getElementById(\"catalog\");\r\nconst mountStateEl = document.getElementById(\"mount-state\");\r\nconst mountDetailEl = document.getElementById(\"mount-detail\");\r\nconst nasStateEl = document.getElementById(\"nas-state\");\r\nconst nasDetailEl = document.getElementById(\"nas-detail\");\r\nconst nasForm = document.getElementById(\"nas-form\");\r\nconst nasOriginInput = document.getElementById(\"nas-origin\");\r\nconst nasHostInput = document.getElementById(\"nas-host\");\r\nconst nasShareInput = document.getElementById(\"nas-share\");\r\nconst nasVideosInput = document.getElementById(\"nas-videos\");\r\nconst nasUsernameInput = document.getElementById(\"nas-username\");\r\nconst nasPasswordInput = document.getElementById(\"nas-password\");\r\nconst downloadSpeedEl = document.getElementById(\"download-speed\");\r\nconst uploadSpeedEl = document.getElementById(\"upload-speed\");\r\n\r\nfunction setText(el, value) {\r\n  if (!el) return;\r\n  el.textContent = value;\r\n}\r\n\r\nfunction escapeHtml(value) {\r\n  return String(value || \"\")\r\n    .replace(/&/g, \"&amp;\")\r\n    .replace(/</g, \"&lt;\")\r\n    .replace(/>/g, \"&gt;\");\r\n}\r\n\r\nasync function getJson(url) {\r\n  const res = await fetch(url);\r\n  const data = await res.json().catch(() => ({}));\r\n  if (!res.ok) throw new Error(data.error || res.statusText);\r\n  return data;\r\n}\r\n\r\nasync function postJson(url, body = {}) {\r\n  const res = await fetch(url, {\r\n    method: \"POST\",\r\n    headers: { \"Content-Type\": \"application/json\" },\r\n    body: JSON.stringify(body)\r\n  });\r\n  const data = await res.json().catch(() => ({}));\r\n  if (!res.ok) throw new Error(data.error || res.statusText);\r\n  return data;\r\n}\r\n\r\nfunction connectionLabel(state) {\r\n  if (state === \"connected\") return \"Connected\";\r\n  if (state === \"warning\") return \"Warning\";\r\n  if (state === \"error\") return \"Error\";\r\n  if (state === \"unconfigured\") return \"Not configured\";\r\n  return \"Disconnected\";\r\n}\r\n\r\nfunction pillClass(state) {\r\n  if (state === \"connected\") return \"connected\";\r\n  if (state === \"warning\") return \"warning\";\r\n  if (state === \"error\") return \"error\";\r\n  return \"disconnected\";\r\n}\r\n\r\nfunction setPill(el, state) {\r\n  if (!el) return;\r\n  el.className = `pill ${pillClass(state)}`;\r\n  el.textContent = connectionLabel(state);\r\n}\r\n\r\nfunction formatClock(seconds) {\r\n  const n = Math.max(0, Number(seconds) || 0);\r\n  const m = Math.floor(n / 60);\r\n  const s = Math.floor(n % 60);\r\n  return `${m}:${String(s).padStart(2, \"0\")}`;\r\n}\r\n\r\nfunction formatBytes(bytes) {\r\n  const n = Number(bytes) || 0;\r\n  if (n < 1024) return `${n} B`;\r\n  const units = [\"KB\", \"MB\", \"GB\"];\r\n  let value = n / 1024;\r\n  let unit = 0;\r\n  while (value >= 1024 && unit < units.length - 1) {\r\n    value /= 1024;\r\n    unit += 1;\r\n  }\r\n  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;\r\n}\r\n\r\nfunction stageLabel(stage) {\r\n  if (stage === \"download\") return \"Download\";\r\n  if (stage === \"upload\") return \"Upload\";\r\n  if (stage === \"encode\") return \"Encoding\";\r\n  if (stage === \"done\") return \"Done\";\r\n  return \"Waiting\";\r\n}\r\n\r\nfunction progressBar(percent) {\r\n  const pct = Math.max(0, Math.min(100, Number(percent) || 0));\r\n  return `<div class=\"xfer-bar\" role=\"progressbar\" aria-valuemin=\"0\" aria-valuemax=\"100\" aria-valuenow=\"${pct.toFixed(0)}\"><i style=\"width:${pct.toFixed(1)}%\"></i></div>`;\r\n}\r\n\r\nfunction pendingRow(item) {\r\n  const kind = item.kind === \"tv-show\" ? \"Series\" : \"Movie\";\r\n  const extra = item.episodeCount ? ` · ${item.episodeCount} ep` : \"\";\r\n  return `<li>\r\n    <div class=\"queue-head\"><span>${escapeHtml(item.title)}</span><span class=\"kind\">${kind}${extra}</span></div>\r\n    <p class=\"stage\">Waiting</p>\r\n  </li>`;\r\n}\r\n\r\nfunction coolingRow(item, rates) {\r\n  const kind = item.kind === \"tv-show\" ? \"Series\" : \"Movie\";\r\n  const extra = item.episodeCount ? ` · ${item.episodeCount} ep` : \"\";\r\n  const stage = item.stage || \"encode\";\r\n  const percent = Number(item.percent) || 0;\r\n  let meta = `${percent.toFixed(0)}%`;\r\n  if (stage === \"encode\") {\r\n    if (item.durationSec) meta += ` · ${formatClock(item.outTimeSec)} / ${formatClock(item.durationSec)}`;\r\n    if (item.fps) meta += ` · ${Number(item.fps).toFixed(0)} fps`;\r\n    if (item.speed) meta += ` · ${escapeHtml(item.speed)}`;\r\n  } else if (stage === \"download\" || stage === \"upload\") {\r\n    if (item.bytesTotal) meta += ` · ${formatBytes(item.bytesDone)} / ${formatBytes(item.bytesTotal)}`;\r\n    const speed = stage === \"download\" ? rates?.downloadLabel : rates?.uploadLabel;\r\n    if (speed && speed !== \"—\") meta += ` · ${speed}`;\r\n  }\r\n  return `<li>\r\n    <div class=\"queue-head\"><span>${escapeHtml(item.title)}</span><span class=\"kind\">${kind}${extra}</span></div>\r\n    <p class=\"stage\">${stageLabel(stage)}</p>\r\n    ${progressBar(percent)}\r\n    <div class=\"xfer-meta\"><span>${meta}</span></div>\r\n  </li>`;\r\n}\r\n\r\nfunction queueHtml(items, emptyText, renderer) {\r\n  if (!items?.length) return `<li class=\"empty\">${escapeHtml(emptyText)}</li>`;\r\n  return items.map(renderer).join(\"\");\r\n}\r\n\r\nfunction statusLabel(status) {\r\n  switch (status) {\r\n    case \"encoding\":\r\n      return \"Cooling down\";\r\n    case \"done\":\r\n      return \"Compressed\";\r\n    case \"failed\":\r\n      return \"Failed\";\r\n    case \"restored\":\r\n      return \"Original restored\";\r\n    default:\r\n      return \"Waiting\";\r\n  }\r\n}\r\n\r\nfunction catalogCard(item) {\r\n  const isShow = item.kind === \"tv-show\";\r\n  const poster = item.posterRel\r\n    ? `style=\"background-image:url('/api/poster?rel=${encodeURIComponent(item.posterRel)}')\"`\r\n    : \"\";\r\n  const failed = item.compressStatus === \"failed\" ? \" failed\" : \"\";\r\n  const badgeClass = item.compressStatus === \"failed\" ? \"failed\" : item.compressStatus === \"done\" ? \"done\" : item.compressStatus === \"encoding\" ? \"encoding\" : \"\";\r\n  return `<article class=\"library-card\">\r\n    <div class=\"poster\" ${poster}>\r\n      <em data-kind=\"${isShow ? \"tv\" : \"movie\"}\">${isShow ? \"Series\" : \"Movie\"}</em>\r\n      <span>${escapeHtml(item.title)}</span>\r\n    </div>\r\n    <div class=\"badge${failed} ${badgeClass}\">${statusLabel(item.compressStatus)}</div>\r\n  </article>`;\r\n}\r\n\r\nfunction render(data) {\r\n  const mount = data.connection?.mount || {};\r\n  const nas = data.connection?.nas || {};\r\n  const smb = data.connection?.smb || {};\r\n  const settings = data.connection?.settings || {};\r\n  setPill(mountStateEl, mount.state || \"disconnected\");\r\n  setText(mountDetailEl, mount.error\r\n    || (mount.writable ? \"Freezer/ is writable\" : \"Checking mount…\"));\r\n  setPill(nasStateEl, nas.state === \"connected\" && smb.state === \"connected\"\r\n    ? \"connected\"\r\n    : smb.state === \"error\" || nas.state === \"error\"\r\n      ? \"error\"\r\n      : nas.state || smb.state || \"disconnected\");\r\n  const nasOrigin = nas.origin || settings.nasOrigin || \"https://cinarip.matthewsuess.com\";\r\n  const nasBits = [];\r\n  if (nas.state === \"connected\") nasBits.push(nasOrigin);\r\n  else nasBits.push(nas.error || `HTTP ${nasOrigin}`);\r\n  if (smb.state === \"connected\") nasBits.push(\"Share mounted\");\r\n  else if (smb.error) nasBits.push(smb.error);\r\n  setText(nasDetailEl, nasBits.join(\" · \"));\r\n  if (document.activeElement !== nasOriginInput && document.activeElement !== nasHostInput\r\n    && document.activeElement !== nasShareInput && document.activeElement !== nasVideosInput\r\n    && document.activeElement !== nasUsernameInput && document.activeElement !== nasPasswordInput) {\r\n    if (nasOriginInput) nasOriginInput.value = nasOrigin;\r\n    if (nasHostInput) nasHostInput.value = settings.smbHost || \"100.95.66.124\";\r\n    if (nasShareInput) nasShareInput.value = settings.smbShare || \"Public\";\r\n    if (nasVideosInput) nasVideosInput.value = settings.smbVideos || \"Videos\";\r\n    if (nasUsernameInput) nasUsernameInput.value = settings.smbUsername || \"\";\r\n    if (nasPasswordInput && settings.hasPassword) nasPasswordInput.placeholder = \"Saved — leave blank to keep\";\r\n  }\r\n\r\n  setText(downloadSpeedEl, data.rates?.downloadLabel || \"—\");\r\n  setText(uploadSpeedEl, data.rates?.uploadLabel || \"—\");\r\n\r\n  const working = Boolean(data.running || data.cooling || data.current);\r\n  if (data.current) {\r\n    setText(statusEl, `${stageLabel(data.current.stage)} · ${data.current.title}`);\r\n  } else if (data.running) {\r\n    setText(statusEl, data.pending?.length ? \"Start Freezer is on — waiting to cool down the next title.\" : \"Start Freezer is on — nothing pending.\");\r\n  } else {\r\n    setText(statusEl, \"Idle — encoding does not start until you press a button.\");\r\n  }\r\n  if (startButton) startButton.disabled = working && Boolean(data.running);\r\n  if (coolButton) coolButton.disabled = Boolean(data.current);\r\n\r\n  if (pendingList) pendingList.innerHTML = queueHtml(data.pending, \"Nothing waiting.\", pendingRow);\r\n\r\n  const coolingItems = [];\r\n  if (data.current) coolingItems.push(data.current);\r\n  for (const item of data.encoding || []) {\r\n    if (data.current && item.rel === data.current.rel) continue;\r\n    coolingItems.push(item);\r\n  }\r\n  if (coolingList) coolingList.innerHTML = queueHtml(coolingItems, \"Nothing encoding.\", (item) => coolingRow(item, data.rates));\r\n\r\n  const failed = data.failed || [];\r\n  if (failedNote) {\r\n    if (failed.length) {\r\n      failedNote.hidden = false;\r\n      failedNote.textContent = failed.length === 1\r\n        ? `Failed: ${failed[0].title}${failed[0].compressError ? ` — ${failed[0].compressError}` : \"\"}`\r\n        : `${failed.length} titles failed encode. They stay in the catalog marked Failed.`;\r\n    } else {\r\n      failedNote.hidden = true;\r\n      failedNote.textContent = \"\";\r\n    }\r\n  }\r\n\r\n  const cards = [\r\n    ...(data.catalog?.movies || []).map(catalogCard),\r\n    ...(data.catalog?.shows || []).map(catalogCard)\r\n  ];\r\n  if (catalogEl) {\r\n    catalogEl.innerHTML = cards.length ? cards.join(\"\") : `<p class=\"catalog-empty\">No titles in Freezer/. Put titles in Freezer from CinaRip first.</p>`;\r\n  }\r\n}\r\n\r\nasync function refresh() {\r\n  try {\r\n    render(await getJson(\"/api/status\"));\r\n  } catch (error) {\r\n    setPill(mountStateEl, \"disconnected\");\r\n    setText(mountDetailEl, error.message || \"Could not reach the worker.\");\r\n    setPill(nasStateEl, \"disconnected\");\r\n    setText(downloadSpeedEl, \"—\");\r\n    setText(uploadSpeedEl, \"—\");\r\n    setText(statusEl, error.message || \"Could not reach the worker.\");\r\n  }\r\n}\r\n\r\nif (startButton) {\r\n  startButton.addEventListener(\"click\", async () => {\r\n    try {\r\n      setText(statusEl, \"Starting Freezer…\");\r\n      render(await postJson(\"/api/start\"));\r\n    } catch (error) {\r\n      setText(statusEl, error.message || \"Could not start.\");\r\n    }\r\n  });\r\n}\r\n\r\nif (coolButton) {\r\n  coolButton.addEventListener(\"click\", async () => {\r\n    try {\r\n      setText(statusEl, \"Cooling down…\");\r\n      render(await postJson(\"/api/cool-down\"));\r\n    } catch (error) {\r\n      setText(statusEl, error.message || \"Could not cool down.\");\r\n    }\r\n  });\r\n}\r\n\r\nif (nasForm) {\r\n  nasForm.addEventListener(\"submit\", async (event) => {\r\n    event.preventDefault();\r\n    try {\r\n      setText(statusEl, \"Saving NAS…\");\r\n      render(await postJson(\"/api/nas\", {\r\n        origin: nasOriginInput?.value,\r\n        host: nasHostInput?.value,\r\n        share: nasShareInput?.value,\r\n        videosPath: nasVideosInput?.value,\r\n        username: nasUsernameInput?.value,\r\n        password: nasPasswordInput?.value\r\n      }));\r\n      if (nasPasswordInput) nasPasswordInput.value = \"\";\r\n    } catch (error) {\r\n      setText(statusEl, error.message || \"Could not save NAS.\");\r\n    }\r\n  });\r\n}\r\n\r\nrefresh();\r\nsetInterval(refresh, 1000);\r\n"},{"name":"cinarip-freezer-worker/public/styles.css","encoding":"utf8","data":":root {\r\n  color-scheme: dark;\r\n  --font: -apple-system, BlinkMacSystemFont, \"Segoe UI\", system-ui, sans-serif;\r\n  --text: rgba(255, 255, 255, 0.95);\r\n  --muted: rgba(255, 255, 255, 0.55);\r\n  --glass: rgba(255, 255, 255, 0.07);\r\n  --border: rgba(255, 255, 255, 0.14);\r\n  --blue: #0a84ff;\r\n}\r\n\r\n* { box-sizing: border-box; }\r\n\r\nhtml, body {\r\n  margin: 0;\r\n  min-height: 100%;\r\n  background: #0a0a12;\r\n  color: var(--text);\r\n  font-family: var(--font);\r\n}\r\n\r\nbody {\r\n  max-width: 960px;\r\n  margin: 0 auto;\r\n  padding: 18px 16px 48px;\r\n}\r\n\r\n.top {\r\n  display: flex;\r\n  justify-content: space-between;\r\n  align-items: center;\r\n  margin-bottom: 14px;\r\n}\r\n\r\n.top strong { font-size: 22px; letter-spacing: -0.03em; }\r\n.top p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }\r\n\r\n.status-strip {\r\n  display: grid;\r\n  grid-template-columns: 1.4fr 1.2fr 0.8fr 0.8fr;\r\n  gap: 10px;\r\n  margin-bottom: 16px;\r\n}\r\n\r\n.status-cell {\r\n  background: var(--glass);\r\n  border: 1px solid var(--border);\r\n  border-radius: 14px;\r\n  padding: 10px 12px;\r\n  min-width: 0;\r\n}\r\n\r\n.status-label {\r\n  display: block;\r\n  font-size: 11px;\r\n  letter-spacing: 0.04em;\r\n  text-transform: uppercase;\r\n  color: var(--muted);\r\n  margin-bottom: 6px;\r\n}\r\n\r\n.status-cell.rates strong {\r\n  font-size: 20px;\r\n  letter-spacing: -0.03em;\r\n}\r\n\r\n.pill {\r\n  display: inline-block;\r\n  border-radius: 999px;\r\n  padding: 3px 8px;\r\n  font-size: 12px;\r\n  margin-right: 6px;\r\n}\r\n\r\n.pill.connected { background: rgba(48, 209, 88, 0.2); color: #30d158; }\r\n.pill.disconnected { background: rgba(255, 255, 255, 0.08); color: var(--muted); }\r\n.pill.warning { background: rgba(255, 214, 10, 0.18); color: #ffd60a; }\r\n.pill.error { background: rgba(255, 69, 58, 0.18); color: #ff8a80; }\r\n\r\n.ops {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 8px;\r\n  margin-bottom: 8px;\r\n}\r\n\r\n.ghost {\r\n  border: 1px solid var(--border);\r\n  background: var(--glass);\r\n  border-radius: 999px;\r\n  padding: 10px 16px;\r\n  color: var(--text);\r\n  font: inherit;\r\n  cursor: pointer;\r\n}\r\n\r\n.ghost.primary {\r\n  background: var(--blue);\r\n  border-color: transparent;\r\n  color: #fff;\r\n}\r\n\r\n.ghost:disabled {\r\n  opacity: 0.55;\r\n  cursor: default;\r\n}\r\n\r\n.muted, .hint { color: var(--muted); font-size: 13px; line-height: 1.45; }\r\n.hint { margin: 0 0 18px; }\r\ncode { font-size: 12px; }\r\n\r\n.nas-card {\r\n  display: grid;\r\n  grid-template-columns: 140px 1fr;\r\n  gap: 8px 12px;\r\n  align-items: center;\r\n  background: var(--glass);\r\n  border: 1px solid var(--border);\r\n  border-radius: 16px;\r\n  padding: 14px;\r\n  margin: 0 0 18px;\r\n}\r\n\r\n.nas-card h2,\r\n.nas-card p {\r\n  grid-column: 1 / -1;\r\n}\r\n\r\n.nas-card label {\r\n  font-size: 12px;\r\n  color: var(--muted);\r\n  text-transform: uppercase;\r\n  letter-spacing: 0.04em;\r\n}\r\n\r\n.nas-card input {\r\n  border: 1px solid var(--border);\r\n  background: rgba(0, 0, 0, 0.25);\r\n  border-radius: 999px;\r\n  padding: 10px 14px;\r\n  color: var(--text);\r\n  font: inherit;\r\n}\r\n\r\n.nas-card button {\r\n  grid-column: 1 / -1;\r\n  justify-self: start;\r\n  margin-top: 4px;\r\n}\r\n\r\n.failed-note {\r\n  color: #ff8a80;\r\n  font-size: 13px;\r\n  margin: 0 0 16px;\r\n}\r\n\r\nh2 {\r\n  margin: 0 0 8px;\r\n  font-size: 16px;\r\n  letter-spacing: -0.02em;\r\n}\r\n\r\n.queue-card {\r\n  background: var(--glass);\r\n  border: 1px solid var(--border);\r\n  border-radius: 16px;\r\n  padding: 14px;\r\n  margin-bottom: 14px;\r\n}\r\n\r\n.queue-list {\r\n  list-style: none;\r\n  margin: 0;\r\n  padding: 0;\r\n}\r\n\r\n.queue-list li {\r\n  padding: 12px 0;\r\n  border-top: 1px solid var(--border);\r\n}\r\n\r\n.queue-list li:first-child { border-top: 0; }\r\n\r\n.queue-list .empty { color: var(--muted); border-top: 0; padding: 8px 0; }\r\n\r\n.queue-head {\r\n  display: flex;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n  align-items: baseline;\r\n  margin-bottom: 8px;\r\n}\r\n\r\n.queue-head .kind {\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n  text-transform: uppercase;\r\n  letter-spacing: 0.04em;\r\n}\r\n\r\n.stage {\r\n  font-size: 13px;\r\n  color: var(--muted);\r\n  margin: 0 0 8px;\r\n}\r\n\r\n.xfer-bar {\r\n  height: 18px;\r\n  border-radius: 9px;\r\n  background: rgba(255, 255, 255, 0.08);\r\n  overflow: hidden;\r\n}\r\n\r\n.xfer-bar > i {\r\n  display: block;\r\n  height: 100%;\r\n  width: 0%;\r\n  background: linear-gradient(90deg, #0a84ff, #bf5af2);\r\n  transition: width 0.25s linear;\r\n}\r\n\r\n.xfer-meta {\r\n  display: flex;\r\n  justify-content: space-between;\r\n  gap: 8px;\r\n  margin-top: 6px;\r\n  font-size: 12px;\r\n  color: var(--muted);\r\n}\r\n\r\n.library {\r\n  display: grid;\r\n  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));\r\n  gap: 12px;\r\n}\r\n\r\n.library-card {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 8px;\r\n  min-width: 0;\r\n}\r\n\r\n.poster {\r\n  aspect-ratio: 2 / 3;\r\n  border-radius: 12px;\r\n  background:\r\n    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.35)),\r\n    #161622;\r\n  background-size: cover;\r\n  background-position: center;\r\n  border: 1px solid var(--border);\r\n  overflow: hidden;\r\n  position: relative;\r\n}\r\n\r\n.poster span, .poster em {\r\n  position: absolute;\r\n  left: 8px;\r\n  right: 8px;\r\n  font-style: normal;\r\n  font-size: 12px;\r\n  text-shadow: 0 1px 8px #000;\r\n}\r\n\r\n.poster em {\r\n  top: 8px;\r\n  font-size: 10px;\r\n  letter-spacing: 0.04em;\r\n  text-transform: uppercase;\r\n  color: #d7c4ff;\r\n}\r\n\r\n.poster em[data-kind=\"movie\"] { color: #9ecbff; }\r\n.poster span { bottom: 8px; }\r\n\r\n.badge { font-size: 11px; color: var(--muted); }\r\n.badge.failed { color: #ff8a80; }\r\n.badge.done { color: #30d158; }\r\n.badge.encoding { color: #0a84ff; }\r\n\r\n.catalog-empty { color: var(--muted); font-size: 13px; }\r\n\r\n@media (max-width: 720px) {\r\n  .status-strip { grid-template-columns: 1fr 1fr; }\r\n}\r\n"}];
const { toPosixRel, isFrozenRel, isOriginalVideoName, isTempEncodeName, classifyLibraryRel, classifyLibraryRels, freezerMovieDest, thawMovieDest, freezerShowDest, thawShowDest, freezerDestForRel, thawDestForRel, sidecarPathsForVideo, movePath, moveVideoWithSidecars, compressInfoForVideo, compressInfoForRels, freezeMovie, thawMovie, freezeShow, thawShow, restoreOriginal, discardOriginal, writableNasError } = (() => {
const FREEZER_DIR = "Freezer";
const TV_SHOWS_DIR = "TV Shows";
const ORIGINALS_DIR = ".originals";
const COMPRESS_SIDECAR_SUFFIX = ".cinarip-compress.json";
const VIDEO_EXT_PATTERN = /\.(mp4|mkv|mov|m4v|webm|ts)$/i;
const TV_ROOT_PATTERN = /^(tv shows|anime|series)$/i;
const SEASON_FOLDER_PATTERN = /^season\s*\d{1,2}$/i;
const SIDECAR_EXTS = [".jpg", ".jpeg", ".png", ".webp"];
const VIDEO_EXTS = [".mp4", ".mkv", ".mov", ".m4v", ".webm", ".ts"];

function toPosixRel(rel) {
  return String(rel || "")
    .split(/[/\\]/)
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function relParts(rel) {
  return toPosixRel(rel).split("/").filter(Boolean);
}

function absFromRel(videoRoot, rel) {
  return path.join(videoRoot, ...relParts(rel));
}

function isFrozenRel(rel) {
  return /^freezer$/i.test(relParts(rel)[0] || "");
}

function isOriginalVideoName(name) {
  return /\.original\.(mp4|mkv|mov|m4v|webm|ts)$/i.test(String(name || ""));
}

function isTempEncodeName(name) {
  return /\.cinarip-(?:freeze|compress|restore)\.tmp\./i.test(String(name || ""));
}

function isPlaybackVideoName(name) {
  return VIDEO_EXT_PATTERN.test(name) && !isOriginalVideoName(name) && !isTempEncodeName(name);
}

function showTitleFromRel(rel) {
  const parts = relParts(rel);
  const tvIdx = parts.findIndex((part) => TV_ROOT_PATTERN.test(part));
  if (tvIdx >= 0 && parts[tvIdx + 1]) return parts[tvIdx + 1];
  const seasonIdx = parts.findIndex((part) => SEASON_FOLDER_PATTERN.test(part));
  if (seasonIdx > 0) return parts[seasonIdx - 1];
  return null;
}

function classifyLibraryRel(rel) {
  const posix = toPosixRel(rel);
  const showTitle = showTitleFromRel(posix);
  return {
    frozen: isFrozenRel(posix),
    kind: showTitle ? "tv" : "movie",
    showTitle
  };
}

function classifyLibraryRels(rels) {
  const movies = [];
  const frozenMovies = [];
  const shows = new Map();
  const frozenShows = new Map();

  for (const rel of rels || []) {
    const posix = toPosixRel(rel);
    const info = classifyLibraryRel(posix);
    if (info.kind === "tv") {
      const map = info.frozen ? frozenShows : shows;
      const key = String(info.showTitle).toLowerCase();
      if (!map.has(key)) map.set(key, { title: info.showTitle, rels: [] });
      map.get(key).rels.push(posix);
      continue;
    }
    if (info.frozen) frozenMovies.push(posix);
    else movies.push(posix);
  }

  return {
    movies,
    shows: [...shows.values()],
    frozenMovies,
    frozenShows: [...frozenShows.values()]
  };
}

function freezerMovieDest(videoRoot, fileName) {
  return path.join(videoRoot, FREEZER_DIR, path.basename(fileName));
}

function thawMovieDest(videoRoot, fileName) {
  return path.join(videoRoot, path.basename(fileName));
}

function freezerShowDest(videoRoot, showFolderName) {
  return path.join(videoRoot, FREEZER_DIR, TV_SHOWS_DIR, path.basename(showFolderName));
}

function thawShowDest(videoRoot, showFolderName) {
  return path.join(videoRoot, TV_SHOWS_DIR, path.basename(showFolderName));
}

function freezerDestForRel(videoRoot, rel) {
  const posix = toPosixRel(rel);
  if (isFrozenRel(posix)) return absFromRel(videoRoot, posix);
  const parts = relParts(posix);
  const tvIdx = parts.findIndex((part) => TV_ROOT_PATTERN.test(part));
  if (tvIdx >= 0) return path.join(videoRoot, FREEZER_DIR, ...parts.slice(tvIdx));
  return freezerMovieDest(videoRoot, parts[parts.length - 1] || posix);
}

function thawDestForRel(videoRoot, rel) {
  const posix = toPosixRel(rel);
  const parts = relParts(posix);
  if (!isFrozenRel(posix)) return absFromRel(videoRoot, posix);
  const rest = parts.slice(1);
  if (rest[0] && TV_ROOT_PATTERN.test(rest[0])) return path.join(videoRoot, ...rest);
  return thawMovieDest(videoRoot, rest[rest.length - 1] || posix);
}

function stripVideoExt(filePath) {
  return String(filePath || "").replace(VIDEO_EXT_PATTERN, "");
}

function sidecarPathForVideo(videoPath) {
  return `${videoPath}${COMPRESS_SIDECAR_SUFFIX}`;
}

function sidecarPathsForVideo(videoPath) {
  const base = stripVideoExt(videoPath);
  const found = [];
  for (const ext of SIDECAR_EXTS) {
    for (const candidate of [`${base}-poster${ext}`, `${base}${ext}`]) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) found.push(candidate);
      } catch {
        // skip
      }
    }
  }
  return found;
}

function fileSize(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() ? stat.size : 0;
  } catch {
    return 0;
  }
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  if (fileSize(dest) <= 0) {
    try {
      fs.unlinkSync(dest);
    } catch {
      // ignore
    }
    throw new Error("Destination file is empty");
  }
}

function writableNasError(error) {
  if (error && (error.code === "EACCES" || error.code === "EPERM" || error.code === "EROFS")) {
    const wrapped = new Error(
      "Videos folder is not writable. Use a NAS account that can write this share (not guest/read-only)."
    );
    wrapped.code = error.code;
    return wrapped;
  }
  return error;
}

function movePath(src, dest) {
  if (!src || !fs.existsSync(src)) throw new Error("Source not found");
  const resolvedSrc = path.resolve(src);
  const resolvedDest = path.resolve(dest);
  if (resolvedSrc === resolvedDest) return dest;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) throw new Error("Destination already exists");

  try {
    fs.renameSync(src, dest);
    return dest;
  } catch (error) {
    if (error.code !== "EXDEV") throw writableNasError(error);
  }

  copyRecursive(src, dest);
  if (fs.statSync(src).isFile() && fileSize(dest) <= 0) {
    try {
      fs.unlinkSync(dest);
    } catch {
      // ignore
    }
    throw new Error("Destination file is empty");
  }
  fs.rmSync(src, { recursive: true, force: true });
  return dest;
}

function moveSidecarList(sidecars, srcVideo, destVideo) {
  const srcBase = stripVideoExt(srcVideo);
  const destBase = stripVideoExt(destVideo);
  const moved = [];
  for (const sidecar of sidecars || []) {
    if (!fs.existsSync(sidecar)) continue;
    const suffix = sidecar.slice(srcBase.length);
    const dest = `${destBase}${suffix}`;
    if (path.resolve(sidecar) === path.resolve(dest)) continue;
    if (fs.existsSync(dest)) continue;
    movePath(sidecar, dest);
    moved.push(dest);
  }
  return moved;
}

function readCompressSidecar(videoPath) {
  const filePath = sidecarPathForVideo(videoPath);
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCompressSidecar(videoPath, meta) {
  const filePath = sidecarPathForVideo(videoPath);
  const payload = {
    version: 1,
    ...meta,
    updatedAt: meta?.updatedAt || new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
  return payload;
}

function moveCompressSidecar(srcVideo, destVideo) {
  const src = sidecarPathForVideo(srcVideo);
  if (!fs.existsSync(src)) return null;
  const dest = sidecarPathForVideo(destVideo);
  if (path.resolve(src) === path.resolve(dest)) return dest;
  if (fs.existsSync(dest)) return dest;
  movePath(src, dest);
  return dest;
}

function moveVideoWithSidecars(srcVideo, destVideo) {
  const sidecars = sidecarPathsForVideo(srcVideo);
  movePath(srcVideo, destVideo);
  if (fileSize(destVideo) <= 0) throw new Error("Destination file is empty");
  const posters = moveSidecarList(sidecars, srcVideo, destVideo);
  moveCompressSidecar(srcVideo, destVideo);
  return { dest: destVideo, posters };
}

function pruneEmptyDirs(dir, stopAt) {
  let walk = dir;
  const root = path.resolve(stopAt);
  while (walk && path.resolve(walk) !== root) {
    try {
      if (fs.existsSync(walk) && fs.statSync(walk).isDirectory() && fs.readdirSync(walk).length === 0) {
        fs.rmdirSync(walk);
        walk = path.dirname(walk);
        continue;
      }
    } catch {
      // stop pruning
    }
    break;
  }
}

function mergeMove(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    const from = path.join(srcDir, name);
    const to = path.join(destDir, name);
    let fromStat;
    let toStat = null;
    try {
      fromStat = fs.statSync(from);
    } catch {
      continue;
    }
    try {
      if (fs.existsSync(to)) toStat = fs.statSync(to);
    } catch {
      toStat = null;
    }
    if (fromStat.isDirectory() && toStat?.isDirectory()) {
      mergeMove(from, to);
      continue;
    }
    if (toStat) continue;
    movePath(from, to);
  }
  pruneEmptyDirs(srcDir, path.dirname(srcDir));
}

function inferShowFolderAbs(videoRoot, episodeRels) {
  const first = toPosixRel(episodeRels?.[0] || "");
  if (!first) return null;
  const parts = relParts(first);
  const tvIdx = parts.findIndex((part) => TV_ROOT_PATTERN.test(part));
  if (tvIdx >= 0 && parts[tvIdx + 1]) return path.join(videoRoot, ...parts.slice(0, tvIdx + 2));
  const seasonIdx = parts.findIndex((part) => SEASON_FOLDER_PATTERN.test(part));
  if (seasonIdx > 0) return path.join(videoRoot, ...parts.slice(0, seasonIdx));
  if (parts.length >= 2) return path.join(videoRoot, ...parts.slice(0, -1));
  return null;
}

function inferShowName(episodeRels, fallback) {
  for (const rel of episodeRels || []) {
    const title = showTitleFromRel(rel);
    if (title) return title;
  }
  return fallback || "TV Show";
}

function listVideos(dir, acc = []) {
  if (!dir || !fs.existsSync(dir)) return acc;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const filePath = path.join(dir, name);
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      listVideos(filePath, acc);
      continue;
    }
    if (stat.isFile() && isPlaybackVideoName(name) && stat.size > 0) acc.push(filePath);
  }
  return acc;
}

function freezerInnerRel(rel) {
  const parts = relParts(rel);
  if (isFrozenRel(rel)) return parts.slice(1).join("/");
  return toPosixRel(rel);
}

function frozenOriginalAbs(videoRoot, playbackRel) {
  const inner = freezerInnerRel(playbackRel);
  if (!inner) return path.join(videoRoot, FREEZER_DIR, ORIGINALS_DIR);
  return path.join(videoRoot, FREEZER_DIR, ORIGINALS_DIR, ...relParts(inner));
}

function siblingOriginalAbs(playbackAbs, originalExt) {
  const parsed = path.parse(playbackAbs);
  const ext = originalExt || parsed.ext || ".mp4";
  return path.join(parsed.dir, `${parsed.name}.original${ext}`);
}

function findOriginalByBasename(dir, baseName) {
  if (!dir || !fs.existsSync(dir)) return null;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of names) {
    if (!VIDEO_EXT_PATTERN.test(name) || isTempEncodeName(name)) continue;
    const nameBase = name.replace(VIDEO_EXT_PATTERN, "").replace(/\.original$/i, "");
    if (nameBase.toLowerCase() !== String(baseName || "").toLowerCase()) continue;
    const abs = path.join(dir, name);
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile() && fileSize(abs) > 0) return abs;
    } catch {
      // try next
    }
  }
  return null;
}

function resolveOriginalAbs(videoRoot, rel, meta) {
  const posix = toPosixRel(rel);
  if (meta?.originalRel) {
    const fromMeta = absFromRel(videoRoot, meta.originalRel);
    if (fromMeta && fs.existsSync(fromMeta) && fileSize(fromMeta) > 0) return fromMeta;
  }
  const playback = absFromRel(videoRoot, posix);
  const parsed = path.parse(playback);
  for (const ext of VIDEO_EXTS) {
    const sibling = path.join(parsed.dir, `${parsed.name}.original${ext}`);
    if (fs.existsSync(sibling) && fileSize(sibling) > 0) return sibling;
  }
  if (isFrozenRel(posix)) {
    const vault = frozenOriginalAbs(videoRoot, posix);
    if (fs.existsSync(vault) && fileSize(vault) > 0) return vault;
    const vaultMatch = findOriginalByBasename(path.dirname(vault), path.basename(vault, path.extname(vault)));
    if (vaultMatch) return vaultMatch;
  }
  return null;
}

function defaultPendingMeta(existing) {
  return {
    version: 1,
    status: "pending",
    originalKept: Boolean(existing?.originalKept),
    originalRel: existing?.originalRel || null,
    error: null,
    retries: Number(existing?.retries) || 0
  };
}

function ensurePendingSidecar(videoPath) {
  const existing = readCompressSidecar(videoPath);
  if (existing?.status === "done" || existing?.status === "encoding" || existing?.status === "restored") {
    return existing;
  }
  if (existing?.status === "failed") return existing;
  return writeCompressSidecar(videoPath, defaultPendingMeta(existing));
}

function writePendingSidecarsUnder(dir) {
  for (const video of listVideos(dir)) ensurePendingSidecar(video);
}

function compressInfoForVideo(videoRoot, rel) {
  const posix = toPosixRel(rel);
  const abs = absFromRel(videoRoot, posix);
  const meta = fs.existsSync(abs) ? readCompressSidecar(abs) : null;
  const origAbs = resolveOriginalAbs(videoRoot, posix, meta);
  const originalKept = Boolean(origAbs && fs.existsSync(origAbs) && fileSize(origAbs) > 0);
  let compressStatus = meta?.status || "pending";
  if (!meta && originalKept) compressStatus = "done";
  return {
    compressStatus,
    originalKept,
    originalRel: originalKept ? toPosixRel(path.relative(videoRoot, origAbs)) : null,
    compressError: meta?.error || null,
    encodedSize: meta?.encodedSize || null,
    sourceSize: meta?.sourceSize || null
  };
}

function compressInfoForRels(videoRoot, rels) {
  const infos = (rels || []).map((rel) => compressInfoForVideo(videoRoot, rel));
  const statuses = infos.map((info) => info.compressStatus);
  let compressStatus = "pending";
  if (statuses.includes("encoding")) compressStatus = "encoding";
  else if (statuses.includes("failed")) compressStatus = "failed";
  else if (statuses.length && statuses.every((status) => status === "done")) compressStatus = "done";
  else if (statuses.length && statuses.every((status) => status === "restored")) compressStatus = "restored";
  else if (statuses.includes("pending")) compressStatus = "pending";
  else if (statuses.includes("done")) compressStatus = "pending";
  return {
    compressStatus,
    originalKept: infos.some((info) => info.originalKept),
    compressError: infos.find((info) => info.compressError)?.compressError || null,
    files: infos
  };
}

function moveOriginalOnThaw(videoRoot, frozenRel, destVideo) {
  const meta = readCompressSidecar(destVideo) || readCompressSidecar(absFromRel(videoRoot, frozenRel));
  const origAbs = resolveOriginalAbs(videoRoot, frozenRel, meta);
  if (!origAbs || !fs.existsSync(origAbs)) return null;
  const origRel = toPosixRel(path.relative(videoRoot, origAbs));
  if (!isFrozenRel(origRel) && !origRel.split("/").includes(ORIGINALS_DIR)) {
    return origAbs;
  }
  const sibling = siblingOriginalAbs(destVideo, path.extname(origAbs));
  if (path.resolve(origAbs) === path.resolve(sibling)) return sibling;
  if (fs.existsSync(sibling)) return sibling;
  movePath(origAbs, sibling);
  pruneEmptyDirs(path.dirname(origAbs), path.join(videoRoot, FREEZER_DIR));
  const sidecarMeta = readCompressSidecar(destVideo);
  if (sidecarMeta) {
    sidecarMeta.originalKept = true;
    sidecarMeta.originalRel = toPosixRel(path.relative(videoRoot, sibling));
    writeCompressSidecar(destVideo, sidecarMeta);
  }
  return sibling;
}

async function freezeMovie(videoRoot, rel) {
  try {
    const posix = toPosixRel(rel);
    const src = absFromRel(videoRoot, posix);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new Error("Video not found");
    if (isFrozenRel(posix)) {
      ensurePendingSidecar(src);
      const info = compressInfoForVideo(videoRoot, posix);
      return {
        ok: true,
        alreadyFrozen: true,
        compressed: info.compressStatus === "done",
        compressStatus: info.compressStatus,
        originalKept: info.originalKept,
        reason: info.compressStatus === "done" ? undefined : "Waiting for encode worker",
        rel: posix
      };
    }

    const dest = freezerDestForRel(videoRoot, posix);
    moveVideoWithSidecars(src, dest);
    ensurePendingSidecar(dest);
    const destRel = toPosixRel(path.relative(videoRoot, dest));
    const info = compressInfoForVideo(videoRoot, destRel);
    return {
      ok: true,
      compressed: false,
      compressStatus: info.compressStatus,
      originalKept: info.originalKept,
      reason: "Waiting for encode worker",
      rel: destRel
    };
  } catch (error) {
    throw writableNasError(error);
  }
}

async function thawMovie(videoRoot, rel) {
  const posix = toPosixRel(rel);
  const src = absFromRel(videoRoot, posix);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new Error("Video not found");
  if (!isFrozenRel(posix)) {
    const info = compressInfoForVideo(videoRoot, posix);
    return {
      ok: true,
      alreadyThawed: true,
      compressed: info.compressStatus === "done",
      compressStatus: info.compressStatus,
      originalKept: info.originalKept,
      rel: posix
    };
  }
  const dest = thawDestForRel(videoRoot, posix);
  moveVideoWithSidecars(src, dest);
  moveOriginalOnThaw(videoRoot, posix, dest);
  pruneEmptyDirs(path.dirname(src), path.join(videoRoot, FREEZER_DIR));
  const destRel = toPosixRel(path.relative(videoRoot, dest));
  const info = compressInfoForVideo(videoRoot, destRel);
  return {
    ok: true,
    compressed: info.compressStatus === "done",
    compressStatus: info.compressStatus,
    originalKept: info.originalKept,
    qualityRestored: false,
    rel: destRel
  };
}

async function freezeShow(videoRoot, episodeRels, options = {}) {
  try {
  const rels = [...new Set((episodeRels || []).map(toPosixRel))].filter((rel) => !isFrozenRel(rel));
  if (!rels.length) {
    const frozenRels = [...new Set((episodeRels || []).map(toPosixRel))].filter(isFrozenRel);
    if (frozenRels.length) {
      const showFolder = inferShowFolderAbs(videoRoot, frozenRels);
      if (showFolder) writePendingSidecarsUnder(showFolder);
    }
    return {
      ok: true,
      alreadyFrozen: true,
      compressed: false,
      compressStatus: "pending",
      reason: "Waiting for encode worker"
    };
  }

  const showName = inferShowName(rels, options.showTitle);
  const destRoot = freezerShowDest(videoRoot, showName);
  const showFolder = inferShowFolderAbs(videoRoot, rels);

  if (
    showFolder &&
    path.resolve(showFolder) !== path.resolve(videoRoot) &&
    fs.existsSync(showFolder) &&
    fs.statSync(showFolder).isDirectory()
  ) {
    if (!fs.existsSync(destRoot)) movePath(showFolder, destRoot);
    else mergeMove(showFolder, destRoot);
  } else {
    for (const rel of rels) {
      const src = absFromRel(videoRoot, rel);
      if (!fs.existsSync(src)) continue;
      const parts = relParts(rel);
      const season = parts.find((part) => SEASON_FOLDER_PATTERN.test(part));
      const dest = season
        ? path.join(destRoot, season, path.basename(src))
        : path.join(destRoot, path.basename(src));
      moveVideoWithSidecars(src, dest);
    }
  }

  writePendingSidecarsUnder(destRoot);
  return {
    ok: true,
    compressed: false,
    compressStatus: "pending",
    reason: "Waiting for encode worker",
    rel: toPosixRel(path.relative(videoRoot, destRoot))
  };
  } catch (error) {
    throw writableNasError(error);
  }
}

async function thawShow(videoRoot, episodeRels, options = {}) {
  const rels = [...new Set((episodeRels || []).map(toPosixRel))].filter(isFrozenRel);
  if (!rels.length) return { ok: true, alreadyThawed: true, compressed: false, compressStatus: "pending" };

  const showName = inferShowName(rels, options.showTitle);
  const showFolder = inferShowFolderAbs(videoRoot, rels);
  const destRoot = thawShowDest(videoRoot, showName);
  if (
    showFolder &&
    path.resolve(showFolder) !== path.resolve(videoRoot) &&
    fs.existsSync(showFolder) &&
    fs.statSync(showFolder).isDirectory()
  ) {
    if (!fs.existsSync(destRoot)) movePath(showFolder, destRoot);
    else mergeMove(showFolder, destRoot);
  } else {
    for (const rel of rels) {
      const src = absFromRel(videoRoot, rel);
      if (!fs.existsSync(src)) continue;
      const dest = thawDestForRel(videoRoot, rel);
      moveVideoWithSidecars(src, dest);
    }
  }

  const thawedVideos = listVideos(destRoot);
  for (const frozenRel of rels) {
    const destAbs = thawDestForRel(videoRoot, frozenRel);
    const destExists = fs.existsSync(destAbs) ? destAbs : thawedVideos.find((file) => path.basename(file) === path.basename(destAbs));
    if (destExists) moveOriginalOnThaw(videoRoot, frozenRel, destExists);
  }

  pruneEmptyDirs(path.join(videoRoot, FREEZER_DIR, TV_SHOWS_DIR), path.join(videoRoot, FREEZER_DIR));
  const destRel = toPosixRel(path.relative(videoRoot, destRoot));
  const info = compressInfoForRels(
    videoRoot,
    thawedVideos.map((file) => toPosixRel(path.relative(videoRoot, file)))
  );
  return {
    ok: true,
    compressed: info.compressStatus === "done",
    compressStatus: info.compressStatus,
    originalKept: info.originalKept,
    qualityRestored: false,
    rel: destRel
  };
}

function restoreOriginal(videoRoot, rel) {
  const posix = toPosixRel(rel);
  const playback = absFromRel(videoRoot, posix);
  if (!fs.existsSync(playback) || !fs.statSync(playback).isFile()) throw new Error("Video not found");
  const meta = readCompressSidecar(playback);
  const origAbs = resolveOriginalAbs(videoRoot, posix, meta);
  if (!origAbs || !fs.existsSync(origAbs) || fileSize(origAbs) <= 0) {
    throw new Error("Original was discarded or never kept");
  }

  const origExt = path.extname(origAbs);
  const origBase = path.basename(origAbs);
  const destName = origBase.replace(/\.original(\.[^.]+)$/i, "$1");
  const destPath = path.join(path.dirname(playback), destName);
  const tmp = `${destPath}.cinarip-restore.tmp${origExt}`;
  fs.copyFileSync(origAbs, tmp);
  if (fileSize(tmp) <= 0) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // ignore
    }
    throw new Error("Original copy is empty");
  }

  if (path.resolve(destPath) === path.resolve(playback)) {
    const bak = `${playback}.cinarip-restore.bak`;
    fs.renameSync(playback, bak);
    try {
      fs.renameSync(tmp, playback);
    } catch (error) {
      if (!fs.existsSync(playback) && fs.existsSync(bak)) fs.renameSync(bak, playback);
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
      throw error;
    }
    try {
      fs.unlinkSync(bak);
    } catch {
      // ignore
    }
  } else {
    if (fs.existsSync(destPath) && path.resolve(destPath) !== path.resolve(playback)) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
      throw new Error("Restore destination already exists");
    }
    fs.renameSync(tmp, destPath);
    try {
      fs.unlinkSync(playback);
    } catch {
      // ignore
    }
  }

  try {
    fs.unlinkSync(origAbs);
  } catch {
    // ignore
  }
  pruneEmptyDirs(path.dirname(origAbs), path.join(videoRoot, FREEZER_DIR));

  const restoredAbs = fs.existsSync(destPath) ? destPath : playback;
  const oldSidecar = sidecarPathForVideo(playback);
  writeCompressSidecar(restoredAbs, {
    version: 1,
    status: "restored",
    originalKept: false,
    originalRel: null,
    error: null,
    note: "Original bytes restored. Encoded copy discarded."
  });
  if (path.resolve(oldSidecar) !== path.resolve(sidecarPathForVideo(restoredAbs)) && fs.existsSync(oldSidecar)) {
    try {
      fs.unlinkSync(oldSidecar);
    } catch {
      // ignore
    }
  }

  return {
    ok: true,
    restored: true,
    originalKept: false,
    qualityRestored: true,
    compressStatus: "restored",
    rel: toPosixRel(path.relative(videoRoot, restoredAbs)),
    message: "Restored original"
  };
}

function discardOriginal(videoRoot, rel) {
  const posix = toPosixRel(rel);
  const playback = absFromRel(videoRoot, posix);
  if (!fs.existsSync(playback) || !fs.statSync(playback).isFile()) throw new Error("Video not found");
  const meta = readCompressSidecar(playback) || {};
  const origAbs = resolveOriginalAbs(videoRoot, posix, meta);
  if (origAbs && fs.existsSync(origAbs)) {
    try {
      fs.unlinkSync(origAbs);
    } catch {
      // ignore
    }
    pruneEmptyDirs(path.dirname(origAbs), path.join(videoRoot, FREEZER_DIR));
  }
  writeCompressSidecar(playback, {
    ...meta,
    status: meta.status || "done",
    originalKept: false,
    originalRel: null,
    error: meta.error || null
  });
  return {
    ok: true,
    discarded: true,
    originalKept: false,
    qualityRestored: false,
    compressStatus: meta.status || "done",
    rel: posix,
    message: "Original discarded. Playback is the compressed file."
  };
}
  return { toPosixRel, isFrozenRel, isOriginalVideoName, isTempEncodeName, classifyLibraryRel, classifyLibraryRels, freezerMovieDest, thawMovieDest, freezerShowDest, thawShowDest, freezerDestForRel, thawDestForRel, sidecarPathsForVideo, movePath, moveVideoWithSidecars, compressInfoForVideo, compressInfoForRels, freezeMovie, thawMovie, freezeShow, thawShow, restoreOriginal, discardOriginal, writableNasError };
})();

const { buildWorkerZip, getWorkerFiles } = (() => {
const PACK_NAMES = [
  "Dockerfile",
  "docker-compose.yml",
  "docker-entrypoint.sh",
  "README.md",
  "package.json",
  "worker.js",
  "lib/encode.js",
  "lib/scan.js",
  "lib/progress.js",
  "lib/nas-config.js",
  "lib/nas-mount.js",
  "public/index.html",
  "public/app.js",
  "public/styles.css"
];

function crc32(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  let crc = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
}

function dosDateTime(date = new Date()) {
  const dosTime = (date.getSeconds() >> 1) | (date.getMinutes() << 5) | (date.getHours() << 11);
  const dosDate = date.getDate() | ((date.getMonth() + 1) << 5) | ((date.getFullYear() - 1980) << 9);
  return { dosTime, dosDate };
}

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = dosDateTime();
  for (const file of files) {
    const name = Buffer.from(String(file.name || "").replace(/\\/g, "/"), "utf8");
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || "", "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const localFile = Buffer.concat([local, name, data]);
    localParts.push(localFile);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(Buffer.concat([central, name]));
    offset += localFile.length;
  }
  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDir, eocd]);
}

function resolveWorkerDir() {
  const env = String(process.env.FREEZER_WORKER_DIR || "").trim();
  const candidates = [
    env,
    path.join(__dirname, "freezer-worker"),
    path.join(__dirname, "..", "freezer-worker"),
    path.join(__dirname, "..", "..", "freezer-worker")
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "Dockerfile")) && fs.existsSync(path.join(dir, "worker.js"))) return dir;
  }
  return null;
}

function filesFromDisk() {
  const dir = resolveWorkerDir();
  if (!dir) throw new Error("Encode worker package files were not found on this NAS.");
  return PACK_NAMES.map((name) => {
    const abs = path.join(dir, name);
    if (!fs.existsSync(abs)) throw new Error(`Missing worker file: ${name}`);
    return {
      name: `cinarip-freezer-worker/${name}`,
      data: fs.readFileSync(abs)
    };
  });
}

function inlinedWorkerFiles() {
  const packed = globalThis.CINARIP_FREEZER_WORKER_FILES;
  return Array.isArray(packed) ? packed : null;
}

function getWorkerFiles() {
  const packed = inlinedWorkerFiles();
  if (packed) {
    return packed.map((file) => ({
      name: file.name,
      data: Buffer.from(file.data, file.encoding === "base64" ? "base64" : "utf8")
    }));
  }
  return filesFromDisk();
}

function buildWorkerZip() {
  return buildZip(getWorkerFiles());
}
  return { buildWorkerZip, getWorkerFiles };
})();

const { DownloadRunner } = (() => {
const VIDEO_ROOT = path.resolve(process.env.VIDEO_ROOT || "/data/videos");

function defaultUserAgent() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
}

class DownloadRunner {
  constructor(client, options = {}) {
    this.client = client || new TornadoClient();
    this.queue = options.queue || new DownloadQueue();
    this.videoRoot = options.videoRoot || VIDEO_ROOT;
    this.storePath = options.storePath || defaultStorePath();
    this.downloadFn = options.downloadFn || downloadHttpFile;
    this.busy = false;
    this.current = null;
    this.abortRef = { current: null };
    this.onLibraryInvalidate = null;
    this.lastProgressWrite = 0;
    this.restore();
  }

  persist() {
    saveQueueState(this.queue.persistableItems(), this.storePath);
  }

  restore() {
    const saved = loadQueueState(this.storePath);
    this.queue.restore(saved.items);
  }

  status() {
    return {
      ...this.queue.snapshot(),
      current: this.current
    };
  }

  enqueue(movie) {
    if (this.queue.running) {
      return { ok: false, error: "Stop the queue before adding more titles.", ...this.status() };
    }
    const result = this.queue.add(movie.movieUrl, {
      title: movie.title,
      posterUrl: movie.posterUrl
    });
    if (result.ok) this.persist();
    return { ...result, ...this.status() };
  }

  enqueueEpisode(episode, options = {}) {
    if (this.queue.running) {
      return { ok: false, error: "Stop the queue before adding more episodes.", ...this.status() };
    }
    const result = this.queue.addEpisode(episode, options);
    if (result.ok) this.persist();
    return { ...result, ...this.status() };
  }

  enqueueEpisodes(episodes, options = {}) {
    if (this.queue.running) {
      return { ok: false, error: "Stop the queue before adding more episodes.", ...this.status() };
    }
    const result = this.queue.addEpisodes(episodes, options);
    this.persist();
    return { ...result, ...this.status() };
  }

  enqueueMany(entries) {
    if (this.queue.running) {
      return { ok: false, error: "Stop the queue before adding more titles.", ...this.status() };
    }
    const moviesOnly = (Array.isArray(entries) ? entries : []).filter(
      (entry) => entry?.kind !== "tv" && /\/movie\//i.test(String(entry?.movieUrl || entry || ""))
    );
    if (!moviesOnly.length) {
      return {
        ok: false,
        error: "No movies in these results to queue. Open a TV show to scan its episodes instead.",
        ...this.status()
      };
    }
    const result = this.queue.addMany(moviesOnly);
    this.persist();
    return { ...result, ...this.status() };
  }

  remove(id) {
    const result = this.queue.remove(id);
    if (result.ok) this.persist();
    return { ...result, ...this.status() };
  }

  clear() {
    const result = this.queue.clear();
    if (result.ok) this.persist();
    return { ...result, ...this.status() };
  }

  start() {
    const began = this.queue.beginRun();
    if (!began.ok) return { ...began, ...this.status() };
    this.persist();
    this.kick();
    return { ok: true, ...this.status() };
  }

  stop() {
    this.queue.requestCancel();
    if (typeof this.abortRef.current === "function") {
      try {
        this.abortRef.current();
      } catch {
        // ignore
      }
    }
    this.persist();
    return { ok: true, ...this.status() };
  }

  kick() {
    if (this.busy) return;
    if (!this.queue.running || this.queue.cancelRequested) {
      if (this.queue.running) this.queue.finishRun();
      this.persist();
      return;
    }
    const next = this.queue.nextPending();
    if (!next) {
      this.queue.finishRun();
      this.persist();
      return;
    }
    this.runItem(next.id).catch(() => {});
  }

  outputPathFor(item, linkUrl) {
    if (item.kind === "episode") {
      const dest = episodeOutputPath(this.videoRoot, item);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      return dest;
    }
    const fileName = fileNameFromLink(linkUrl, item.title);
    return movieOutputPath(this.videoRoot, fileName);
  }

  headersToList(headers = {}) {
    return Object.entries(headers)
      .filter(([, value]) => value != null)
      .map(([name, value]) => ({ name, value }));
  }

  async fetchArtworkFile(url, dest, referer) {
    const headerObject = {
      Referer: referer || url,
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "User-Agent": defaultUserAgent()
    };
    if (typeof this.client.downloadToFile === "function") {
      await this.client.downloadToFile(url, dest, { headers: headerObject });
      return;
    }
    await this.downloadFn({
      url,
      outputPath: dest,
      headers: this.headersToList(headerObject)
    });
  }

  async resolvePosterUrl(queued) {
    if (queued.posterUrl) return queued.posterUrl;
    if (typeof this.client.text !== "function") return "";
    try {
      const page = await this.client.text(queued.movieUrl, {
        headers: { Referer: queued.movieUrl }
      });
      return pickArtworkUrlFromHtml(page.body, queued.movieUrl);
    } catch {
      return "";
    }
  }

  async attachArtwork(queued, outputPath) {
    try {
      const posterUrl = await this.resolvePosterUrl(queued);
      if (!posterUrl) return;
      const downloadToFile = ({ url, outputPath: dest, headers }) => {
        const referer = (headers || []).find((header) => /^referer$/i.test(header.name))?.value;
        return this.fetchArtworkFile(url, dest, referer || queued.movieUrl);
      };
      if (queued.kind === "episode") {
        const showFolder = showFolderFromEpisodePath(outputPath, this.videoRoot);
        await saveShowPoster(posterUrl, showFolder, {
          downloadToFile,
          referer: queued.movieUrl
        });
        return;
      }
      await saveArtworkFromUrl(posterUrl, outputPath, {
        downloadToFile,
        referer: queued.movieUrl
      });
    } catch {
      // Video already saved; missing artwork should not fail the queue item.
    }
  }

  async runItem(id) {
    if (this.busy) return;
    this.busy = true;
    const queued = this.queue.items.find((entry) => entry.id === id);
    if (!queued) {
      this.busy = false;
      this.kick();
      return;
    }

    this.queue.setCurrent(id);
    this.queue.patch(id, { error: null, progress: 1 });
    this.persist();
    this.current = { id, title: queued.title, phase: "Finding LoadShare link...", percent: 8 };

    try {
      if (this.queue.cancelRequested) {
        this.queue.markSkipped(id, "Cancelled");
        this.persist();
        return;
      }

      const link = await this.client.findDirectLink(queued.movieUrl);
      if (!link.ok) throw new Error(link.error);

      if (this.queue.cancelRequested) {
        this.queue.markSkipped(id, "Cancelled");
        this.persist();
        return;
      }

      const outputPath = this.outputPathFor(queued, link.best.url);
      this.queue.markDownloading(id);
      this.queue.patch(id, { qualityLabel: link.best.qualityLabel, progress: 12 });
      this.persist();
      this.current = {
        id,
        title: queued.title,
        phase: `Downloading ${link.best.qualityLabel}...`,
        percent: 12,
        qualityLabel: link.best.qualityLabel
      };

      await this.downloadFn({
        url: link.best.url,
        outputPath,
        headers: [
          { name: "User-Agent", value: defaultUserAgent() },
          { name: "Referer", value: queued.movieUrl },
          { name: "Accept", value: "*/*" }
        ],
        abortRef: this.abortRef,
        onProgress: ({ downloadedBytes, totalBytes }) => {
          const percent = totalBytes ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)) : 20;
          this.current = {
            id,
            title: queued.title,
            phase: `Downloading ${link.best.qualityLabel}...`,
            percent,
            qualityLabel: link.best.qualityLabel,
            downloadedBytes,
            totalBytes
          };
          const now = Date.now();
          if (now - this.lastProgressWrite > 2500) {
            this.lastProgressWrite = now;
            this.queue.patch(id, { progress: percent, status: "downloading" });
            this.persist();
          }
        }
      });

      if (!this.queue.cancelRequested) {
        await this.attachArtwork(queued, outputPath);
      }

      if (this.queue.cancelRequested) {
        this.queue.markSkipped(id, "Cancelled");
      } else {
        this.queue.markDone(id);
        this.current = null;
        if (typeof this.onLibraryInvalidate === "function") this.onLibraryInvalidate();
      }
      this.persist();
    } catch (error) {
      const cancelled = this.queue.cancelRequested || /aborted/i.test(error.message || "");
      this.queue.markFailed(id, cancelled ? "Cancelled" : error.message || String(error));
      this.persist();
      this.current = {
        id,
        title: queued.title,
        phase: cancelled ? "Cancelled" : error.message || "Download failed",
        percent: 0
      };
    } finally {
      this.busy = false;
      this.abortRef.current = null;
      if (this.queue.cancelRequested) {
        this.queue.finishRun();
        this.persist();
        return;
      }
      this.kick();
    }
  }
}
  return { DownloadRunner };
})();


const PORT = Number(process.env.PORT) || 8787;
const VIDEO_ROOT = path.resolve(process.env.VIDEO_ROOT || "/data/videos");
const DATA_ROOT = path.resolve(process.env.DATA_ROOT || "/data/app");
const PUBLIC_DIR = path.join(__dirname, "public");

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".m4v", ".webm", ".ts"]);
const POSTER_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const MIN_VIDEO_BYTES = 100 * 1024;
const MAX_SCAN_DEPTH = 6;
const LIBRARY_CACHE_MS = 20_000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".ts": "video/mp2t",
  ".zip": "application/zip"
};

let libraryCache = { at: 0, payload: null, index: new Map() };
const tornado = new TornadoClient();
const downloads = new DownloadRunner(tornado);
downloads.onLibraryInvalidate = () => {
  libraryCache = { at: 0, payload: null, index: new Map() };
};

function idFor(relPath) {
  return crypto.createHash("sha1").update(relPath).digest("hex").slice(0, 16);
}

function ensureDataRoot() {
  try {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
  } catch {
    // Volume may already exist.
  }
}

function isInside(root, target) {
  const rel = path.relative(root, target);
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON");
  }
}

function titleFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename));
  const cleaned = base.replace(/[-_]+/g, " ").replace(/\s+\d{3,}$/, "").trim();
  if (!cleaned) return base;
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function findPoster(videoPath) {
  const base = videoPath.replace(/\.(mp4|mkv|mov|m4v|webm|ts)$/i, "");
  const dir = path.dirname(videoPath);
  const candidates = [
    `${base}-poster.jpg`,
    `${base}-poster.jpeg`,
    `${base}-poster.png`,
    `${base}-poster.webp`,
    `${base}.jpg`,
    `${base}.jpeg`,
    `${base}.png`,
    `${base}.webp`,
    path.join(dir, "poster.jpg"),
    path.join(dir, "poster.jpeg"),
    path.join(dir, "poster.png"),
    path.join(dir, "folder.jpg"),
    path.join(dir, "cover.jpg")
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // try next
    }
  }

  const root = path.resolve(VIDEO_ROOT);
  let walk = dir;
  while (true) {
    const resolved = path.resolve(walk);
    for (const name of ["poster.jpg", "poster.jpeg", "poster.png", "poster.webp", "folder.jpg", "cover.jpg"]) {
      const candidate = path.join(resolved, name);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // try next
      }
    }
    if (resolved === root) break;
    const parent = path.dirname(resolved);
    if (parent === resolved) break;
    walk = parent;
  }
  return null;
}

function parseEpisodeMeta(filePath) {
  const fileName = path.basename(filePath);
  const relative = path.relative(VIDEO_ROOT, filePath);
  const parts = relative.split(/[/\\]/).filter(Boolean);
  const episodeMatch = fileName.match(/\bS(\d{1,2})\s*E(\d{1,3})\b/i);
  const seasonFolder = parts.find((part) => /^season\s*\d{1,2}$/i.test(part));

  if (!episodeMatch && !seasonFolder) return null;

  const tvRootIdx = parts.findIndex((part) => /^(tv shows|anime|series|movies)$/i.test(part));
  let showTitle = null;
  if (tvRootIdx >= 0 && parts.length > tvRootIdx + 1) {
    showTitle = parts[tvRootIdx + 1];
  } else if (seasonFolder) {
    const seasonIdx = parts.findIndex((part) => /^season\s*\d{1,2}$/i.test(part));
    if (seasonIdx > 0) showTitle = parts[seasonIdx - 1];
  } else if (parts.length >= 2 && !/^freezer$/i.test(parts[parts.length - 2])) {
    showTitle = parts[parts.length - 2];
  }

  return {
    showTitle: String(showTitle || titleFromFilename(fileName).replace(/\bS\d+\s*E\d+\b/i, "").trim() || "Series")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    season: episodeMatch ? Number(episodeMatch[1]) : Number((seasonFolder || "1").match(/\d+/)?.[0] || 1),
    episode: episodeMatch ? Number(episodeMatch[2]) : 0
  };
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function storageInfo() {
  try {
    const stats = fs.statfsSync(VIDEO_ROOT);
    const blockSize = Number(stats.bsize) || 0;
    const total = Number(stats.blocks) * blockSize;
    const available = Number(stats.bavail ?? stats.bfree) * blockSize;
    const used = Math.max(0, total - Math.max(0, available));
    return {
      ok: true,
      total,
      available: Math.max(0, available),
      used,
      usedPercent: total > 0 ? (used / total) * 100 : 0
    };
  } catch (error) {
    return { ok: false, error: error.message || "Could not read storage" };
  }
}

function scanLibrary() {
  const now = Date.now();
  if (libraryCache.payload && now - libraryCache.at < LIBRARY_CACHE_MS) {
    return libraryCache.payload;
  }

  const index = new Map();
  const filesByRel = new Map();
  const walk = (dir, depth) => {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (name.startsWith(".")) continue;
      const filePath = path.join(dir, name);
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (depth < MAX_SCAN_DEPTH) walk(filePath, depth + 1);
        continue;
      }
      if (!stat.isFile() || !VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase())) continue;
      if (typeof isOriginalVideoName === "function" && isOriginalVideoName(name)) continue;
      if (typeof isTempEncodeName === "function" && isTempEncodeName(name)) continue;
      if (stat.size < MIN_VIDEO_BYTES) continue;
      const rel = path.relative(VIDEO_ROOT, filePath).split(path.sep).join("/");
      const posterPath = findPoster(filePath);
      const posterRel = posterPath
        ? path.relative(VIDEO_ROOT, posterPath).split(path.sep).join("/")
        : null;
      const id = idFor(rel);
      const posterId = posterRel ? idFor(`poster:${posterRel}`) : null;
      index.set(id, { kind: "video", rel, fileName: name });
      if (posterRel) index.set(posterId, { kind: "poster", rel: posterRel });
      filesByRel.set(rel, {
        id,
        fileName: name,
        title: titleFromFilename(name),
        rel,
        size: stat.size,
        modifiedAt: stat.mtimeMs,
        posterId,
        posterRel
      });
    }
  };

  const exists = fs.existsSync(VIDEO_ROOT);
  if (exists) walk(VIDEO_ROOT, 0);

  const shows = new Map();
  const frozenShows = new Map();
  const movies = [];
  const frozenMovies = [];
  for (const file of filesByRel.values()) {
    const abs = path.join(VIDEO_ROOT, file.rel);
    const frozen = isFrozenRel(file.rel);
    const tv = parseEpisodeMeta(abs);
    if (!tv) {
      (frozen ? frozenMovies : movies).push({ kind: "movie", frozen, ...file });
      continue;
    }
    const key = tv.showTitle.toLowerCase();
    const showMap = frozen ? frozenShows : shows;
    let show = showMap.get(key);
    if (!show) {
      const slug = key.replace(/[^a-z0-9]+/g, "-");
      show = {
        kind: "tv-show",
        id: frozen ? `show-frozen-${slug}` : `show-${slug}`,
        title: tv.showTitle,
        frozen,
        seasons: new Set(),
        episodes: [],
        size: 0,
        modifiedAt: 0,
        posterId: file.posterId,
        posterRel: file.posterRel
      };
      showMap.set(key, show);
    }
    show.episodes.push({
      kind: "episode",
      id: file.id,
      title: file.title,
      fileName: file.fileName,
      rel: file.rel,
      season: tv.season,
      episode: tv.episode,
      size: file.size,
      modifiedAt: file.modifiedAt,
      posterId: file.posterId
    });
    show.seasons.add(tv.season);
    show.size += file.size;
    show.modifiedAt = Math.max(show.modifiedAt, file.modifiedAt);
    if (!show.posterId && file.posterId) {
      show.posterId = file.posterId;
      show.posterRel = file.posterRel;
    }
  }

  const mapShowEntries = (show) => {
    const seasons = [...show.seasons].sort((a, b) => a - b);
    show.episodes.sort((a, b) => a.season - b.season || (a.episode || 0) - (b.episode || 0));
    return {
      kind: "tv-show",
      id: show.id,
      title: show.title,
      frozen: Boolean(show.frozen),
      episodeCount: show.episodes.length,
      seasonCount: seasons.length,
      seasons,
      episodes: show.episodes,
      size: show.size,
      sizeLabel: formatBytes(show.size),
      modifiedAt: show.modifiedAt,
      posterId: show.posterId,
      subtitle: `${show.episodes.length} episode${show.episodes.length === 1 ? "" : "s"} · ${seasons.length} season${seasons.length === 1 ? "" : "s"}`
    };
  };

  const showEntries = [...shows.values()].map(mapShowEntries);
  const frozenShowEntries = [...frozenShows.values()].map((show) => {
    const mapped = mapShowEntries(show);
    const extra =
      typeof compressInfoForRels === "function"
        ? compressInfoForRels(
            VIDEO_ROOT,
            (mapped.episodes || []).map((episode) => episode.rel)
          )
        : {};
    return { ...mapped, ...extra };
  });

  const movieEntries = movies
    .map((movie) => ({ ...movie, frozen: false, sizeLabel: formatBytes(movie.size) }))
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
  const frozenMovieEntries = frozenMovies
    .map((movie) => ({
      ...movie,
      frozen: true,
      sizeLabel: formatBytes(movie.size),
      ...(typeof compressInfoForVideo === "function" ? compressInfoForVideo(VIDEO_ROOT, movie.rel) : {})
    }))
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
  showEntries.sort((a, b) => b.modifiedAt - a.modifiedAt);
  frozenShowEntries.sort((a, b) => b.modifiedAt - a.modifiedAt);

  const payload = {
    ok: true,
    exists,
    folderPath: VIDEO_ROOT,
    movieCount: movieEntries.length,
    showCount: showEntries.length,
    episodeCount: showEntries.reduce((sum, show) => sum + show.episodeCount, 0),
    movies: movieEntries,
    shows: showEntries,
    frozen: {
      movies: frozenMovieEntries,
      shows: frozenShowEntries,
      movieCount: frozenMovieEntries.length,
      showCount: frozenShowEntries.length,
      episodeCount: frozenShowEntries.reduce((sum, show) => sum + show.episodeCount, 0)
    },
    storage: storageInfo()
  };
  libraryCache = { at: now, payload, index };
  return payload;
}

function lookupById(id) {
  scanLibrary();
  return libraryCache.index.get(id) || null;
}

function invalidateLibrary() {
  libraryCache = { at: 0, payload: null, index: new Map() };
}

function findLibraryTitle(library, id) {
  const movie = (library.movies || []).find((item) => item.id === id);
  if (movie) return { kind: "movie", item: movie, frozen: false };
  const show = (library.shows || []).find((item) => item.id === id);
  if (show) return { kind: "tv-show", item: show, frozen: false };
  const frozenMovie = (library.frozen?.movies || []).find((item) => item.id === id);
  if (frozenMovie) return { kind: "movie", item: frozenMovie, frozen: true };
  const frozenShow = (library.frozen?.shows || []).find((item) => item.id === id);
  if (frozenShow) return { kind: "tv-show", item: frozenShow, frozen: true };
  return null;
}

function freezerMessage(result) {
  if (result?.alreadyFrozen) return "Already in Freezer";
  if (result?.compressed) return "Frozen";
  return "Moved to Freezer — compress with the encode worker";
}

function thawMessage(result) {
  if (result?.qualityRestored) return "Thawed and restored original";
  if (result?.originalKept) return "Thawed (original still kept — quality was not restored)";
  if (result?.compressStatus === "done") return "Thawed (compressed copy — original was discarded)";
  return "Thawed";
}

let freezerBusy = false;

async function freezeLibraryItem(body) {
  const id = String(body?.id || body?.showId || "");
  if (!id) return { ok: false, error: "Missing id" };
  const match = findLibraryTitle(scanLibrary(), id);
  if (!match) return { ok: false, error: "Title not found in library" };
  if (match.frozen) return { ok: false, error: "Already in Freezer" };
  if (match.kind === "movie") {
    const result = await freezeMovie(VIDEO_ROOT, match.item.rel);
    invalidateLibrary();
    return {
      ok: true,
      kind: "movie",
      title: match.item.title,
      compressed: Boolean(result.compressed),
      compressStatus: result.compressStatus,
      reason: result.compressed ? undefined : result.reason,
      message: freezerMessage(result),
      rel: result.rel
    };
  }
  const result = await freezeShow(
    VIDEO_ROOT,
    (match.item.episodes || []).map((episode) => episode.rel),
    { showTitle: match.item.title }
  );
  invalidateLibrary();
  return {
    ok: true,
    kind: "tv-show",
    title: match.item.title,
    compressed: Boolean(result.compressed),
    compressStatus: result.compressStatus,
    reason: result.compressed ? undefined : result.reason,
    message: freezerMessage(result),
    rel: result.rel
  };
}

async function thawLibraryItem(body) {
  const id = String(body?.id || body?.showId || "");
  if (!id) return { ok: false, error: "Missing id" };
  const match = findLibraryTitle(scanLibrary(), id);
  if (!match) return { ok: false, error: "Title not found in Freezer" };
  if (!match.frozen) return { ok: false, error: "Title is not in Freezer" };
  if (match.kind === "movie") {
    const result = await thawMovie(VIDEO_ROOT, match.item.rel);
    invalidateLibrary();
    return {
      ok: true,
      kind: "movie",
      title: match.item.title,
      compressed: Boolean(result.compressed),
      compressStatus: result.compressStatus,
      originalKept: Boolean(result.originalKept),
      qualityRestored: false,
      message: thawMessage(result),
      rel: result.rel
    };
  }
  const result = await thawShow(
    VIDEO_ROOT,
    (match.item.episodes || []).map((episode) => episode.rel),
    { showTitle: match.item.title }
  );
  invalidateLibrary();
  return {
    ok: true,
    kind: "tv-show",
    title: match.item.title,
    compressed: Boolean(result.compressed),
    compressStatus: result.compressStatus,
    originalKept: Boolean(result.originalKept),
    qualityRestored: false,
    message: thawMessage(result),
    rel: result.rel
  };
}

function freezerPayload() {
  const library = scanLibrary();
  const movies = library.frozen?.movies || [];
  const shows = library.frozen?.shows || [];
  const counts = { pending: 0, encoding: 0, done: 0, failed: 0, restored: 0 };
  for (const item of [...movies, ...shows]) {
    const status = item.compressStatus || "pending";
    if (counts[status] == null) counts.pending += 1;
    else counts[status] += 1;
  }
  return {
    ok: true,
    movies,
    shows,
    movieCount: movies.length,
    showCount: shows.length,
    episodeCount: library.frozen?.episodeCount || 0,
    counts,
    worker: { downloadUrl: "/api/freezer/worker.zip" }
  };
}

async function restoreLibraryItem(body) {
  const id = String(body?.id || body?.showId || "");
  if (!id) return { ok: false, error: "Missing id" };
  const match = findLibraryTitle(scanLibrary(), id);
  if (!match) return { ok: false, error: "Title not found" };
  if (match.kind === "movie") {
    const result = restoreOriginal(VIDEO_ROOT, match.item.rel);
    invalidateLibrary();
    return { ...result, kind: "movie", title: match.item.title };
  }
  const rels = (match.item.episodes || []).map((episode) => episode.rel);
  let restored = 0;
  let last = null;
  const errors = [];
  for (const rel of rels) {
    try {
      last = restoreOriginal(VIDEO_ROOT, rel);
      restored += 1;
    } catch (error) {
      errors.push(error.message || "Restore failed");
    }
  }
  invalidateLibrary();
  if (!restored) return { ok: false, error: errors[0] || "Original was discarded or never kept" };
  return {
    ok: true,
    restored: true,
    qualityRestored: true,
    kind: "tv-show",
    title: match.item.title,
    message: `Restored original on ${restored} episode${restored === 1 ? "" : "s"}`,
    rel: last?.rel
  };
}

async function discardLibraryItem(body) {
  const id = String(body?.id || body?.showId || "");
  if (!id) return { ok: false, error: "Missing id" };
  const match = findLibraryTitle(scanLibrary(), id);
  if (!match) return { ok: false, error: "Title not found" };
  if (match.kind === "movie") {
    const result = discardOriginal(VIDEO_ROOT, match.item.rel);
    invalidateLibrary();
    return { ...result, kind: "movie", title: match.item.title };
  }
  const rels = (match.item.episodes || []).map((episode) => episode.rel);
  let discarded = 0;
  for (const rel of rels) {
    try {
      discardOriginal(VIDEO_ROOT, rel);
      discarded += 1;
    } catch {
      // skip episodes without an original
    }
  }
  invalidateLibrary();
  return {
    ok: true,
    discarded: true,
    originalKept: false,
    qualityRestored: false,
    kind: "tv-show",
    title: match.item.title,
    message: discarded
      ? "Original discarded. Playback is the compressed file."
      : "No original was kept for this title."
  };
}

function absFromRel(rel) {
  const abs = path.resolve(VIDEO_ROOT, rel);
  if (!isInside(VIDEO_ROOT, abs) && abs !== VIDEO_ROOT) return null;
  return abs;
}

function pipeFile(req, res, filePath, contentType, downloadName) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    sendText(res, 404, "Not found");
    return;
  }

  const total = stat.size;
  const range = req.headers.range;
  const disposition = downloadName
    ? `inline; filename="${String(downloadName).replace(/"/g, "")}"`
    : "inline";

  if (range) {
    const match = String(range).match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      res.writeHead(416, { "Content-Range": `bytes */${total}` });
      res.end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : total - 1;
    if (start >= total || end >= total || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${total}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      "Content-Type": contentType,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Accept-Ranges": "bytes",
      "Content-Disposition": disposition,
      "Cache-Control": "public, max-age=3600"
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": total,
    "Accept-Ranges": "bytes",
    "Content-Disposition": disposition,
    "Cache-Control": "public, max-age=3600"
  });
  fs.createReadStream(filePath).pipe(res);
}

function serveStatic(req, res, urlPath) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const abs = path.resolve(PUBLIC_DIR, rel);
  if (!isInside(PUBLIC_DIR, abs) && abs !== path.join(PUBLIC_DIR, "index.html")) {
    sendText(res, 403, "Forbidden");
    return;
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    sendText(res, 404, "Not found");
    return;
  }
  const ext = path.extname(abs).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(abs).pipe(res);
}

function healthPayload() {
  const mem = process.memoryUsage();
  const library = scanLibrary();
  return {
    ok: true,
    app: "CinaRip Library",
    host: process.env.HOSTNAME || "nas",
    arch: process.arch,
    node: process.version,
    uptimeSec: Math.round(process.uptime()),
    memoryMb: Math.round(mem.rss / 1024 / 1024),
    videoRoot: VIDEO_ROOT,
    videoRootExists: fs.existsSync(VIDEO_ROOT),
    movieCount: library.movieCount,
    showCount: library.showCount,
    episodeCount: library.episodeCount,
    storage: library.storage,
    apis: ["search", "downloads", "tornado", "freezer"]
  };
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;

  if (pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, healthPayload());
    return;
  }

  if (pathname === "/api/library" && req.method === "GET") {
    sendJson(res, 200, scanLibrary());
    return;
  }

  if (pathname === "/api/library/freeze" && req.method === "POST") {
    if (freezerBusy) {
      sendJson(res, 409, { ok: false, error: "Freezer is already working" });
      return;
    }
    freezerBusy = true;
    try {
      const result = await freezeLibraryItem(await readJson(req));
      sendJson(res, result.ok ? 200 : 400, result);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "Freeze failed" });
    } finally {
      freezerBusy = false;
    }
    return;
  }

  if (pathname === "/api/library/thaw" && req.method === "POST") {
    if (freezerBusy) {
      sendJson(res, 409, { ok: false, error: "Freezer is already working" });
      return;
    }
    freezerBusy = true;
    try {
      const result = await thawLibraryItem(await readJson(req));
      sendJson(res, result.ok ? 200 : 400, result);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "Thaw failed" });
    } finally {
      freezerBusy = false;
    }
    return;
  }

  if (pathname === "/api/freezer" && req.method === "GET") {
    sendJson(res, 200, freezerPayload());
    return;
  }

  if (pathname === "/api/freezer/status" && req.method === "GET") {
    sendJson(res, 200, { ok: true, ...freezerPayload() });
    return;
  }

  if (pathname === "/api/freezer/status" && req.method === "POST") {
    invalidateLibrary();
    sendJson(res, 200, { ok: true, ...freezerPayload() });
    return;
  }

  if (pathname === "/api/freezer/worker.zip" && req.method === "GET") {
    try {
      const zip = buildWorkerZip();
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="cinarip-freezer-worker.zip"',
        "Content-Length": zip.length,
        "Cache-Control": "no-store"
      });
      res.end(zip);
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || "Could not build worker zip" });
    }
    return;
  }

  if (pathname === "/api/freezer/thaw" && req.method === "POST") {
    if (freezerBusy) {
      sendJson(res, 409, { ok: false, error: "Freezer is already working" });
      return;
    }
    freezerBusy = true;
    try {
      const result = await thawLibraryItem(await readJson(req));
      sendJson(res, result.ok ? 200 : 400, result);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "Thaw failed" });
    } finally {
      freezerBusy = false;
    }
    return;
  }

  if (pathname === "/api/freezer/restore-original" && req.method === "POST") {
    if (freezerBusy) {
      sendJson(res, 409, { ok: false, error: "Freezer is already working" });
      return;
    }
    freezerBusy = true;
    try {
      const result = await restoreLibraryItem(await readJson(req));
      sendJson(res, result.ok ? 200 : 400, result);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "Restore failed" });
    } finally {
      freezerBusy = false;
    }
    return;
  }

  if (pathname === "/api/freezer/discard-original" && req.method === "POST") {
    if (freezerBusy) {
      sendJson(res, 409, { ok: false, error: "Freezer is already working" });
      return;
    }
    freezerBusy = true;
    try {
      const result = await discardLibraryItem(await readJson(req));
      sendJson(res, result.ok ? 200 : 400, result);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "Discard failed" });
    } finally {
      freezerBusy = false;
    }
    return;
  }

  if (pathname === "/api/tornado/status" && req.method === "GET") {
    sendJson(res, 200, await tornado.sessionStatus());
    return;
  }

  if (pathname === "/api/tornado/probe" && req.method === "GET") {
    sendJson(res, 200, await tornado.probe());
    return;
  }

  if (pathname === "/api/tornado/login" && req.method === "POST") {
    const body = await readJson(req);
    if (body.cookie) {
      tornado.setCookieHeader(body.cookie);
      sendJson(res, 200, await tornado.sessionStatus());
      return;
    }
    const result = await tornado.login(body.username, body.password, body.recaptcha);
    sendJson(res, result.ok ? 200 : 400, { ...result, loginUrl: tornado.loginUrl() });
    return;
  }

  if (pathname === "/api/search" && req.method === "GET") {
    const result = await tornado.search(url.searchParams.get("q") || "");
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (pathname === "/api/show" && req.method === "GET") {
    const showUrl = url.searchParams.get("url") || "";
    const seasonRaw = url.searchParams.get("season");
    const season = seasonRaw ? Number.parseInt(seasonRaw, 10) : null;
    const result = await tornado.fetchShow(showUrl, season > 0 ? season : null);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (pathname === "/api/downloads" && req.method === "GET") {
    sendJson(res, 200, { ok: true, ...downloads.status() });
    return;
  }

  if (pathname === "/api/downloads/start" && req.method === "POST") {
    const result = downloads.start();
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (pathname === "/api/downloads/stop" && req.method === "POST") {
    sendJson(res, 200, downloads.stop());
    return;
  }

  if (pathname === "/api/downloads/clear" && req.method === "POST") {
    const result = downloads.clear();
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (pathname === "/api/downloads/remove" && req.method === "POST") {
    const body = await readJson(req);
    if (!body.id) {
      sendJson(res, 400, { ok: false, error: "Missing id" });
      return;
    }
    const result = downloads.remove(body.id);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (pathname === "/api/downloads" && req.method === "POST") {
    const body = await readJson(req);
    if (Array.isArray(body.episodes) && body.episodes.length) {
      const result = downloads.enqueueEpisodes(body.episodes, {
        showTitle: body.showTitle,
        posterUrl: body.posterUrl
      });
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }
    if (Array.isArray(body.movies) && body.movies.length) {
      const result = downloads.enqueueMany(body.movies);
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }
    if (body.kind === "episode" || body.episode) {
      const result = downloads.enqueueEpisode(
        {
          url: body.movieUrl || body.url,
          title: body.episodeTitle || body.title,
          season: body.season,
          episode: body.episode,
          showTitle: body.showTitle,
          posterUrl: body.posterUrl
        },
        { showTitle: body.showTitle, posterUrl: body.posterUrl }
      );
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }
    if (!body.movieUrl) {
      sendJson(res, 400, { ok: false, error: "Missing movieUrl" });
      return;
    }
    const result = downloads.enqueue({
      movieUrl: body.movieUrl,
      title: body.title,
      posterUrl: body.posterUrl
    });
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (pathname.startsWith("/api/poster/") && req.method === "GET") {
    const id = decodeURIComponent(pathname.slice("/api/poster/".length));
    const match = lookupById(id);
    if (!match?.rel || match.kind !== "poster") {
      sendText(res, 404, "No poster");
      return;
    }
    const abs = absFromRel(match.rel);
    if (!abs || !POSTER_EXTENSIONS.has(path.extname(abs).toLowerCase())) {
      sendText(res, 404, "No poster");
      return;
    }
    pipeFile(req, res, abs, MIME[path.extname(abs).toLowerCase()] || "image/jpeg");
    return;
  }

  if (pathname.startsWith("/api/stream/") && req.method === "GET") {
    const id = decodeURIComponent(pathname.slice("/api/stream/".length));
    const match = lookupById(id);
    if (!match?.rel || match.kind !== "video") {
      sendText(res, 404, "Video not found");
      return;
    }
    const abs = absFromRel(match.rel);
    if (!abs) {
      sendText(res, 404, "Video not found");
      return;
    }
    pipeFile(
      req,
      res,
      abs,
      MIME[path.extname(abs).toLowerCase()] || "video/mp4",
      match.fileName
    );
    return;
  }

  sendJson(res, 404, { ok: false, error: "Unknown API route", path: pathname });
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
        return;
      }
      serveStatic(req, res, url.pathname);
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || "Server error" });
    }
  });
}

function start() {
  ensureDataRoot();
  const server = createServer();
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`CinaRip Library listening on ${PORT}`);
    console.log(`Videos: ${VIDEO_ROOT} exists=${fs.existsSync(VIDEO_ROOT)}`);
  });
}

start();
