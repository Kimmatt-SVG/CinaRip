const fs = require("fs");
const path = require("path");
const fetch = require("cross-fetch");
const {
  posterPathForVideo,
  mediaServerPosterPath
} = require("./poster-utils");

const ARTWORK_EXTRACT_SCRIPT = `
(() => {
  const pick = (url) => {
    if (!url || typeof url !== "string") return null;
    if (url.startsWith("data:")) return null;
    const lower = url.toLowerCase();
    if (/avatar|favicon|logo|icon|sprite|banner-ad|1x1|pixel/.test(lower)) return null;
    try {
      return new URL(url, document.baseURI).href;
    } catch {
      return null;
    }
  };

  const pageTitle = (
    document.querySelector('meta[property="og:title"]')?.content ||
    document.querySelector("h1")?.textContent ||
    document.title ||
    ""
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const candidates = [];

  const metaSelectors = [
    'meta[property="og:image"]',
    'meta[property="og:image:url"]',
    'meta[name="twitter:image"]',
    'meta[itemprop="image"]',
    'link[rel="image_src"]'
  ];

  for (const selector of metaSelectors) {
    const node = document.querySelector(selector);
    const value = node?.content || node?.href;
    const picked = pick(value);
    if (picked) candidates.push({ url: picked, score: 5000, source: "meta" });
  }

  const imageSelectors = [
    ".film-poster img",
    ".movie-poster img",
    ".poster img",
    "img.poster",
    "img[class*='poster']",
    "img[alt*='poster' i]",
    ".thumbnail img",
    "article img",
    "main img"
  ];

  for (const selector of imageSelectors) {
    for (const img of document.querySelectorAll(selector)) {
      const picked = pick(img.currentSrc || img.src);
      if (!picked) continue;

      let score = 1000;
      if (selector.includes("poster")) score += 3000;
      if (img.naturalWidth >= 300) score += img.naturalWidth;
      if (img.naturalHeight >= 400) score += img.naturalHeight;
      if (img.naturalWidth > 0 && img.naturalWidth < 180) score -= 2000;
      if (img.naturalHeight > 0 && img.naturalHeight < 220) score -= 2000;

      const alt = (img.alt || "").toLowerCase();
      if (pageTitle && alt && pageTitle.includes(alt.replace(/[^a-z0-9]+/g, " ").trim())) {
        score += 1500;
      }

      candidates.push({ url: picked, score, source: selector });
    }
  }

  const videoPoster = pick(document.querySelector("video")?.poster);
  if (videoPoster) candidates.push({ url: videoPoster, score: 800, source: "video" });

  const unique = new Map();
  for (const candidate of candidates) {
    const existing = unique.get(candidate.url);
    if (!existing || candidate.score > existing.score) {
      unique.set(candidate.url, candidate);
    }
  }

  const ranked = [...unique.values()].sort((a, b) => {
    const scoreUrl = (entry) => {
      const lower = entry.url.toLowerCase();
      let bonus = entry.score;
      if (lower.includes("poster")) bonus += 1000;
      if (lower.includes("cover")) bonus += 500;
      if (lower.includes("thumb")) bonus -= 300;
      if (/(\\d{3,4})x(\\d{3,4})/.test(lower)) {
        const match = lower.match(/(\\d{3,4})x(\\d{3,4})/);
        bonus += Number(match[1]) * Number(match[2]) / 10;
      }
      return bonus;
    };
    return scoreUrl(b) - scoreUrl(a);
  });

  return ranked[0]?.url || null;
})();
`;

function headersToFetchObject(requestHeaders = []) {
  const headers = {};
  for (const header of requestHeaders) {
    if (header?.name && header?.value) {
      headers[header.name] = header.value;
    }
  }
  return headers;
}

async function extractArtworkUrl(webContents) {
  if (!webContents) return null;
  try {
    return await webContents.executeJavaScript(ARTWORK_EXTRACT_SCRIPT, true);
  } catch {
    return null;
  }
}

async function downloadArtwork(imageUrl, requestHeaders = [], outputPath) {
  const response = await fetch(imageUrl, {
    headers: headersToFetchObject(requestHeaders),
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Artwork download failed (${response.status}).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

async function saveArtworkFromUrl(imageUrl, videoOutputPath, requestHeaders = []) {
  if (!imageUrl || !videoOutputPath) return null;

  const primaryPosterPath = posterPathForVideo(videoOutputPath, ".jpg");
  await downloadArtwork(imageUrl, requestHeaders, primaryPosterPath);

  const mediaPosterPath = mediaServerPosterPath(videoOutputPath, ".jpg");
  if (mediaPosterPath !== primaryPosterPath) {
    try {
      fs.copyFileSync(primaryPosterPath, mediaPosterPath);
    } catch {
      // Sidecar copy is optional.
    }
  }

  return primaryPosterPath;
}

async function saveShowPoster(posterUrl, requestHeaders, showFolder, options = {}) {
  if (!posterUrl || !showFolder) return null;
  fs.mkdirSync(showFolder, { recursive: true });
  const outputPath = path.join(showFolder, "poster.jpg");
  const force = Boolean(options.force);
  try {
    if (!force && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 8 * 1024) {
      return outputPath;
    }
  } catch {
    // Continue and rewrite.
  }
  await downloadArtwork(posterUrl, requestHeaders, outputPath);
  return outputPath;
}

async function saveArtworkForPage(webContents, requestHeaders, videoOutputPath) {
  const artworkUrl = await extractArtworkUrl(webContents);
  if (!artworkUrl) return null;
  return saveArtworkFromUrl(artworkUrl, videoOutputPath, requestHeaders);
}

module.exports = {
  extractArtworkUrl,
  saveArtworkForPage,
  saveArtworkFromUrl,
  downloadArtwork,
  saveShowPoster
};
