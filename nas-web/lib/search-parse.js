"use strict";

const {
  BASE_URL,
  decodeHtml,
  classifyContentUrl,
  titleFromUrl,
  catalogCounts
} = require("./content-url");

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

module.exports = {
  cleanTitle,
  yearFromText,
  diagnoseSearchHtml,
  parseSearchResults,
  parseSearchHtml
};
