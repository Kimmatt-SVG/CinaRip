"use strict";

const fs = require("fs");
const path = require("path");

const COMPRESS_SIDECAR_SUFFIX = ".cinarip-compress.json";
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];
const VIDEO_EXTS = [".mp4", ".mkv", ".mov", ".m4v", ".webm", ".ts"];
const LEFTOVER_NAMES = new Set([
  "poster.jpg",
  "poster.jpeg",
  "poster.png",
  "poster.webp",
  "folder.jpg",
  "cover.jpg",
  ".ds_store",
  "thumbs.db"
]);

function toPosixRel(rel) {
  const parts = String(rel || "").split(/[/\\]/);
  if (parts.some((part) => part === "..")) throw new Error("Path is outside the video library");
  return parts.filter((part) => part && part !== ".").join("/");
}

function absFromRel(videoRoot, rel) {
  const parts = toPosixRel(rel).split("/").filter(Boolean);
  if (!parts.length) throw new Error("Missing library path");
  const root = path.resolve(videoRoot);
  const abs = path.resolve(root, ...parts);
  if (abs === root || abs === root + path.sep) throw new Error("Refusing to delete the video root");
  if (!abs.startsWith(root + path.sep)) throw new Error("Path is outside the video library");
  return abs;
}

function unlinkFile(filePath) {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function pruneEmptyDirs(videoRoot, startDir) {
  const root = path.resolve(videoRoot);
  let walk = path.resolve(startDir);
  while (walk && walk.startsWith(root + path.sep) && walk !== root) {
    let names;
    try {
      names = fs.readdirSync(walk);
    } catch {
      break;
    }
    const leftovers = names.filter((name) => !LEFTOVER_NAMES.has(String(name).toLowerCase()));
    if (leftovers.length) break;
    try {
      for (const name of names) unlinkFile(path.join(walk, name));
      fs.rmdirSync(walk);
    } catch {
      break;
    }
    walk = path.dirname(walk);
  }
}

function relatedFiles(videoAbs) {
  const parsed = path.parse(videoAbs);
  const base = path.join(parsed.dir, parsed.name);
  const files = [
    videoAbs,
    `${videoAbs}${COMPRESS_SIDECAR_SUFFIX}`,
    `${base}${COMPRESS_SIDECAR_SUFFIX}`
  ];
  for (const ext of IMAGE_EXTS) {
    files.push(`${base}${ext}`, `${base}-poster${ext}`);
  }
  for (const ext of VIDEO_EXTS) {
    files.push(path.join(parsed.dir, `${parsed.name}.original${ext}`));
  }
  return files;
}

function frozenOriginalAbs(videoRoot, rel) {
  const parts = toPosixRel(rel).split("/").filter(Boolean);
  if (!parts.length || !/^freezer$/i.test(parts[0]) || parts.length < 2) return null;
  return absFromRel(videoRoot, ["Freezer", ".originals", ...parts.slice(1)].join("/"));
}

function deleteVideoRel(videoRoot, rel) {
  const posix = toPosixRel(rel);
  const abs = absFromRel(videoRoot, posix);
  const removed = [];
  for (const filePath of relatedFiles(abs)) {
    if (unlinkFile(filePath)) {
      removed.push(path.relative(videoRoot, filePath).split(path.sep).join("/"));
    }
  }
  try {
    const original = frozenOriginalAbs(videoRoot, posix);
    if (original && unlinkFile(original)) {
      removed.push(path.relative(videoRoot, original).split(path.sep).join("/"));
      pruneEmptyDirs(videoRoot, path.dirname(original));
    }
  } catch {
    // originals path may not exist
  }
  pruneEmptyDirs(videoRoot, path.dirname(abs));
  return { ok: true, rel: posix, removed };
}

function deleteVideoRels(videoRoot, rels) {
  const list = Array.isArray(rels) ? rels : [rels];
  const removed = [];
  for (const rel of list) {
    if (!rel) continue;
    const result = deleteVideoRel(videoRoot, rel);
    removed.push(...result.removed);
  }
  return { ok: true, removed };
}

module.exports = {
  toPosixRel,
  absFromRel,
  pruneEmptyDirs,
  deleteVideoRel,
  deleteVideoRels
};
