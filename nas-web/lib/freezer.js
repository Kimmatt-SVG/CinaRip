"use strict";

const fs = require("fs");
const path = require("path");

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

module.exports = {
  FREEZER_DIR,
  TV_SHOWS_DIR,
  ORIGINALS_DIR,
  COMPRESS_SIDECAR_SUFFIX,
  toPosixRel,
  isFrozenRel,
  isOriginalVideoName,
  isTempEncodeName,
  isPlaybackVideoName,
  showTitleFromRel,
  classifyLibraryRel,
  classifyLibraryRels,
  freezerMovieDest,
  thawMovieDest,
  freezerShowDest,
  thawShowDest,
  freezerDestForRel,
  thawDestForRel,
  sidecarPathForVideo,
  sidecarPathsForVideo,
  readCompressSidecar,
  writeCompressSidecar,
  movePath,
  moveVideoWithSidecars,
  compressInfoForVideo,
  compressInfoForRels,
  resolveOriginalAbs,
  freezeMovie,
  thawMovie,
  freezeShow,
  thawShow,
  restoreOriginal,
  discardOriginal,
  writableNasError
};
