"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  FREEZER_DIR,
  isOriginalVideoName,
  isTempEncodeName,
  readSidecar,
  findOriginal,
  toPosixRel
} = require("./encode");

const VIDEO_EXT_PATTERN = /\.(mp4|mkv|mov|m4v|webm|ts)$/i;
const TV_ROOT_PATTERN = /^(tv shows|anime|series)$/i;
const SEASON_FOLDER_PATTERN = /^season\s*\d{1,2}$/i;
const POSTER_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

function relParts(rel) {
  return toPosixRel(rel).split("/").filter(Boolean);
}

function idFor(relPath) {
  return crypto.createHash("sha1").update(relPath).digest("hex").slice(0, 16);
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

function titleFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename));
  const cleaned = base.replace(/[-_]+/g, " ").replace(/\s+\d{3,}$/, "").trim();
  if (!cleaned) return base;
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function findPosterRel(videoRoot, videoPath) {
  const base = videoPath.replace(VIDEO_EXT_PATTERN, "");
  const dir = path.dirname(videoPath);
  const candidates = [];
  for (const ext of POSTER_EXTS) {
    candidates.push(`${base}-poster${ext}`, `${base}${ext}`);
  }
  for (const name of ["poster.jpg", "poster.jpeg", "poster.png", "poster.webp", "folder.jpg", "cover.jpg"]) {
    candidates.push(path.join(dir, name));
  }
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return toPosixRel(path.relative(videoRoot, candidate));
      }
    } catch {
      // try next
    }
  }
  return null;
}

function walkPlayback(dir, videoRoot, acc) {
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
      walkPlayback(filePath, videoRoot, acc);
      continue;
    }
    if (!stat.isFile() || !isPlaybackVideoName(name) || stat.size <= 0) continue;
    const rel = toPosixRel(path.relative(videoRoot, filePath));
    const meta = readSidecar(filePath);
    const originalAbs = findOriginal(videoRoot, filePath, meta);
    let compressStatus = meta?.status || "pending";
    if (!meta && originalAbs) compressStatus = "done";
    acc.push({
      id: idFor(rel),
      rel,
      fileName: name,
      title: titleFromFilename(name),
      abs: filePath,
      size: stat.size,
      posterRel: findPosterRel(videoRoot, filePath),
      compressStatus,
      originalKept: Boolean(originalAbs),
      compressError: meta?.error || null
    });
  }
  return acc;
}

function scanFreezer(videoRoot) {
  const freezerRoot = path.join(videoRoot, FREEZER_DIR);
  const files = [];
  if (fs.existsSync(freezerRoot)) walkPlayback(freezerRoot, videoRoot, files);

  const movies = [];
  const shows = new Map();
  for (const file of files) {
    const showTitle = showTitleFromRel(file.rel);
    if (!showTitle) {
      movies.push({ kind: "movie", ...file });
      continue;
    }
    const key = showTitle.toLowerCase();
    let show = shows.get(key);
    if (!show) {
      show = {
        kind: "tv-show",
        id: `show-${key.replace(/[^a-z0-9]+/g, "-")}`,
        title: showTitle,
        rels: [],
        files: [],
        posterRel: file.posterRel,
        size: 0
      };
      shows.set(key, show);
    }
    show.files.push(file);
    show.rels.push(file.rel);
    show.size += file.size;
    if (!show.posterRel && file.posterRel) show.posterRel = file.posterRel;
  }

  const showList = [...shows.values()].map((show) => {
    const statuses = show.files.map((file) => file.compressStatus);
    let compressStatus = "pending";
    if (statuses.includes("encoding")) compressStatus = "encoding";
    else if (statuses.includes("failed")) compressStatus = "failed";
    else if (statuses.length && statuses.every((status) => status === "done")) compressStatus = "done";
    else if (statuses.length && statuses.every((status) => status === "restored")) compressStatus = "restored";
    else if (statuses.includes("pending")) compressStatus = "pending";
    return {
      ...show,
      episodeCount: show.files.length,
      compressStatus,
      originalKept: show.files.some((file) => file.originalKept),
      compressError: show.files.find((file) => file.compressError)?.compressError || null
    };
  });

  return { movies, shows: showList, files };
}

function queueBuckets(scan, currentRel) {
  const pending = [];
  const encoding = [];
  const failed = [];
  const pushItem = (item) => {
    if (item.compressStatus === "encoding" || item.rel === currentRel) encoding.push(item);
    else if (item.compressStatus === "failed") failed.push(item);
    else if (item.compressStatus === "pending") pending.push(item);
  };
  for (const movie of scan.movies) pushItem(movie);
  for (const show of scan.shows) {
    const queueItem = {
      kind: "tv-show",
      id: show.id,
      title: show.title,
      rel: show.rels[0],
      compressStatus: show.compressStatus,
      episodeCount: show.episodeCount,
      posterRel: show.posterRel,
      compressError: show.compressError
    };
    if (show.compressStatus === "encoding" || show.files.some((file) => file.rel === currentRel)) {
      encoding.push({ ...queueItem, compressStatus: "encoding" });
    } else if (show.compressStatus === "failed") failed.push(queueItem);
    else if (show.files.some((file) => file.compressStatus === "pending")) {
      pending.push({ ...queueItem, compressStatus: "pending" });
    }
  }
  return { pending, encoding, failed };
}

module.exports = {
  idFor,
  showTitleFromRel,
  scanFreezer,
  queueBuckets
};
