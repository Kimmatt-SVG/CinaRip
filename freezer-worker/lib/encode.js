"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { parseFfmpegProgress, encodePercent, copyFileWithProgress } = require("./progress");

const FREEZER_DIR = "Freezer";
const ORIGINALS_DIR = ".originals";
const COMPRESS_SIDECAR_SUFFIX = ".cinarip-compress.json";
const VIDEO_EXT_PATTERN = /\.(mp4|mkv|mov|m4v|webm|ts)$/i;
const MAX_RETRIES = 3;
const STALE_ENCODING_MS = 3 * 60 * 60 * 1000;

function fileSize(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() ? stat.size : 0;
  } catch {
    return 0;
  }
}

function toPosixRel(rel) {
  return String(rel || "")
    .split(/[/\\]/)
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function isOriginalVideoName(name) {
  return /\.original\.(mp4|mkv|mov|m4v|webm|ts)$/i.test(String(name || ""));
}

function isTempEncodeName(name) {
  return /\.cinarip-(?:freeze|compress|restore)\.tmp\./i.test(String(name || ""));
}

function sidecarPathForVideo(videoPath) {
  return `${videoPath}${COMPRESS_SIDECAR_SUFFIX}`;
}

function readSidecar(videoPath) {
  const filePath = sidecarPathForVideo(videoPath);
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeSidecar(videoPath, meta) {
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

function durationClose(sourceSec, encodedSec, toleranceSec = 2, toleranceRatio = 0.02) {
  const a = Number(sourceSec);
  const b = Number(encodedSec);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false;
  const allowed = Math.max(Number(toleranceSec) || 2, Math.abs(a) * (Number(toleranceRatio) || 0.02));
  return Math.abs(a - b) <= allowed;
}

function verifyEncoded(sourceProbe, destProbe, destSize, options = {}) {
  if (!destSize || destSize <= 0) {
    return { ok: false, reason: "encoded file is empty" };
  }
  if (!destProbe?.hasVideo) {
    return { ok: false, reason: "encoded file has no video stream" };
  }
  if (sourceProbe?.hasAudio && !destProbe.hasAudio) {
    return { ok: false, reason: "encoded file is missing audio" };
  }
  if (!sourceProbe?.hasAudio && !destProbe.hasAudio && !destProbe.hasVideo) {
    return { ok: false, reason: "encoded file has no audio or video" };
  }
  if (!durationClose(sourceProbe?.duration, destProbe?.duration, options.toleranceSec, options.toleranceRatio)) {
    return {
      ok: false,
      reason: `duration mismatch (source ${sourceProbe?.duration}s vs encoded ${destProbe?.duration}s)`
    };
  }
  return { ok: true };
}

function isStaleEncoding(meta, now = Date.now()) {
  if (meta?.status !== "encoding") return false;
  const updated = Date.parse(meta.updatedAt || "") || 0;
  if (!updated) return true;
  return now - updated > STALE_ENCODING_MS;
}

function originalVaultPath(videoRoot, playbackPath) {
  const freezerRoot = path.join(videoRoot, FREEZER_DIR);
  const rel = path.relative(freezerRoot, playbackPath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    const parsed = path.parse(playbackPath);
    return path.join(parsed.dir, `${parsed.name}.original${parsed.ext}`);
  }
  return path.join(freezerRoot, ORIGINALS_DIR, rel);
}

function findOriginal(videoRoot, playbackPath, meta) {
  if (meta?.originalRel) {
    const fromMeta = path.join(videoRoot, ...toPosixRel(meta.originalRel).split("/"));
    if (fs.existsSync(fromMeta) && fileSize(fromMeta) > 0) return fromMeta;
  }
  const vault = originalVaultPath(videoRoot, playbackPath);
  if (fs.existsSync(vault) && fileSize(vault) > 0) return vault;
  const parsed = path.parse(playbackPath);
  const exts = [".mp4", ".mkv", ".mov", ".m4v", ".webm", ".ts"];
  for (const ext of exts) {
    const sibling = path.join(parsed.dir, `${parsed.name}.original${ext}`);
    if (fs.existsSync(sibling) && fileSize(sibling) > 0) return sibling;
  }
  const vaultDir = path.dirname(vault);
  const base = path.basename(vault, path.extname(vault));
  if (fs.existsSync(vaultDir)) {
    for (const name of fs.readdirSync(vaultDir)) {
      if (!VIDEO_EXT_PATTERN.test(name) || isTempEncodeName(name)) continue;
      if (name.replace(VIDEO_EXT_PATTERN, "").toLowerCase() !== base.toLowerCase()) continue;
      const abs = path.join(vaultDir, name);
      if (fileSize(abs) > 0) return abs;
    }
  }
  return null;
}

function shouldEncode(playbackPath, options = {}) {
  const name = path.basename(playbackPath);
  if (isOriginalVideoName(name) || isTempEncodeName(name)) {
    return { skip: true, reason: "not a playback file" };
  }
  const meta = options.meta !== undefined ? options.meta : readSidecar(playbackPath);
  if (meta?.status === "done") return { skip: true, reason: "already compressed" };
  if (meta?.status === "restored") return { skip: true, reason: "original restored" };
  if (meta?.status === "encoding" && !isStaleEncoding(meta, options.now)) {
    return { skip: true, reason: "encoding in progress" };
  }
  if (meta?.status === "failed" && Number(meta.retries || 0) >= MAX_RETRIES) {
    return { skip: true, reason: "failed too many times" };
  }
  const originalAbs =
    options.originalAbs ||
    (options.videoRoot ? findOriginal(options.videoRoot, playbackPath, meta) : null);
  if (originalAbs && fs.existsSync(originalAbs) && !meta) {
    return { skip: true, reason: "already compressed" };
  }
  return { skip: false };
}

async function ensureOriginalCopy(videoRoot, playbackPath, onBytes) {
  const existing = findOriginal(videoRoot, playbackPath, readSidecar(playbackPath));
  if (existing && fileSize(existing) > 0) return { path: existing, copied: false };
  const dest = originalVaultPath(videoRoot, playbackPath);
  if (onBytes) {
    await copyFileWithProgress(playbackPath, dest, onBytes);
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(playbackPath, dest);
  }
  if (fileSize(dest) <= 0) {
    try {
      fs.unlinkSync(dest);
    } catch {
      // ignore
    }
    throw new Error("Original backup is empty");
  }
  return { path: dest, copied: true };
}

function parseProbeJson(raw) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw || "{}"));
  } catch {
    return { duration: 0, hasVideo: false, hasAudio: false };
  }
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const duration = Number(parsed.format?.duration || streams.find((stream) => stream.duration)?.duration || 0);
  return {
    duration,
    hasVideo: streams.some((stream) => stream.codec_type === "video"),
    hasAudio: streams.some((stream) => stream.codec_type === "audio")
  };
}

function runCommand(bin, args, options = {}) {
  const spawnFn = options.spawn || spawn;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnFn(bin, args, { windowsHide: true });
    } catch (error) {
      resolve({ ok: false, reason: error.message || "spawn failed", stdout: "", code: -1 });
      return;
    }
    let stdout = "";
    let stderr = "";
    if (child.stdout) child.stdout.on("data", (chunk) => { stdout += chunk; });
    if (child.stderr) child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      resolve({ ok: false, reason: error.message || "command failed", stdout, stderr, code: -1 });
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
        reason: code === 0 ? undefined : `exited ${code}`
      });
    });
  });
}

async function probeMedia(filePath, options = {}) {
  if (options.probeFn) return options.probeFn(filePath);
  const bin = options.ffprobeBin || "ffprobe";
  const result = await runCommand(
    bin,
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
    options
  );
  if (!result.ok) {
    return { duration: 0, hasVideo: false, hasAudio: false, error: result.reason || result.stderr };
  }
  return parseProbeJson(result.stdout);
}

async function encodeWithFfmpeg(srcPath, destTmpPath, options = {}) {
  if (options.encodeFn) return options.encodeFn(srcPath, destTmpPath);
  const bin = options.ffmpegBin || "ffmpeg";
  const threads = String(options.threads || process.env.FFMPEG_THREADS || "2");
  const crf = String(options.crf || process.env.FFMPEG_CRF || "24");
  const durationSec = Number(options.durationSec) || 0;
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-progress",
    "pipe:1",
    "-nostats",
    "-i",
    srcPath,
    "-threads",
    threads,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-vf",
    "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    "-c:v",
    "libx264",
    "-preset",
    options.preset || process.env.FFMPEG_PRESET || "medium",
    "-crf",
    crf,
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    destTmpPath
  ];
  const spawnFn = options.spawn || spawn;
  const result = await new Promise((resolve) => {
    let child;
    try {
      child = spawnFn(bin, args, { windowsHide: true });
    } catch (error) {
      resolve({ ok: false, reason: error.message || "ffmpeg spawn failed", code: -1 });
      return;
    }
    let parsed = {};
    let stderr = "";
    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        parsed = parseFfmpegProgress(chunk, parsed);
        if (options.onEncodeProgress) {
          options.onEncodeProgress({
            ...parsed,
            percent: encodePercent(parsed, durationSec),
            durationSec
          });
        }
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }
    child.on("error", (error) => {
      resolve({ ok: false, reason: error.message || "ffmpeg failed", stderr, code: -1 });
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code,
        stderr,
        progress: parsed,
        reason: code === 0 ? undefined : `ffmpeg exited ${code}`
      });
    });
  });
  if (!result.ok || fileSize(destTmpPath) <= 0) {
    try {
      fs.unlinkSync(destTmpPath);
    } catch {
      // ignore
    }
    return { ok: false, reason: result.reason || "ffmpeg output empty" };
  }
  return { ok: true, progress: result.progress };
}

async function replacePlaybackWithTemp(srcPath, tmpPath, options = {}) {
  const dir = path.dirname(srcPath);
  const base = path.basename(srcPath, path.extname(srcPath));
  const finalPath = path.join(dir, `${base}.mp4`);
  let staged = tmpPath;
  if (options.onUploadBytes) {
    const uploadTmp = `${finalPath}.cinarip-upload.tmp.mp4`;
    await copyFileWithProgress(tmpPath, uploadTmp, options.onUploadBytes);
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
    staged = uploadTmp;
  }
  if (path.resolve(finalPath) === path.resolve(srcPath)) {
    const bak = `${srcPath}.cinarip-compress.bak`;
    fs.renameSync(srcPath, bak);
    try {
      fs.renameSync(staged, srcPath);
      if (fileSize(srcPath) <= 0) throw new Error("encoded file is empty");
      fs.unlinkSync(bak);
      return srcPath;
    } catch (error) {
      try {
        if (fs.existsSync(staged)) fs.unlinkSync(staged);
      } catch {
        // ignore
      }
      if (!fs.existsSync(srcPath) && fs.existsSync(bak)) fs.renameSync(bak, srcPath);
      throw error;
    }
  }
  if (fs.existsSync(finalPath)) throw new Error("Encoded destination already exists");
  fs.renameSync(staged, finalPath);
  try {
    fs.unlinkSync(srcPath);
  } catch {
    // ignore
  }
  const oldSidecar = sidecarPathForVideo(srcPath);
  if (fs.existsSync(oldSidecar) && path.resolve(oldSidecar) !== path.resolve(sidecarPathForVideo(finalPath))) {
    try {
      fs.unlinkSync(oldSidecar);
    } catch {
      // ignore
    }
  }
  return finalPath;
}

async function compressPlaybackFile(playbackPath, options = {}) {
  const videoRoot = options.videoRoot;
  const notify = options.onProgress || (() => {});
  if (!videoRoot) return { ok: false, skipped: false, reason: "videoRoot required" };
  const meta = readSidecar(playbackPath);
  const decision = shouldEncode(playbackPath, { ...options, meta, videoRoot });
  if (decision.skip) {
    return { ok: true, skipped: true, reason: decision.reason, status: meta?.status || "done" };
  }

  const retries = Number(meta?.retries || 0);
  let originalAbs = null;
  const tmp = `${playbackPath}.cinarip-compress.tmp.mp4`;
  try {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  } catch {
    // ignore
  }

  try {
    const backup = await ensureOriginalCopy(videoRoot, playbackPath, (xfer) => {
      notify({
        stage: "download",
        percent: xfer.percent,
        bytesDone: xfer.copied,
        bytesTotal: xfer.total
      });
    });
    originalAbs = backup.path;
    writeSidecar(playbackPath, {
      status: "encoding",
      originalKept: true,
      originalRel: toPosixRel(path.relative(videoRoot, originalAbs)),
      retries,
      error: null,
      sourceSize: fileSize(playbackPath)
    });

    const sourceProbe = await probeMedia(playbackPath, options);
    if (!sourceProbe.hasVideo) {
      throw new Error("source has no video stream");
    }

    notify({
      stage: "encode",
      percent: 0,
      outTimeSec: 0,
      durationSec: sourceProbe.duration,
      fps: 0
    });
    const encoded = await encodeWithFfmpeg(playbackPath, tmp, {
      ...options,
      durationSec: sourceProbe.duration,
      onEncodeProgress: (progress) => {
        notify({
          stage: "encode",
          percent: progress.percent,
          outTimeSec: progress.outTimeSec,
          durationSec: progress.durationSec,
          fps: progress.fps,
          speed: progress.speed
        });
      }
    });
    if (!encoded.ok) throw new Error(encoded.reason || "ffmpeg encode failed");

    const destProbe = await probeMedia(tmp, options);
    const verified = verifyEncoded(sourceProbe, destProbe, fileSize(tmp), options);
    if (!verified.ok) throw new Error(verified.reason);

    notify({ stage: "upload", percent: 0, bytesDone: 0, bytesTotal: fileSize(tmp) });
    const finalPath = await replacePlaybackWithTemp(playbackPath, tmp, {
      onUploadBytes: (xfer) => {
        notify({
          stage: "upload",
          percent: xfer.percent,
          bytesDone: xfer.copied,
          bytesTotal: xfer.total
        });
      }
    });
    writeSidecar(finalPath, {
      status: "done",
      originalKept: true,
      originalRel: toPosixRel(path.relative(videoRoot, originalAbs)),
      retries: 0,
      error: null,
      sourceSize: sourceProbe.size || fileSize(originalAbs),
      encodedSize: fileSize(finalPath),
      sourceDurationSec: sourceProbe.duration,
      encodedDurationSec: destProbe.duration
    });
    notify({ stage: "done", percent: 100 });
    return {
      ok: true,
      skipped: false,
      status: "done",
      path: finalPath,
      originalKept: true
    };
  } catch (error) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      // ignore
    }
    try {
      const uploadTmp = `${path.join(path.dirname(playbackPath), `${path.basename(playbackPath, path.extname(playbackPath))}.mp4`)}.cinarip-upload.tmp.mp4`;
      if (fs.existsSync(uploadTmp)) fs.unlinkSync(uploadTmp);
    } catch {
      // ignore
    }
    const reason = error.message || "encode failed";
    writeSidecar(playbackPath, {
      status: "failed",
      originalKept: Boolean(originalAbs && fs.existsSync(originalAbs)),
      originalRel: originalAbs ? toPosixRel(path.relative(videoRoot, originalAbs)) : meta?.originalRel || null,
      retries: retries + 1,
      error: reason
    });
    return { ok: false, skipped: false, status: "failed", reason };
  }
}

module.exports = {
  FREEZER_DIR,
  ORIGINALS_DIR,
  COMPRESS_SIDECAR_SUFFIX,
  MAX_RETRIES,
  fileSize,
  toPosixRel,
  isOriginalVideoName,
  isTempEncodeName,
  sidecarPathForVideo,
  readSidecar,
  writeSidecar,
  durationClose,
  verifyEncoded,
  shouldEncode,
  originalVaultPath,
  findOriginal,
  ensureOriginalCopy,
  parseProbeJson,
  probeMedia,
  encodeWithFfmpeg,
  replacePlaybackWithTemp,
  compressPlaybackFile,
  parseFfmpegProgress,
  encodePercent
};
