const fs = require("fs");
const path = require("path");
const { createReadStream, createWriteStream } = require("fs");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");
const { scanMoviesFolder } = require("./download-library");
const { ensureNasFolder } = require("./nas-config");
const { relatedPosterFiles } = require("./poster-utils");

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".m4v", ".webm", ".ts"]);
const PROGRESS_THROTTLE_MS = 250;

function isVideoFileName(name) {
  return VIDEO_EXTENSIONS.has(path.extname(String(name || "")).toLowerCase());
}

function isPathInside(parentDir, childPath) {
  const parent = path.resolve(parentDir);
  const child = path.resolve(childPath);
  const rel = path.relative(parent, child);
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function destPathForLocalFile(localDir, nasDir, src) {
  const rel = path.relative(localDir, src);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    return path.join(nasDir, path.basename(src));
  }
  return path.join(nasDir, rel);
}

function nasFileComplete(src, dest) {
  try {
    if (!fs.existsSync(dest)) return false;
    const srcStat = fs.statSync(src);
    const destStat = fs.statSync(dest);
    return destStat.isFile() && destStat.size > 0 && destStat.size >= srcStat.size;
  } catch {
    return false;
  }
}

function relatedFilesForVideo(videoPath) {
  const files = [videoPath];
  for (const poster of relatedPosterFiles(videoPath)) {
    if (!files.includes(poster)) files.push(poster);
  }

  const logPath = `${videoPath}.log`;
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).isFile() && !files.includes(logPath)) {
      files.push(logPath);
    }
  } catch {
    // Ignore missing sidecar logs.
  }

  return files;
}

function videoEntriesFromLibrary(entries) {
  const videos = [];

  for (const entry of entries || []) {
    if (entry?.kind === "tv-show") {
      for (const episode of entry.episodes || []) {
        if (episode?.filePath && isVideoFileName(episode.fileName || episode.filePath)) {
          videos.push(episode);
        }
      }
      continue;
    }

    if (entry?.filePath && isVideoFileName(entry.fileName || entry.filePath)) {
      videos.push(entry);
    }
  }

  return videos;
}

function buildSyncTasks(movies, localDir, nasDir) {
  const tasks = [];
  let skippedVideos = 0;

  for (const movie of videoEntriesFromLibrary(movies)) {
    const related = relatedFilesForVideo(movie.filePath);
    let pendingForVideo = 0;

    for (const src of related) {
      let size = 0;
      try {
        const stat = fs.statSync(src);
        if (!stat.isFile()) continue;
        size = stat.size;
      } catch {
        continue;
      }

      const dest = destPathForLocalFile(localDir, nasDir, src);
      const alreadyOnNas = nasFileComplete(src, dest);
      if (alreadyOnNas) {
        tasks.push({
          src,
          dest,
          fileName: path.basename(src),
          movieFileName: movie.fileName || path.basename(movie.filePath),
          size,
          skipCopy: true,
          isVideo: isVideoFileName(src)
        });
        continue;
      }

      pendingForVideo += 1;
      tasks.push({
        src,
        dest,
        fileName: path.basename(src),
        movieFileName: movie.fileName || path.basename(movie.filePath),
        size,
        skipCopy: false,
        isVideo: isVideoFileName(src)
      });
    }

    if (!pendingForVideo && related.some((src) => isVideoFileName(src))) {
      skippedVideos += 1;
    }
  }

  const copyTasks = tasks.filter((task) => !task.skipCopy);
  return {
    tasks,
    skippedVideos,
    totalBytes: copyTasks.reduce((sum, task) => sum + task.size, 0)
  };
}

function createThrottledProgress(onChunk, totalBytes, startOffset = 0, shouldContinue = () => true) {
  let copiedBytes = startOffset;
  let lastEmit = 0;

  const emit = (force = false) => {
    if (!shouldContinue()) return;
    const now = Date.now();
    if (!force && now - lastEmit < PROGRESS_THROTTLE_MS && copiedBytes < totalBytes) {
      return;
    }
    lastEmit = now;
    try {
      onChunk?.({ copiedBytes, totalBytes });
    } catch {
      // Progress listener may fail if the renderer closed.
    }
  };

  const transform = new Transform({
    transform(chunk, _encoding, callback) {
      if (!shouldContinue()) {
        callback(new Error("Copy cancelled"));
        return;
      }
      copiedBytes += chunk.length;
      emit();
      callback(null, chunk);
    },
    flush(callback) {
      if (shouldContinue()) emit(true);
      callback();
    }
  });

  return { transform, emit };
}

async function getResumeState(src, dest, totalBytes) {
  try {
    if (!fs.existsSync(dest)) {
      return { startOffset: 0, writeFlags: "w" };
    }

    const destStat = await fs.promises.stat(dest);
    if (destStat.size >= totalBytes) {
      return { startOffset: totalBytes, writeFlags: null, complete: true };
    }

    if (destStat.size > 0) {
      return { startOffset: destStat.size, writeFlags: "a" };
    }
  } catch {
    // Fall back to a fresh copy.
  }

  return { startOffset: 0, writeFlags: "w" };
}

async function copyFileWithProgress(src, dest, onChunk, shouldContinue = () => true) {
  const stat = await fs.promises.stat(src);
  if (!stat.isFile()) {
    throw new Error(`Cannot copy "${src}" because it is not a file.`);
  }

  const totalBytes = stat.size;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const resume = await getResumeState(src, dest, totalBytes);

  if (resume.complete) {
    try {
      onChunk?.({ copiedBytes: totalBytes, totalBytes });
    } catch {
      // Ignore progress listener failures.
    }
    return totalBytes;
  }

  const { transform, emit } = createThrottledProgress(
    onChunk,
    totalBytes,
    resume.startOffset,
    shouldContinue
  );
  const readStream = createReadStream(
    src,
    resume.startOffset > 0 ? { start: resume.startOffset } : undefined
  );
  const writeStream = createWriteStream(dest, { flags: resume.writeFlags || "w" });

  if (resume.startOffset > 0) {
    emit(true);
  }

  try {
    await pipeline(readStream, transform, writeStream);
  } catch (error) {
    if (error?.message === "Copy cancelled") {
      readStream.destroy();
      writeStream.destroy();
      throw error;
    }
    throw error;
  }

  emit(true);
  return totalBytes;
}

function deleteLocalFile(filePath, localDir) {
  try {
    if (!isPathInside(localDir, filePath)) return false;
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function removeEmptyParents(startDir, stopDir) {
  let current = path.resolve(startDir);
  const root = path.resolve(stopDir);

  for (let i = 0; i < 12; i++) {
    if (!current || current === root || !isPathInside(root, current)) break;
    let names;
    try {
      names = fs.readdirSync(current);
    } catch {
      break;
    }
    if (names.length) break;
    try {
      fs.rmdirSync(current);
    } catch {
      break;
    }
    current = path.dirname(current);
  }
}

function createProgressEmitter(onProgress, shouldContinue = () => true) {
  let lastEmit = 0;

  return (payload) => {
    if (!shouldContinue()) return;
    const now = Date.now();
    const force =
      payload.phase === "preparing" || payload.phase === "complete" || payload.phase === "removing";
    if (!force && now - lastEmit < PROGRESS_THROTTLE_MS) {
      return;
    }
    lastEmit = now;
    try {
      onProgress?.(payload);
    } catch {
      // Progress listener may fail if the renderer closed.
    }
  };
}

async function syncLocalMoviesToNas(localDir, nasDir, onProgress, options = {}) {
  const shouldContinue = options.shouldContinue || (() => true);
  const local = scanMoviesFolder(localDir, "local");
  if (!local.accessible) {
    return { ok: false, error: "Local Movies folder is not accessible." };
  }

  const nasAccess = ensureNasFolder(nasDir);
  if (!nasAccess.ok) {
    return {
      ok: false,
      error: nasAccess.error,
      needsCredentials: Boolean(nasAccess.needsCredentials)
    };
  }

  const emitProgress = createProgressEmitter(onProgress, shouldContinue);
  const movies = local.movies;
  const videoCount = videoEntriesFromLibrary(movies).length;

  emitProgress({
    phase: "preparing",
    fileName: null,
    index: 0,
    total: videoCount,
    copied: 0,
    skipped: 0,
    failed: 0,
    removed: 0,
    fileBytes: 0,
    fileTotalBytes: 0,
    overallBytes: 0,
    overallTotalBytes: 0,
    overallPercent: null
  });

  const { tasks, skippedVideos, totalBytes } = buildSyncTasks(movies, localDir, nasDir);
  let overallBytes = 0;
  const copiedVideos = new Set();
  const removedVideos = new Set();
  let failed = 0;
  let removed = 0;
  const errors = [];
  const localDirsToClean = new Set();

  const emitCopyProgress = (overrides = {}) => {
    emitProgress({
      phase: "copying",
      copied: copiedVideos.size,
      skipped: skippedVideos,
      failed,
      removed,
      overallBytes,
      overallTotalBytes: totalBytes,
      overallPercent:
        totalBytes > 0 ? Math.min(99, Math.round((overallBytes / totalBytes) * 100)) : null,
      ...overrides
    });
  };

  for (let index = 0; index < tasks.length; index += 1) {
    if (!shouldContinue()) break;

    const task = tasks[index];
    emitCopyProgress({
      fileName: task.fileName,
      movieFileName: task.movieFileName,
      index: index + 1,
      total: tasks.length,
      fileBytes: task.skipCopy ? task.size : 0,
      fileTotalBytes: task.size
    });

    try {
      if (!task.skipCopy) {
        await copyFileWithProgress(
          task.src,
          task.dest,
          ({ copiedBytes, totalBytes: fileTotal }) => {
            emitCopyProgress({
              fileName: task.fileName,
              movieFileName: task.movieFileName,
              index: index + 1,
              total: tasks.length,
              fileBytes: copiedBytes,
              fileTotalBytes: fileTotal,
              overallBytes: overallBytes + copiedBytes,
              overallPercent:
                totalBytes > 0
                  ? Math.min(99, Math.round(((overallBytes + copiedBytes) / totalBytes) * 100))
                  : null
            });
          },
          shouldContinue
        );
        overallBytes += task.size;
        if (task.isVideo) copiedVideos.add(task.movieFileName);
      }

      if (!nasFileComplete(task.src, task.dest)) {
        throw new Error("NAS copy could not be verified.");
      }

      emitProgress({
        phase: "removing",
        fileName: task.fileName,
        movieFileName: task.movieFileName,
        index: index + 1,
        total: tasks.length,
        copied: copiedVideos.size,
        skipped: skippedVideos,
        failed,
        removed,
        fileBytes: task.size,
        fileTotalBytes: task.size,
        overallBytes,
        overallTotalBytes: totalBytes,
        overallPercent:
          totalBytes > 0 ? Math.min(99, Math.round((overallBytes / totalBytes) * 100)) : 100
      });

      if (deleteLocalFile(task.src, localDir)) {
        removed += 1;
        localDirsToClean.add(path.dirname(task.src));
        if (task.isVideo) removedVideos.add(task.movieFileName);
      }
    } catch (error) {
      if (error?.message === "Copy cancelled") {
        break;
      }
      failed += 1;
      errors.push({
        fileName: task.fileName,
        error: error.message || String(error)
      });
    }
  }

  for (const dir of localDirsToClean) {
    removeEmptyParents(dir, localDir);
  }

  const copied = copiedVideos.size;

  emitProgress({
    phase: "complete",
    fileName: null,
    index: tasks.length,
    total: tasks.length,
    copied,
    skipped: skippedVideos,
    failed,
    removed: removedVideos.size,
    fileBytes: 0,
    fileTotalBytes: 0,
    overallBytes,
    overallTotalBytes: totalBytes,
    overallPercent: 100
  });

  return {
    ok: true,
    copied,
    skipped: skippedVideos,
    failed,
    removed: removedVideos.size,
    total: videoCount,
    errors
  };
}

module.exports = {
  syncLocalMoviesToNas
};
