"use strict";

const fs = require("fs");
const path = require("path");
const { TornadoClient } = require("./tornado");
const { downloadHttpFile } = require("./http-download");
const { DownloadQueue } = require("./download-queue");
const { loadQueueState, saveQueueState, defaultStorePath } = require("./queue-store");
const { fileNameFromLink, episodeFileName, movieOutputPath, episodeOutputPath } = require("./download-paths");
const { normalizeDestination, DEVICE_TARGET_HEIGHT } = require("./download-queue");
const {
  pickArtworkUrlFromHtml,
  showFolderFromEpisodePath,
  saveArtworkFromUrl,
  saveShowPoster
} = require("./artwork");

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
    this.deviceRoot =
      options.deviceRoot || path.join(path.dirname(this.storePath), "device-downloads");
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
      posterUrl: movie.posterUrl,
      destination: movie.destination
    });
    if (result.ok) this.persist();
    return { ...result, ...this.status() };
  }

  enqueueEpisode(episode, options = {}) {
    if (this.queue.running) {
      return { ok: false, error: "Stop the queue before adding more episodes.", ...this.status() };
    }
    const result = this.queue.addEpisode(episode, {
      ...options,
      destination: options.destination || episode.destination
    });
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

  enqueueMany(entries, options = {}) {
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
    const result = this.queue.addMany(moviesOnly, { destination: options.destination });
    this.persist();
    return { ...result, ...this.status() };
  }

  remove(id) {
    const item = this.queue.items.find((entry) => entry.id === id);
    const result = this.queue.remove(id);
    if (result.ok) {
      if (item) this.removeDeviceFile(item);
      this.persist();
    }
    return { ...result, ...this.status() };
  }

  clear() {
    const deviceItems = this.queue.items.filter((item) => normalizeDestination(item.destination) === "device");
    const result = this.queue.clear();
    if (result.ok) {
      for (const item of deviceItems) this.removeDeviceFile(item);
      this.persist();
    }
    return { ...result, ...this.status() };
  }

  setDestination(destination) {
    const result = this.queue.setDestination(destination);
    this.persist();
    return { ...result, ...this.status() };
  }

  start(options = {}) {
    if (options.destination) this.queue.setDestination(options.destination);
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
    if (normalizeDestination(item.destination) === "device") {
      const fileName =
        item.kind === "episode"
          ? episodeFileName(item.season, item.episode, item.episodeTitle || item.title)
          : fileNameFromLink(linkUrl, item.title);
      fs.mkdirSync(this.deviceRoot, { recursive: true });
      return path.join(this.deviceRoot, fileName);
    }
    if (item.kind === "episode") {
      const dest = episodeOutputPath(this.videoRoot, item);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      return dest;
    }
    const fileName = fileNameFromLink(linkUrl, item.title);
    return movieOutputPath(this.videoRoot, fileName);
  }

  deviceFilePath(item) {
    if (!item || normalizeDestination(item.destination) !== "device") return null;
    const name = String(item.deviceFile || "").replace(/^.*[\\/]/, "");
    if (!name || name === "." || name === "..") return null;
    const root = path.resolve(this.deviceRoot);
    const abs = path.resolve(root, name);
    if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) return null;
    return abs;
  }

  removeDeviceFile(item) {
    const abs = this.deviceFilePath(item);
    if (!abs) return;
    try {
      fs.unlinkSync(abs);
    } catch {
      // temp file may already be gone
    }
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

      const toDevice = normalizeDestination(queued.destination) === "device";
      const link = await this.client.findDirectLink(
        queued.movieUrl,
        toDevice ? { targetHeight: DEVICE_TARGET_HEIGHT } : {}
      );
      if (!link.ok) throw new Error(link.error);

      if (this.queue.cancelRequested) {
        this.queue.markSkipped(id, "Cancelled");
        this.persist();
        return;
      }

      const outputPath = this.outputPathFor(queued, link.best.url);
      this.queue.markDownloading(id);
      this.queue.patch(id, {
        qualityLabel: link.best.qualityLabel,
        progress: 12,
        deviceFile: toDevice ? path.basename(outputPath) : ""
      });
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

      if (!this.queue.cancelRequested && !toDevice) {
        await this.attachArtwork(queued, outputPath);
      }

      if (this.queue.cancelRequested) {
        this.queue.markSkipped(id, "Cancelled");
      } else {
        this.queue.markDone(id);
        if (toDevice) this.queue.patch(id, { deviceFile: path.basename(outputPath) });
        this.current = null;
        if (!toDevice && typeof this.onLibraryInvalidate === "function") this.onLibraryInvalidate();
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

module.exports = {
  DownloadRunner,
  DownloadQueue
};
