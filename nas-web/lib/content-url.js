"use strict";

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

module.exports = {
  BASE_URL,
  TV_PAGE_PATTERN,
  decodeHtml,
  normalizeHref,
  classifyContentUrl,
  canonicalMoviePageUrl,
  canonicalContentUrl,
  normalizeMovieUrl,
  extractMovieIdFromUrl,
  extractEpisodeWatchId,
  extractGetbuttonId,
  extractDownloadIds,
  extractPageDownloadIds,
  mergeDownloadIds,
  titleFromUrl,
  titleFromMovieUrl,
  isCatalogTvItem,
  isTvShowPageUrl,
  isTvEpisodePageUrl,
  isWatchingEpisodeUrl,
  episodeFileLabel,
  safeShowFolderName,
  showBaseSlugFromUrl,
  seasonNumberFromUrl,
  parseTornadoSeriesUrl,
  toSeasonHubUrl,
  normalizeShowSlug,
  slugMatchesCurrentShow,
  catalogCounts
};
