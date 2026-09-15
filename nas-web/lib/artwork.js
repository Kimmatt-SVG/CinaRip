"use strict";

const fs = require("fs");
const path = require("path");
const { readShowMeta } = require("./tv-show-parse");

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

module.exports = {
  videoBasename,
  posterPathForVideo,
  mediaServerPosterPath,
  isUsableArtworkUrl,
  pickArtworkUrlFromHtml,
  showFolderFromEpisodePath,
  saveArtworkFromUrl,
  saveShowPoster
};
